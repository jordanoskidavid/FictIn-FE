import { http, HttpResponse } from "msw";
import type {
  AttendanceRow,
  ClassSchedule,
  EnrolledStudent,
  SessionView,
  Subject,
  User,
} from "../lib/types";
import {
  buildEnrollment,
  buildLoginResponse,
  buildSchedule,
  buildSession,
  buildTokenMessage,
  buildUser,
} from "./factories";

// Default "happy path" handlers mirroring the real Go backend (../fictin/internal/handlers;
// contract summarised in FrontendDirections.md — when they disagree, the backend code wins).
// They read/write a tiny in-memory db that is reset after every test.
// Seed it in a test:        db.users.push(buildUser({ role: "admin" }))
// Override one endpoint:    server.use(http.get("/api/v1/...", () => apiError(500, "INTERNAL")))

export const TEST_PASSWORD = "correct-horse";

export const db = {
  users: [] as User[],
  subjects: [] as Subject[],
  schedules: [] as ClassSchedule[],
  /** Roster entries; `subject_id` is test-only bookkeeping (see buildEnrollment). */
  enrollments: [] as (EnrolledStudent & { subject_id: string })[],
  sessions: [] as SessionView[],
  attendance: [] as AttendanceRow[],
};

export function resetDb() {
  db.users = [];
  db.subjects = [];
  db.schedules = [];
  db.enrollments = [];
  db.sessions = [];
  db.attendance = [];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strips the test-only `subject_id` so responses match the backend's roster shape. */
function toRoster(entry: (typeof db.enrollments)[number]): EnrolledStudent {
  const copy: Partial<typeof entry> = { ...entry };
  delete copy.subject_id;
  return copy as EnrolledStudent;
}

/** Quotes a field the way Go's encoding/csv does (commas, quotes, newlines). */
function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Same columns and headers as the backend's writeAttendanceCSV. */
function attendanceCsv(rows: AttendanceRow[]) {
  const header = "record_id,session_id,subject_code,subject_name,student_code,student_name,scanned_at";
  const lines = rows.map((r) =>
    [r.id, r.session_id, r.subject_code, r.subject_name, r.student_code ?? "", r.student_name, r.scanned_at]
      .map(csvField)
      .join(","),
  );
  return new HttpResponse([header, ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="attendance.csv"',
    },
  });
}

/** Start/stop return a plain ClassSession: no `qr_rotating` (that's only on GET /sessions/:id). */
function toClassSession(session: SessionView) {
  const copy: Partial<SessionView> = { ...session };
  delete copy.qr_rotating;
  return copy;
}

/** Success envelope used by the backend: `{ data: ... }`. */
export function ok<T>(data: T, init?: ResponseInit) {
  return HttpResponse.json({ data }, init);
}

/** Error envelope used by the backend: `{ error: { code, message, details? } }`. */
export function apiError(status: number, code: string, message = code, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

/** Resolves the caller from `Authorization: Bearer access-<userId>`. */
function currentUser(request: Request): User | undefined {
  const auth = request.headers.get("Authorization") ?? "";
  const id = auth.replace(/^Bearer access-/, "");
  return db.users.find((u) => u.id === id);
}

const PUBLIC_PATHS = ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"];
const PASSWORD_CHANGE_ALLOWED = ["/api/v1/auth/me", "/api/v1/auth/change-password"];

/** Parses "H:MM", "HH:MM" or "HH:MM:SS" into seconds since midnight, like the backend. */
function parseTimeOfDay(value: string | undefined): number | undefined {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value ?? "");
  if (!m) return undefined;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || s > 59) return undefined;
  return h * 3600 + min * 60 + s;
}

