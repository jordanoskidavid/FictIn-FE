import { ApiError } from "./api";

const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "You need to sign in again.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "That couldn't be found.",
  CONFLICT: "That conflicts with existing data.",
  VALIDATION_ERROR: "Please check the form and try again.",
  BAD_REQUEST: "That request wasn't valid.",
  RATE_LIMITED: "You're going too fast — slow down and try again.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  ACCOUNT_INACTIVE: "This account has been deactivated.",
  PASSWORD_CHANGE_REQUIRED: "You need to change your password before continuing.",
  TOKEN_EXPIRED: "That QR code expired — scan the current one.",
  TOKEN_INVALID: "That QR code isn't valid for this session.",
  SESSION_NOT_LIVE: "This session isn't live right now.",
  NOT_ENROLLED: "You're not enrolled in this subject.",
  INTERNAL: "Something went wrong on our end.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return MESSAGES[err.code] ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
