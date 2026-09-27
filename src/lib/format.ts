const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDayOfWeek(day: number): string {
  return DAYS[day] ?? String(day);
}

export function formatTime(hhmm: string): string {
  return hhmm.slice(0, 5);
}
