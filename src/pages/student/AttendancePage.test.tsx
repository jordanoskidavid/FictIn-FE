import { screen, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { StudentAttendancePage } from "./AttendancePage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import { buildAttendanceRow } from "../../test/factories";

// This page only reads data, so a stub auth context is enough.
const renderPage = () => renderWithProviders(<StudentAttendancePage />, { authValue: {} });

describe("StudentAttendancePage", () => {
  it("shows a loading indicator while attendance is being fetched", async () => {
    server.use(http.get("/api/v1/student/attendance", () => delay("infinite")));

    renderPage();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an empty state when the student has no attendance", async () => {
    renderPage();

    expect(await screen.findByText("No attendance recorded yet")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
  });

  it("lists every attendance record with its subject", async () => {
    db.attendance = [
      buildAttendanceRow({ subject_code: "CS101", subject_name: "Algorithms" }),
      buildAttendanceRow({ subject_code: "MA201", subject_name: "Linear Algebra" }),
    ];

    renderPage();

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 records
    expect(within(table).getByRole("cell", { name: "CS101 — Algorithms" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "MA201 — Linear Algebra" })).toBeInTheDocument();
  });

  it("shows a friendly error when the request fails", async () => {
    server.use(http.get("/api/v1/student/attendance", () => apiError(403, "FORBIDDEN")));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have permission to do that.",
    );
  });
});
