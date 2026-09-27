const PREFIX = "fictin_active_session_";

export function getStoredSessionId(subjectId: string): string | null {
  return localStorage.getItem(PREFIX + subjectId);
}

export function setStoredSessionId(subjectId: string, sessionId: string): void {
  localStorage.setItem(PREFIX + subjectId, sessionId);
}

export function clearStoredSessionId(subjectId: string): void {
  localStorage.removeItem(PREFIX + subjectId);
}