function formatTimeOfDay(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

export const handlers = [
  // Mirrors the backend auth middleware for a signed-in caller: a deactivated account's access
  // token stops working (401), and a pending temporary password blocks everything except
  // /auth/me and /auth/change-password (403). Returning nothing falls through to the route.
  http.all("/api/v1/*", ({ request }) => {
    const path = new URL(request.url).pathname;
    if (PUBLIC_PATHS.includes(path)) return;
    const user = currentUser(request);
    if (!user) return;
    if (!user.is_active) return apiError(401, "UNAUTHORIZED");
    if (user.must_change_password && !PASSWORD_CHANGE_ALLOWED.includes(path)) {
      return apiError(403, "PASSWORD_CHANGE_REQUIRED", "password change required");
    }
  }),

  // ---- auth ----
  http.post("/api/v1/auth/login", async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    const user = db.users.find((u) => u.email === email);
    if (!user || password !== TEST_PASSWORD) {
      return apiError(401, "INVALID_CREDENTIALS", "invalid email or password");
    }
    if (!user.is_active) return apiError(403, "ACCOUNT_INACTIVE");
    return ok(buildLoginResponse(user));
  }),

  http.get("/api/v1/auth/me", ({ request }) => {
    const user = currentUser(request);
    return user ? ok(user) : apiError(401, "UNAUTHORIZED");
  }),

  http.post("/api/v1/auth/refresh", async ({ request }) => {
    const { refresh_token } = (await request.json()) as { refresh_token: string };
    const user = db.users.find((u) => `refresh-${u.id}` === refresh_token);
    if (!user) return apiError(401, "UNAUTHORIZED");
    if (!user.is_active) return apiError(403, "ACCOUNT_INACTIVE");
    return ok(buildLoginResponse(user));
  }),

  http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),

  // Mirrors AuthHandler/AuthService.ChangePassword: 422 if new_password is shorter than 8
  // (request validation), 401 for a wrong current password, 422 if unchanged, else 200.
  http.post("/api/v1/auth/change-password", async ({ request }) => {
    const body = (await request.json()) as { current_password: string; new_password: string };
    if (!body.current_password || (body.new_password ?? "").length < 8) {
      return apiError(422, "VALIDATION_ERROR", "request validation failed");
    }
    if (body.current_password !== TEST_PASSWORD) {
      return apiError(401, "INVALID_CREDENTIALS", "invalid email or password");
    }
    if (body.new_password === body.current_password) {
      return apiError(422, "VALIDATION_ERROR", "request validation failed");
    }
    return ok({ status: "password_changed" });
  }),

  http.post("/api/v1/auth/register", async ({ request }) => {
    const body = (await request.json()) as Partial<User>;
    const user = buildUser({
      full_name: body.full_name,
      email: body.email,
      role: body.role,
      student_code: body.student_code,
      must_change_password: true,
    });
    db.users.push(user);
    return ok(user, { status: 201 });
  }),

  // ---- admin ----
  http.get("/api/v1/admin/users", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const role = params.get("role");
    const active = params.get("active");
    return ok(
      db.users.filter(
        (u) => (!role || u.role === role) && (!active || String(u.is_active) === active),
      ),
    );
  }),

  http.patch("/api/v1/admin/users/:id", async ({ params, request }) => {
    const user = db.users.find((u) => u.id === params.id);
    if (!user) return apiError(404, "NOT_FOUND");
    Object.assign(user, (await request.json()) as Partial<User>);
    return ok(user);
  }),

  http.delete("/api/v1/admin/users/:id", ({ params }) => {
    db.users = db.users.filter((u) => u.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/v1/admin/subjects", () => ok(db.subjects)),

  http.get("/api/v1/admin/attendance", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const filters = (["session_id", "subject_id", "student_id"] as const).filter((k) => params.get(k));
    const bad = filters.find((k) => !UUID_RE.test(params.get(k)!));
    if (bad) return apiError(400, "BAD_REQUEST", `${bad} must be a valid UUID`);
    const rows = db.attendance.filter((r) => filters.every((k) => r[k] === params.get(k)));
    return params.get("format") === "csv" ? attendanceCsv(rows) : ok(rows);
  }),

  // ---- professor ----
  http.get("/api/v1/subjects", () => ok(db.subjects)),

  http.post("/api/v1/subjects", async ({ request }) => {
    const { name, code } = (await request.json()) as { name: string; code: string };
    if (db.subjects.some((s) => s.code === code.toUpperCase())) {
      return apiError(409, "CONFLICT", "subject code already exists");
    }
    const subject: Subject = {
      id: `subject-${db.subjects.length + 1}`,
      name,
      code: code.toUpperCase(),
      professor_id: currentUser(request)?.id ?? "professor-1",
      created_at: "2026-09-13T10:00:00Z",
      updated_at: "2026-09-13T10:00:00Z",
    };
    db.subjects.push(subject);
    return ok(subject, { status: 201 });
  }),

  http.get("/api/v1/subjects/:id", ({ params }) => {
    const subject = db.subjects.find((s) => s.id === params.id);
    if (!subject) return apiError(404, "NOT_FOUND", "resource not found");
    return ok({
      subject,
      schedules: db.schedules.filter((s) => s.subject_id === subject.id),
      roster: db.enrollments.filter((e) => e.subject_id === subject.id).map(toRoster),
    });
  }),

  http.delete("/api/v1/subjects/:id", ({ params }) => {
    if (!db.subjects.some((s) => s.id === params.id)) return apiError(404, "NOT_FOUND");
    db.subjects = db.subjects.filter((s) => s.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/v1/subjects/:id/schedules", async ({ params, request }) => {
    const body = (await request.json()) as Partial<ClassSchedule>;
    const day = body.day_of_week ?? -1;
    const start = parseTimeOfDay(body.start_time);
    const end = parseTimeOfDay(body.end_time);
    if (day < 0 || day > 6) return apiError(422, "VALIDATION_ERROR", "day_of_week must be 0..6");
    if (start === undefined || end === undefined) {
      return apiError(422, "VALIDATION_ERROR", "start_time and end_time must be HH:MM or HH:MM:SS");
    }
    if (end <= start) {
      return apiError(422, "VALIDATION_ERROR", "end_time must be after start_time");
    }
    const schedule = buildSchedule({
      ...body,
      start_time: formatTimeOfDay(start),
      end_time: formatTimeOfDay(end),
      room: body.room,
      subject_id: String(params.id),
    });
    db.schedules.push(schedule);
    return ok(schedule, { status: 201 });
  }),

  http.post("/api/v1/subjects/:id/enrollments", async ({ params, request }) => {
    const body = (await request.json()) as { student_id?: string; student_code?: string };
    if (!body.student_id && !body.student_code) {
      return apiError(422, "VALIDATION_ERROR", "provide student_id or student_code");
    }
    if (body.student_id && !UUID_RE.test(body.student_id)) {
      return apiError(400, "BAD_REQUEST", "student_id must be a valid UUID");
    }
    const student = db.users.find((u) =>
      body.student_id ? u.id === body.student_id : u.student_code === body.student_code,
    );
    if (!student) return apiError(404, "NOT_FOUND", "student not found");
    if (student.role !== "student") return apiError(422, "VALIDATION_ERROR", "target user is not a student");
    if (!student.is_active) return apiError(422, "VALIDATION_ERROR", "student account is inactive");
    if (db.enrollments.some((e) => e.subject_id === params.id && e.student_id === student.id)) {
      return apiError(409, "CONFLICT", "student already enrolled");
    }
    const entry = buildEnrollment({
      subject_id: String(params.id),
      student_id: student.id,
      full_name: student.full_name,
      email: student.email,
      student_code: student.student_code,
    });
    db.enrollments.push(entry);
    return ok(
      { id: entry.enrollment_id, subject_id: entry.subject_id, student_id: student.id, created_at: entry.enrolled_at },
      { status: 201 },
    );
  }),

  // Mirrors SessionRepo.ListBySubject: newest first, each with its attendance count.
  http.get("/api/v1/subjects/:id/sessions", ({ params }) => {
    if (!db.subjects.some((s) => s.id === params.id)) return apiError(404, "NOT_FOUND", "resource not found");
    const sessions = db.sessions
      .filter((s) => s.subject_id === params.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => ({
        ...toClassSession(s),
        attendance_count: db.attendance.filter((r) => r.session_id === s.id).length,
      }));
    return ok(sessions);
  }),

  http.get("/api/v1/subjects/:id/enrollments", ({ params }) =>
    ok(db.enrollments.filter((e) => e.subject_id === params.id).map(toRoster)),
  ),

  // ---- sessions (":id" is a subject id for start, a session id otherwise) ----
  http.post("/api/v1/sessions/:subjectId/start", async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as { schedule_id?: string };
    if (body.schedule_id) {
      if (!UUID_RE.test(body.schedule_id)) {
        return apiError(400, "BAD_REQUEST", "schedule_id must be a valid UUID");
      }
      const schedule = db.schedules.find((s) => s.id === body.schedule_id);
      if (!schedule) return apiError(422, "VALIDATION_ERROR", "schedule_id not found");
      if (schedule.subject_id !== params.subjectId) {
        return apiError(422, "VALIDATION_ERROR", "schedule_id does not belong to this subject");
      }
    }
    const live = db.sessions.find((s) => s.subject_id === params.subjectId && s.status === "live");
    if (live) {
      const message = "a live session already exists for this subject";
      return apiError(409, "CONFLICT", message, { message, live_session_id: live.id });
    }
    const session = buildSession({ subject_id: String(params.subjectId), schedule_id: body.schedule_id });
    db.sessions.push(session);
    return ok(toClassSession(session), { status: 201 });
  }),

  http.post("/api/v1/sessions/:id/stop", ({ params }) => {
    const session = db.sessions.find((s) => s.id === params.id);
    if (!session) return apiError(404, "NOT_FOUND", "resource not found");
    if (session.status !== "live") return apiError(409, "CONFLICT", "session is not live");
    Object.assign(session, { status: "ended", ended_at: "2026-09-13T11:00:00Z", qr_rotating: false });
    return ok(toClassSession(session));
  }),

  http.get("/api/v1/sessions/:id", ({ params }) => {
    const session = db.sessions.find((s) => s.id === params.id);
    return session ? ok(session) : apiError(404, "NOT_FOUND");
  }),

  http.get("/api/v1/sessions/:id/attendance", ({ params }) =>
    ok(db.attendance.filter((r) => r.session_id === params.id)),
  ),

  http.get("/api/v1/sessions/:id/qr/current", ({ params }) => {
    const session = db.sessions.find((s) => s.id === params.id);
    if (!session) return apiError(404, "NOT_FOUND");
    if (session.status !== "live") return apiError(409, "SESSION_NOT_LIVE");
    return ok(buildTokenMessage({ session_id: session.id }));
  }),

  // ---- student ----
  http.get("/api/v1/student/subjects", () => ok(db.subjects)),
  http.get("/api/v1/student/attendance", () => ok(db.attendance)),
  http.post("/api/v1/attendance/scan", () =>
    ok({ status: "marked", scanned_at: "2026-09-13T10:15:31Z" }),
  ),
];
