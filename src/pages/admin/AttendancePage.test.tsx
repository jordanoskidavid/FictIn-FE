import { screen, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { AdminAttendancePage } from "./AttendancePage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import { buildAttendanceRow } from "../../test/factories";
import { mockDownloads } from "../../test/downloads";

// The backend only accepts UUID filters, so the fixtures use real-looking UUIDs.
const SUBJECT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SUBJECT_B = "bbbbbbbb-0000-4000-8000-000000000002";
const STUDENT_ANA = "cccccccc-0000-4000-8000-000000000003";

function seedAttendance() {
  db.attendance = [
    buildAttendanceRow({
      subject_id: SUBJECT_A,
      subject_code: "CS101",
      subject_name: "Algorithms",
      student_id: STUDENT_ANA,
      student_name: "Ana Student",
      student_code: "S0001",
    }),
    buildAttendanceRow({
      subject_id: SUBJECT_B,
      subject_code: "MA201",
      subject_name: "Linear Algebra",
      student_name: "Mila Novak",
      student_code: undefined,
    }),
  ];
}

function renderPage() {
  return renderWithProviders(<AdminAttendancePage />, { authValue: {} });
}

/** Records every query string sent to the attendance endpoint. */
function captureQueries() {
  const queries: string[] = [];
  server.use(
    http.get("/api/v1/admin/attendance", ({ request }) => {
      queries.push(new URL(request.url).search);
      return undefined; // fall through to the default handler
    }),
  );
  return queries;
}

describe("Admin › Attendance", () => {
  it("prompts for a search and loads nothing up front", async () => {
    const queries = captureQueries();
    const { user } = renderPage();

    expect(screen.getByText("No results yet")).toBeInTheDocument();
    expect(screen.getByText("Run a search to see attendance records.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText("No matching records");
    expect(queries).toHaveLength(1); // only the search — nothing was fetched on mount
  });

  describe("searching", () => {
    it("lists every record when searching without filters", async () => {
      seedAttendance();
      const { user } = renderPage();

      await user.click(screen.getByRole("button", { name: "Search" }));

      const table = await screen.findByRole("table");
      expect(within(table).getAllByRole("row")).toHaveLength(3);
      const ana = screen.getByRole("row", { name: /Ana Student/ });
      expect(within(ana).getByRole("cell", { name: "CS101 — Algorithms" })).toBeInTheDocument();
      expect(within(ana).getByRole("cell", { name: "S0001" })).toBeInTheDocument();
      const mila = screen.getByRole("row", { name: /Mila Novak/ });
      expect(within(mila).getByRole("cell", { name: "—" })).toBeInTheDocument();
    });

    it("sends only the filled-in filters, trimmed", async () => {
      seedAttendance();
      const queries = captureQueries();
      const { user } = renderPage();

      await user.type(screen.getByLabelText("Subject ID"), `  ${SUBJECT_A}  `);
      await user.type(screen.getByLabelText("Session ID"), "   ");
      await user.click(screen.getByRole("button", { name: "Search" }));

      expect(await screen.findByRole("cell", { name: "Ana Student" })).toBeInTheDocument();
      expect(screen.queryByRole("cell", { name: "Mila Novak" })).not.toBeInTheDocument();
      expect(queries).toEqual([`?subject_id=${SUBJECT_A}`]);
    });

    it("combines filters", async () => {
      seedAttendance();
      const queries = captureQueries();
      const { user } = renderPage();

      await user.type(screen.getByLabelText("Subject ID"), SUBJECT_A);
      await user.type(screen.getByLabelText("Student ID"), STUDENT_ANA);
      await user.click(screen.getByRole("button", { name: "Search" }));

      await screen.findByRole("cell", { name: "Ana Student" });
      expect(queries).toEqual([`?subject_id=${SUBJECT_A}&student_id=${STUDENT_ANA}`]);
    });

    it("says so when nothing matches", async () => {
      seedAttendance();
      const { user } = renderPage();

      await user.type(screen.getByLabelText("Student ID"), "dddddddd-0000-4000-8000-000000000009");
      await user.click(screen.getByRole("button", { name: "Search" }));

      expect(await screen.findByText("No matching records")).toBeInTheDocument();
    });

    it("explains when a filter isn't a valid ID", async () => {
      const { user } = renderPage();

      await user.type(screen.getByLabelText("Session ID"), "not-a-uuid");
      await user.click(screen.getByRole("button", { name: "Search" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("That request wasn't valid.");
      expect(screen.getByText("No results yet")).toBeInTheDocument();
    });
  });

  describe("CSV download", () => {
    it("downloads the filtered records as attendance.csv", async () => {
      seedAttendance();
      const downloads = mockDownloads();
      const queries = captureQueries();
      const { user } = renderPage();

      await user.type(screen.getByLabelText("Subject ID"), SUBJECT_A);
      await user.click(screen.getByRole("button", { name: "Download CSV" }));

      await vi.waitFor(() => expect(downloads).toHaveLength(1));
      expect(downloads[0].filename).toBe("attendance.csv");
      const csv = await downloads[0].blob.text();
      expect(csv.split("\n")[0]).toBe(
        "record_id,session_id,subject_code,subject_name,student_code,student_name,scanned_at",
      );
      expect(csv).toContain("Ana Student");
      expect(csv).not.toContain("Mila Novak");
      expect(queries).toEqual([`?subject_id=${SUBJECT_A}&format=csv`]);
    });

    it("disables the button while the export is in progress", async () => {
      mockDownloads();
      server.use(http.get("/api/v1/admin/attendance", () => delay("infinite")));
      const { user } = renderPage();

      await user.click(screen.getByRole("button", { name: "Download CSV" }));

      expect(screen.getByRole("button", { name: "Download CSV" })).toBeDisabled();
    });

    it("shows a dismissible error when the export fails", async () => {
      const downloads = mockDownloads();
      server.use(http.get("/api/v1/admin/attendance", () => apiError(403, "FORBIDDEN")));
      const { user } = renderPage();

      await user.click(screen.getByRole("button", { name: "Download CSV" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You don't have permission to do that.",
      );
      expect(downloads).toHaveLength(0);

      await user.click(screen.getByRole("button", { name: "Dismiss" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
