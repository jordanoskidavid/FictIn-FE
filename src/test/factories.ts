import type {
  AttendanceRow,
  ClassSession,
  LoginResponse,
  Subject,
  TokenMessage,
  User,
} from "../lib/types";

// Test-data builders. Every builder returns a complete, valid object;
// pass overrides for only the fields your test cares about:
//   buildUser({ role: "admin", must_change_password: true })

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

const TIMESTAMP = "2026-09-13T10:00:00Z";

export function buildUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId("user");
  const role = overrides.role ?? "student";
  return {
    id,
    full_name: `Test ${role} ${id}`,
    email: `${id}@example.com`,
    role,
    student_code: role === "student" ? `S${seq.toString().padStart(4, "0")}` : undefined,
    is_active: true,
    must_change_password: false,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function buildSubject(overrides: Partial<Subject> = {}): Subject {
  const id = overrides.id ?? nextId("subject");
  return {
    id,
    name: `Subject ${id}`,
    code: `CS${100 + seq}`,
    professor_id: "professor-1",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

export function buildSession(overrides: Partial<ClassSession> = {}): ClassSession {
  return {
    id: nextId("session"),
    subject_id: "subject-1",
    status: "live",
    started_at: TIMESTAMP,
    created_at: TIMESTAMP,
    ...overrides,
  };
}

export function buildAttendanceRow(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    id: nextId("attendance"),
    session_id: "session-1",
    subject_id: "subject-1",
    subject_name: "Algorithms",
    subject_code: "CS101",
    student_id: "student-1",
    student_name: "Ana Student",
    student_code: "S0001",
    scanned_at: TIMESTAMP,
    ...overrides,
  };
}

export function buildTokenMessage(overrides: Partial<TokenMessage> = {}): TokenMessage {
  return {
    session_id: "session-1",
    token: nextId("qr-token"),
    issued_at: TIMESTAMP,
    expires_at: "2026-09-13T10:00:01.500Z",
    ...overrides,
  };
}

/** Tokens are `access-<userId>` so MSW handlers can tell who is calling. */
export function buildLoginResponse(user: User = buildUser()): LoginResponse {
  return {
    access_token: `access-${user.id}`,
    refresh_token: `refresh-${user.id}`,
    token_type: "Bearer",
    expires_in: 1800,
    user,
  };
}
