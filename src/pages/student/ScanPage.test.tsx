import { act, screen } from "@testing-library/react";
import { http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanPage } from "./ScanPage";
import { renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { apiError, ok } from "../../test/handlers";

// html5-qrcode needs a real camera, so we replace it with a fake scanner
// that lets the test "decode" any text it wants.
const camera = vi.hoisted(() => ({
  decode: undefined as ((text: string) => void) | undefined,
  cleared: 0,
}));

vi.mock("html5-qrcode", () => ({
  Html5QrcodeScanner: class {
    render(onSuccess: (text: string) => void) {
      camera.decode = onSuccess;
    }
    clear() {
      camera.cleared++;
      return Promise.resolve();
    }
  },
}));

const QR = JSON.stringify({ session_id: "session-1", token: "tok-123" });

async function scan(text: string) {
  await act(async () => camera.decode!(text));
}

function renderScanPage(options: { advanceTimers?: (ms: number) => unknown } = {}) {
  return renderWithProviders(<ScanPage />, { authValue: {}, ...options });
}

describe("ScanPage", () => {
  beforeEach(() => {
    camera.decode = undefined;
    camera.cleared = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits the scanned session and token and confirms attendance", async () => {
    let sentBody: unknown;
    server.use(
      http.post("/api/v1/attendance/scan", async ({ request }) => {
        sentBody = await request.json();
        return ok({ status: "marked" });
      }),
    );
    renderScanPage();

    await scan(QR);

    expect(await screen.findByRole("status")).toHaveTextContent("Marked present!");
    expect(sentBody).toEqual({ session_id: "session-1", token: "tok-123" });
  });

  it("tells the student when they were already marked present", async () => {
    server.use(http.post("/api/v1/attendance/scan", () => ok({ status: "already_marked" })));
    renderScanPage();

    await scan(QR);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're already marked present for this session.",
    );
  });

  it.each([
    [410, "TOKEN_EXPIRED", "That QR code expired — scan the current one."],
    [400, "TOKEN_INVALID", "That QR code isn't valid for this session."],
    [409, "SESSION_NOT_LIVE", "This session isn't live right now."],
    [403, "NOT_ENROLLED", "You're not enrolled in this subject."],
  ])("explains a %i %s error from the backend", async (status, code, message) => {
    server.use(http.post("/api/v1/attendance/scan", () => apiError(status, code)));
    renderScanPage();

    await scan(QR);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it.each([
    ["plain text", "https://example.com"],
    ["JSON without a token", JSON.stringify({ session_id: "session-1" })],
  ])("rejects a QR code that isn't a fictIn code (%s) without calling the API", async (_, text) => {
    let called = false;
    server.use(
      http.post("/api/v1/attendance/scan", () => {
        called = true;
        return ok({ status: "marked" });
      }),
    );
    renderScanPage();

    await scan(text);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That doesn't look like a fictIn attendance code.",
    );
    expect(called).toBe(false);
  });

  it("ignores repeat frames for 1.6s so one QR isn't submitted many times", async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.post("/api/v1/attendance/scan", () => {
        calls++;
        return ok({ status: "marked" });
      }),
    );
    renderScanPage({ advanceTimers: vi.advanceTimersByTime });

    await scan(QR);
    await screen.findByRole("status");
    await scan(QR);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await scan(QR);
    expect(calls).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(600));
    await scan(QR);

    await vi.waitFor(() => expect(calls).toBe(2));
  });

  it("lets the student dismiss the result banner", async () => {
    const { user } = renderScanPage();
    await scan(QR);
    await screen.findByRole("status");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("releases the camera when the page is left", () => {
    const { unmount } = renderScanPage();

    unmount();

    expect(camera.cleared).toBe(1);
  });
});
