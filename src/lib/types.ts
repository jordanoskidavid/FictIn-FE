export type Role = "admin" | "professor" | "student";
export type SessionStatus = "pending" | "live" | "ended";

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  student_code?: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  professor_id: string;
  created_at: string;
  updated_at: string;
}

export interface ClassSchedule {
  id: string;
  subject_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
  created_at: string;
}

export interface ClassSession {
  id: string;
  subject_id: string;
  schedule_id?: string;
  status: SessionStatus;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface SessionView extends ClassSession {
  qr_rotating: boolean;
}

/** A subject's session history entry (GET /subjects/:id/sessions). */
export interface SessionSummary extends ClassSession {
  attendance_count: number;
}

export interface Enrollment {
  id: string;
  subject_id: string;
  student_id: string;
  created_at: string;
}

export interface EnrolledStudent {
  enrollment_id: string;
  student_id: string;
  full_name: string;
  email: string;
  student_code?: string;
  enrolled_at: string;
}

export interface AttendanceRow {
  id: string;
  session_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  student_id: string;
  student_name: string;
  student_code?: string;
  scanned_at: string;
}

export interface TokenMessage {
  session_id: string;
  token: string;
  issued_at: string;
  expires_at: string;
}

export interface SubjectDetail {
  subject: Subject;
  schedules: ClassSchedule[];
  roster: EnrolledStudent[];
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "BAD_REQUEST",
  "RATE_LIMITED",
  "INVALID_CREDENTIALS",
  "ACCOUNT_INACTIVE",
  "PASSWORD_CHANGE_REQUIRED",
  "TOKEN_EXPIRED",
  "TOKEN_INVALID",
  "SESSION_NOT_LIVE",
  "NOT_ENROLLED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
