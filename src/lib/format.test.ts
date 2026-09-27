import { describe, expect, it } from "vitest";
import { formatDateTime, formatDayOfWeek, formatTime } from "./format";

describe("formatDayOfWeek", () => {
  it.each([
    [0, "Sunday"],
    [1, "Monday"],
    [6, "Saturday"],
  ])("maps %i to %s (backend uses 0 = Sunday)", (day, expected) => {
    expect(formatDayOfWeek(day)).toBe(expected);
  });

  it("falls back to the raw number for out-of-range values", () => {
    expect(formatDayOfWeek(7)).toBe("7");
    expect(formatDayOfWeek(-1)).toBe("-1");
  });
});

describe("formatTime", () => {
  it("trims seconds from HH:MM:SS", () => {
    expect(formatTime("09:30:00")).toBe("09:30");
  });

  it("leaves HH:MM unchanged", () => {
    expect(formatTime("14:05")).toBe("14:05");
  });
});

describe("formatDateTime", () => {
  it("renders a human-readable date instead of the raw ISO string", () => {
    const iso = "2026-09-13T10:15:30Z";

    const result = formatDateTime(iso);

    expect(result).not.toBe(iso);
    expect(result).toContain("2026");
  });
});
