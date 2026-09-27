import { http, HttpResponse } from "msw";
import type { AttendanceRow, Subject, User } from "../lib/types";
import { buildLoginResponse, buildUser } from "./factories";

// Default "happy path" handlers for the real backend API (see FrontendDirections.md).
// They read/write a tiny in-memory db that is reset after every test.
// Seed it in a test:        db.users.push(buildUser({ role: "admin" }))
// Override one endpoint:    server.use(http.get("/api/v1/...", () => apiError(500, "INTERNAL")))

export const TEST_PASSWORD = "correct-horse";

export const db = {
  users: [] as User[],
  subjects: [] as Subject[],
  attendance: [] as AttendanceRow[],
};

export function resetDb() {
  db.users = [];
  db.subjects = [];
  db.attendance = [];
}

/** Success envelope used by the backend: `{ data: ... }`. */
export function ok<T>(data: T, init?: ResponseInit) {
  return HttpResponse.json({ data }, init);
}

/** Error envelope used by the backend: `{ error: { code, message } }`. */
export function apiError(status: number, code: string, message = code) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

/** Resolves the caller from `Authorization: Bearer access-<userId>`. */
function currentUser(request: Request): User | undefined {
  const auth = request.headers.get("Authorization") ?? "";
  const id = auth.replace(/^Bearer access-/, "");
  return db.users.find((u) => u.id === id);
}

export const handlers = [
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
    return user ? ok(buildLoginResponse(user)) : apiError(401, "UNAUTHORIZED");
  }),

  http.post("/api/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),

  http.post("/api/v1/auth/change-password", () => new HttpResponse(null, { status: 204 })),

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
  http.get("/api/v1/admin/attendance", () => ok(db.attendance)),

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

  // ---- student ----
  http.get("/api/v1/student/subjects", () => ok(db.subjects)),
  http.get("/api/v1/student/attendance", () => ok(db.attendance)),
  http.post("/api/v1/attendance/scan", () =>
    ok({ status: "marked", scanned_at: "2026-09-13T10:15:31Z" }),
  ),
];
