import { screen, within } from "@testing-library/react";
import { delay, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectDetailPage } from "./SubjectDetailPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { RouteStub } from "../../test/RouteStub";
import { server } from "../../test/server";
import { apiError, db } from "../../test/handlers";
import {
  buildEnrollment,
  buildSchedule,
  buildSession,
  buildSubject,
  buildUser,
} from "../../test/factories";
import { getStoredSessionId, setStoredSessionId } from "../../lib/activeSession";

const SUBJECT_ID = "sub-1";

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/professor/subjects/:id" element={<SubjectDetailPage />} />
      <Route path="/professor/subjects" element={<RouteStub name="Subjects list" />} />
      <Route path="/professor/sessions/:sessionId/board" element={<RouteStub name="Board" />} />
    </Routes>,
    { route: `/professor/subjects/${SUBJECT_ID}`, authValue: {} },
  );
}

async function renderLoaded() {
  const result = renderDetail();
  await screen.findByRole("heading", { name: "Algorithms" });
  return result;
}

describe("Professor › Subject detail", () => {
  beforeEach(() => {
    db.subjects = [buildSubject({ id: SUBJECT_ID, name: "Algorithms", code: "CS101" })];
  });

  describe("loading", () => {
    it("shows a spinner until the subject arrives", () => {
      server.use(http.get("/api/v1/subjects/:id", () => delay("infinite")));

      renderDetail();

      expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    });

    it("shows the subject's name and code", async () => {
      renderDetail();

      expect(await screen.findByRole("heading", { name: "Algorithms" })).toBeInTheDocument();
      expect(screen.getByText("CS101")).toBeInTheDocument();
    });

    it("shows an error when the subject doesn't exist", async () => {
      db.subjects = [];

      renderDetail();

      expect(await screen.findByRole("alert")).toHaveTextContent("That couldn't be found.");
    });
  });

  describe("live session", () => {
    it("starts a session, remembers it and opens the board", async () => {
      const { user } = await renderLoaded();

      await user.click(screen.getByRole("button", { name: "Start session" }));

      expect(
        await screen.findByRole("heading", { name: /^Board at \/professor\/sessions\/.+\/board$/ }),
      ).toBeInTheDocument();
      const [started] = db.sessions;
      expect(started).toMatchObject({ subject_id: SUBJECT_ID, status: "live" });
      expect(getStoredSessionId(SUBJECT_ID)).toBe(started.id);
    });

    it("starts the session for the chosen schedule slot", async () => {
      db.schedules = [
        buildSchedule({
          id: "sched-1",
          subject_id: SUBJECT_ID,
          day_of_week: 3,
          start_time: "09:00:00",
          end_time: "10:30:00",
        }),
      ];
      let body: unknown;
      server.use(
        http.post("/api/v1/sessions/:subjectId/start", async ({ request }) => {
          body = await request.clone().json();
          return undefined; // fall through to the default handler
        }),
      );
      const { user } = await renderLoaded();

      await user.selectOptions(
        screen.getByLabelText("Schedule (optional)"),
        "Wednesday 09:00–10:30",
      );
      await user.click(screen.getByRole("button", { name: "Start session" }));

      await screen.findByRole("heading", { name: /^Board at / });
      expect(body).toEqual({ schedule_id: "sched-1" });
    });

    it("explains when a live session already exists", async () => {
      server.use(
        http.post("/api/v1/sessions/:subjectId/start", () =>
          apiError(409, "CONFLICT", "a live session already exists for this subject"),
        ),
      );
      const { user } = await renderLoaded();

      await user.click(screen.getByRole("button", { name: "Start session" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That conflicts with existing data.",
      );
      expect(screen.getByRole("button", { name: "Start session" })).toBeEnabled();
    });

    it("restores a live session remembered from a previous visit", async () => {
      const live = buildSession({ subject_id: SUBJECT_ID, status: "live" });
      db.sessions = [live];
      setStoredSessionId(SUBJECT_ID, live.id);

      renderDetail();

      expect(await screen.findByRole("button", { name: "Stop session" })).toBeInTheDocument();
      expect(screen.getByText("Live")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open board" })).toHaveAttribute(
        "href",
        `/professor/sessions/${live.id}/board`,
      );
      expect(screen.queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    });

    it.each([
      ["has ended", () => db.sessions.push(buildSession({ id: "old", status: "ended" }))],
      ["no longer exists", () => undefined],
    ])("forgets a remembered session that %s", async (_, seed) => {
      seed();
      setStoredSessionId(SUBJECT_ID, "old");

      await renderLoaded();

      expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
      await vi.waitFor(() => expect(getStoredSessionId(SUBJECT_ID)).toBeNull());
    });

    it("stops the live session and forgets it", async () => {
      const live = buildSession({ subject_id: SUBJECT_ID, status: "live" });
      db.sessions = [live];
      setStoredSessionId(SUBJECT_ID, live.id);
      const { user } = renderDetail();

      await user.click(await screen.findByRole("button", { name: "Stop session" }));

      expect(await screen.findByRole("button", { name: "Start session" })).toBeInTheDocument();
      expect(db.sessions[0].status).toBe("ended");
      expect(getStoredSessionId(SUBJECT_ID)).toBeNull();
    });

    it("keeps the session shown as live if stopping fails", async () => {
      const live = buildSession({ subject_id: SUBJECT_ID, status: "live" });
      db.sessions = [live];
      setStoredSessionId(SUBJECT_ID, live.id);
      server.use(http.post("/api/v1/sessions/:id/stop", () => apiError(500, "INTERNAL")));
      const { user } = renderDetail();

      await user.click(await screen.findByRole("button", { name: "Stop session" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our end.");
      expect(screen.getByRole("button", { name: "Stop session" })).toBeInTheDocument();
      expect(getStoredSessionId(SUBJECT_ID)).toBe(live.id);
    });
  });

  describe("weekly schedule", () => {
    it("shows an empty state when there are no slots", async () => {
      await renderLoaded();

      expect(screen.getByText("No schedule slots yet")).toBeInTheDocument();
    });

    it("lists existing slots with day, time and room", async () => {
      db.schedules = [
        buildSchedule({
          subject_id: SUBJECT_ID,
          day_of_week: 5,
          start_time: "14:00:00",
          end_time: "15:30:00",
          room: "B-12",
        }),
      ];

      await renderLoaded();

      const row = screen.getByRole("row", { name: /Friday/ });
      expect(within(row).getByRole("cell", { name: "14:00–15:30" })).toBeInTheDocument();
      expect(within(row).getByRole("cell", { name: "B-12" })).toBeInTheDocument();
    });

    it("adds a slot and shows it in the table", async () => {
      let body: unknown;
      server.use(
        http.post("/api/v1/subjects/:id/schedules", async ({ request }) => {
          body = await request.clone().json();
          return undefined;
        }),
      );
      const { user } = await renderLoaded();

      await user.selectOptions(screen.getByLabelText("Day"), "Wednesday");
      await user.clear(screen.getByLabelText("Start"));
      await user.type(screen.getByLabelText("Start"), "09:30");
      await user.clear(screen.getByLabelText("End"));
      await user.type(screen.getByLabelText("End"), "10:45");
      await user.type(screen.getByLabelText("Room (optional)"), "  C-3  ");
      await user.click(screen.getByRole("button", { name: "Add slot" }));

      const row = await screen.findByRole("row", { name: /Wednesday/ });
      expect(within(row).getByRole("cell", { name: "09:30–10:45" })).toBeInTheDocument();
      expect(body).toEqual({ day_of_week: 3, start_time: "09:30", end_time: "10:45", room: "C-3" });
      expect(screen.getByLabelText("Room (optional)")).toHaveValue("");
    });

    it("omits the room when it's left blank", async () => {
      let body: unknown;
      server.use(
        http.post("/api/v1/subjects/:id/schedules", async ({ request }) => {
          body = await request.clone().json();
          return undefined;
        }),
      );
      const { user } = await renderLoaded();

      await user.click(screen.getByRole("button", { name: "Add slot" }));

      await screen.findByRole("row", { name: /Monday/ });
      expect(body).toEqual({ day_of_week: 1, start_time: "10:00", end_time: "11:00" });
    });

    it("shows the error when the slot is rejected", async () => {
      server.use(
        http.post("/api/v1/subjects/:id/schedules", () => apiError(422, "VALIDATION_ERROR")),
      );
      const { user } = await renderLoaded();

      await user.click(screen.getByRole("button", { name: "Add slot" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Please check the form and try again.",
      );
      expect(screen.getByText("No schedule slots yet")).toBeInTheDocument();
    });
  });

  describe("roster", () => {
    it("lists enrolled students", async () => {
      db.enrollments = [
        buildEnrollment({ subject_id: SUBJECT_ID, full_name: "Ana Student", student_code: "S0100" }),
      ];

      await renderLoaded();

      expect(screen.getByText("1 enrolled student(s)")).toBeInTheDocument();
      const row = screen.getByRole("row", { name: /Ana Student/ });
      expect(within(row).getByRole("cell", { name: "S0100" })).toBeInTheDocument();
    });

    it("enrolls a student by student code", async () => {
      db.users = [buildUser({ role: "student", full_name: "Mila Novak", student_code: "S2026" })];
      let body: unknown;
      server.use(
        http.post("/api/v1/subjects/:id/enrollments", async ({ request }) => {
          body = await request.clone().json();
          return undefined;
        }),
      );
      const { user } = await renderLoaded();

      await user.type(screen.getByLabelText(/^Enroll student/), " S2026 ");
      await user.click(screen.getByRole("button", { name: "Enroll" }));

      expect(await screen.findByRole("cell", { name: "Mila Novak" })).toBeInTheDocument();
      expect(screen.getByText("1 enrolled student(s)")).toBeInTheDocument();
      expect(body).toEqual({ student_code: "S2026" });
      expect(screen.getByLabelText(/^Enroll student/)).toHaveValue("");
    });

    it("enrolls a student by their UUID", async () => {
      const id = "0b6f1c2e-8a4d-4c5e-9f10-123456789abc";
      db.users = [buildUser({ id, role: "student", full_name: "Mila Novak" })];
      let body: unknown;
      server.use(
        http.post("/api/v1/subjects/:id/enrollments", async ({ request }) => {
          body = await request.clone().json();
          return undefined;
        }),
      );
      const { user } = await renderLoaded();

      await user.type(screen.getByLabelText(/^Enroll student/), id);
      await user.click(screen.getByRole("button", { name: "Enroll" }));

      expect(await screen.findByRole("cell", { name: "Mila Novak" })).toBeInTheDocument();
      expect(body).toEqual({ student_id: id });
    });

    it("explains when the student can't be found", async () => {
      const { user } = await renderLoaded();

      await user.type(screen.getByLabelText(/^Enroll student/), "S9999");
      await user.click(screen.getByRole("button", { name: "Enroll" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("That couldn't be found.");
      expect(screen.getByText("No students enrolled yet")).toBeInTheDocument();
    });

    it("explains when the student is already enrolled", async () => {
      const student = buildUser({ role: "student", full_name: "Mila Novak", student_code: "S2026" });
      db.users = [student];
      db.enrollments = [
        buildEnrollment({ subject_id: SUBJECT_ID, student_id: student.id, full_name: "Mila Novak" }),
      ];
      const { user } = await renderLoaded();

      await user.type(screen.getByLabelText(/^Enroll student/), "S2026");
      await user.click(screen.getByRole("button", { name: "Enroll" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That conflicts with existing data.",
      );
      expect(screen.getAllByRole("cell", { name: "Mila Novak" })).toHaveLength(1);
    });
  });

  describe("deleting the subject", () => {
    it("deletes after confirmation and returns to the subjects list", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const { user } = await renderLoaded();

      await user.click(screen.getByRole("button", { name: "Delete subject" }));

      expect(
        await screen.findByRole("heading", { name: "Subjects list at /professor/subjects" }),
      ).toBeInTheDocument();
      expect(db.subjects).toHaveLength(0);
      expect(window.confirm).toHaveBeenCalledWith(
        "Delete Algorithms? This removes all schedules, enrollments, and attendance.",
      );
    });

    it("does nothing when the confirmation is cancelled", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const { user } = await renderLoaded();

      await user.click(screen.getByRole("button", { name: "Delete subject" }));

      expect(screen.getByRole("heading", { name: "Algorithms" })).toBeInTheDocument();
      expect(db.subjects).toHaveLength(1);
    });

    it("stays on the page and shows the error when deletion fails", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      server.use(http.delete("/api/v1/subjects/:id", () => apiError(403, "FORBIDDEN")));
      const { user } = await renderLoaded();

      await user.click(screen.getByRole("button", { name: "Delete subject" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You don't have permission to do that.",
      );
      expect(screen.getByRole("heading", { name: "Algorithms" })).toBeInTheDocument();
    });
  });
});
