import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("translates known API error codes into friendly copy", () => {
    const err = new ApiError(410, { code: "TOKEN_EXPIRED", message: "token expired" });

    expect(errorMessage(err)).toBe("That QR code expired — scan the current one.");
  });

  it("falls back to the server message for unknown API codes", () => {
    const err = new ApiError(418, { code: "TEAPOT", message: "I'm a teapot" });

    expect(errorMessage(err)).toBe("I'm a teapot");
  });

  it("uses the message of plain Errors", () => {
    expect(errorMessage(new Error("Network down"))).toBe("Network down");
  });

  it("returns a generic message for non-Error values", () => {
    expect(errorMessage("boom")).toBe("Something went wrong.");
    expect(errorMessage(undefined)).toBe("Something went wrong.");
  });
});
