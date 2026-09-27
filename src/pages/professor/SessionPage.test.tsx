import { screen, within } from "@testing-library/react";
import { delay, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionPage } from "./SessionPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import { buildAttendanceRow, buildSession } from "../../test/factories";
import { getStoredSessionId, setStoredSessionId } from "../../lib/activeSession";

const SESSION_ID = "sess-1";
const SUBJECT_ID = "sub-1";

function renderSession() {
  return renderWithProviders(<SessionPage />, {
    route: `/professor/sessions/${SESSION_ID}`,
    path: "/professor/sessions/:sessionId",
    authValue: {},
  });
}

/** The <dd> value paired with a <dt> label in the Details card (semantic dt→dd pairing). */
function detail(label: string) {
  return screen.getByText(label).nextElementSibling;
}

describe("Professor › Session detail", () => {
  beforeEach(() => {
    db.sessions = [buildSession({ id: SESSION_ID, subject_id: SUBJECT_ID, status: "live" })];
  });

  it("shows a spinner while loading", () => {
    server.use(http.get("/api/v1/sessions/:id", () => delay("infinite")));

    renderSession();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("shows an error when the session can't be loaded", async () => {
    db.sessions = [];

    renderSession();

    expect(await screen.findByRole("alert")).toHaveTextContent("That couldn't be found.");
  });

  it("shows the session's status and details", async () => {
    db.attendance = [
      buildAttendanceRow({ session_id: SESSION_ID }),
      buildAttendanceRow({ session_id: SESSION_ID }),
      buildAttendanceRow({ session_id: "another-session" }),
    ];

    renderSession();

    expect(await screen.findByRole("heading", { name: "Session" })).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
    expect(detail("QR rotating")).toHaveTextContent("Yes");
    expect(detail("Present")).toHaveTextContent("2");
    expect(detail("Ended")).toHaveTextContent("—");
    expect(screen.getByRole("link", { name: "Back to subject" })).toHaveAttribute(
      "href",
      `/professor/subjects/${SUBJECT_ID}`,
    );
  });

  describe("attendance list", () => {
    it("lists every student marked present", async () => {
      db.attendance = [
        buildAttendanceRow({ session_id: SESSION_ID, student_name: "Ana Student", student_code: "S0001" }),
        buildAttendanceRow({ session_id: SESSION_ID, student_name: "Mila Novak", student_code: undefined }),
      ];

      renderSession();

      const table = await screen.findByRole("table");
      expect(within(table).getAllByRole("row")).toHaveLength(3);
      expect(within(screen.getByRole("row", { name: /Ana Student/ })).getByRole("cell", { name: "S0001" }))
        .toBeInTheDocument();
      expect(within(screen.getByRole("row", { name: /Mila Novak/ })).getByRole("cell", { name: "—" }))
        .toBeInTheDocument();
    });

    it("shows an empty state before anyone scans in", async () => {
      renderSession();

      expect(await screen.findByText("No one has scanned in yet")).toBeInTheDocument();
    });

    it("picks up new scans when refreshed", async () => {
      const { user } = renderSession();
      await screen.findByText("No one has scanned in yet");
      db.attendance.push(buildAttendanceRow({ session_id: SESSION_ID, student_name: "Late Larry" }));

      await user.click(screen.getByRole("button", { name: "Refresh" }));

      expect(await screen.findByRole("cell", { name: "Late Larry" })).toBeInTheDocument();
      expect(detail("Present")).toHaveTextContent("1");
    });
  });

  describe("live session controls", () => {
    it("links to the QR board", async () => {
      renderSession();

      expect(await screen.findByRole("link", { name: "Open board" })).toHaveAttribute(
        "href",
        `/professor/sessions/${SESSION_ID}/board`,
      );
    });

    it("stops the session, shows it as ended and forgets it", async () => {
      setStoredSessionId(SUBJECT_ID, SESSION_ID);
      const { user } = renderSession();

      await user.click(await screen.findByRole("button", { name: "Stop session" }));

      expect(await screen.findByText("ended")).toBeInTheDocument();
      expect(detail("QR rotating")).toHaveTextContent("No");
      expect(screen.queryByRole("button", { name: "Stop session" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Open board" })).not.toBeInTheDocument();
      expect(getStoredSessionId(SUBJECT_ID)).toBeNull();
    });

    it("shows the error and stays live when stopping fails", async () => {
      setStoredSessionId(SUBJECT_ID, SESSION_ID);
      server.use(http.post("/api/v1/sessions/:id/stop", () => apiError(500, "INTERNAL")));
      const { user } = renderSession();

      await user.click(await screen.findByRole("button", { name: "Stop session" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our end.");
      expect(screen.getByRole("button", { name: "Stop session" })).toBeInTheDocument();
      expect(getStoredSessionId(SUBJECT_ID)).toBe(SESSION_ID);
    });

    it("hides the controls for a session that has already ended", async () => {
      db.sessions = [buildSession({ id: SESSION_ID, subject_id: SUBJECT_ID, status: "ended" })];

      renderSession();

      expect(await screen.findByText("ended")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Stop session" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Open board" })).not.toBeInTheDocument();
    });
  });
});
