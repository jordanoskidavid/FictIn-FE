import { describe, expect, it } from "vitest";
import { statusTone } from "./status";

describe("statusTone", () => {
  it.each([
    ["live", "green"],
    ["pending", "amber"],
    ["ended", "neutral"],
    ["something-new", "neutral"],
  ])("session status %s → %s badge", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});
