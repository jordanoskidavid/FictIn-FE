import { act, renderHook, waitFor } from "@testing-library/react";
import { http, ws } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useQrBoard } from "./useQrBoard";
import { server } from "../test/server";
import { apiError, ok } from "../test/handlers";
import { buildTokenMessage } from "../test/factories";
import { setTokens } from "../lib/tokenStore";

// MSW intercepts the WebSocket the hook opens — no real socket is created.
const qrSocket = ws.link(`ws://${window.location.host}/ws/sessions/:sessionId/qr`);

describe("useQrBoard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("authenticates the socket with the access token query param", async () => {
    setTokens("access-prof", "refresh-prof");
    const connectedUrl = vi.fn();
    server.use(qrSocket.addEventListener("connection", ({ client }) => connectedUrl(client.url.href)));

    renderHook(() => useQrBoard("s1"));

    await waitFor(() => expect(connectedUrl).toHaveBeenCalled());
    expect(connectedUrl.mock.calls[0][0]).toContain("/ws/sessions/s1/qr?access_token=access-prof");
  });

  it("opens the socket and exposes each token the server pushes", async () => {
    const first = buildTokenMessage({ session_id: "s1" });
    const second = buildTokenMessage({ session_id: "s1" });
    server.use(
      qrSocket.addEventListener("connection", ({ client }) => {
        client.send(JSON.stringify(first));
        client.send(JSON.stringify(second));
      }),
    );

    const { result } = renderHook(() => useQrBoard("s1"));

    expect(result.current).toEqual({ token: null, connection: "connecting", ended: false });
    await waitFor(() => expect(result.current.token).toEqual(second));
    expect(result.current.connection).toBe("open");
    expect(result.current.ended).toBe(false);
  });

  it("ignores malformed frames and keeps the last good token", async () => {
    const good = buildTokenMessage();
    server.use(
      qrSocket.addEventListener("connection", ({ client }) => {
        client.send(JSON.stringify(good));
        client.send("not json {");
      }),
    );

    const { result } = renderHook(() => useQrBoard("s1"));

    await waitFor(() => expect(result.current.token).toEqual(good));
  });

  it("marks the session ended when the server closes normally (1000)", async () => {
    server.use(
      qrSocket.addEventListener("connection", ({ client }) => {
        client.close(1000, "session ended");
      }),
    );

    const { result } = renderHook(() => useQrBoard("s1"));

    await waitFor(() => expect(result.current.ended).toBe(true));
    expect(result.current.connection).toBe("closed");
  });

  describe("polling fallback", () => {
    it("polls the REST endpoint every second after an abnormal close", async () => {
      vi.useFakeTimers();
      const tokens = [buildTokenMessage(), buildTokenMessage()];
      let polls = 0;
      server.use(
        qrSocket.addEventListener("connection", ({ client }) => {
          client.close(1011, "server error");
        }),
        http.get("/api/v1/sessions/:sessionId/qr/current", () => ok(tokens[polls++ % 2])),
      );

      const { result } = renderHook(() => useQrBoard("s1"));
      await waitFor(() => expect(result.current.connection).toBe("open"));
      expect(polls).toBe(0);

      await act(() => vi.advanceTimersByTimeAsync(1000));
      await waitFor(() => expect(result.current.token).toEqual(tokens[0]));

      await act(() => vi.advanceTimersByTimeAsync(1000));
      await waitFor(() => expect(result.current.token).toEqual(tokens[1]));
      expect(result.current.ended).toBe(false);
    });

    it("marks the session ended when polling fails", async () => {
      vi.useFakeTimers();
      server.use(
        qrSocket.addEventListener("connection", ({ client }) => {
          client.close(1011);
        }),
        http.get("/api/v1/sessions/:sessionId/qr/current", () =>
          apiError(409, "SESSION_NOT_LIVE"),
        ),
      );

      const { result } = renderHook(() => useQrBoard("s1"));
      await waitFor(() => expect(result.current.connection).toBe("open"));

      await act(() => vi.advanceTimersByTimeAsync(1000));

      await waitFor(() => expect(result.current.ended).toBe(true));
    });

    it("stops polling on unmount", async () => {
      vi.useFakeTimers();
      let polls = 0;
      server.use(
        qrSocket.addEventListener("connection", ({ client }) => {
          client.close(1011);
        }),
        http.get("/api/v1/sessions/:sessionId/qr/current", () => {
          polls++;
          return ok(buildTokenMessage());
        }),
      );
      const { result, unmount } = renderHook(() => useQrBoard("s1"));
      await waitFor(() => expect(result.current.connection).toBe("open"));
      await act(() => vi.advanceTimersByTimeAsync(1000));
      await waitFor(() => expect(polls).toBe(1));

      unmount();
      await vi.advanceTimersByTimeAsync(5000);

      expect(polls).toBe(1);
    });
  });

  describe("connect timeout", () => {
    // MSW opens mocked sockets immediately, so it can't simulate a connection that hangs.
    // This is the one place we stub WebSocket by hand: a socket that never opens.
    // vi.stubGlobal is undone after the test (unstubGlobals in vitest.config.ts).
    class NeverOpeningSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 3;
      static instances: NeverOpeningSocket[] = [];
      readyState = NeverOpeningSocket.CONNECTING;
      onopen: (() => void) | null = null;
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((e: { code: number }) => void) | null = null;
      closeCalls = 0;
      url: string;

      constructor(url: string) {
        this.url = url;
        NeverOpeningSocket.instances.push(this);
      }

      close() {
        this.closeCalls++;
        if (this.readyState === NeverOpeningSocket.CLOSED) return;
        this.readyState = NeverOpeningSocket.CLOSED;
        // Browsers report an aborted handshake as an abnormal closure (1006).
        this.onclose?.({ code: 1006 });
      }
    }

    it("gives up on a socket that doesn't open within 4s and falls back to polling", async () => {
      vi.useFakeTimers();
      NeverOpeningSocket.instances = [];
      vi.stubGlobal("WebSocket", NeverOpeningSocket);
      const token = buildTokenMessage({ session_id: "s1" });
      let polls = 0;
      server.use(
        http.get("/api/v1/sessions/:sessionId/qr/current", () => {
          polls++;
          return ok(token);
        }),
      );

      const { result } = renderHook(() => useQrBoard("s1"));
      await act(() => vi.advanceTimersByTimeAsync(3999));

      expect(result.current.connection).toBe("connecting");
      expect(NeverOpeningSocket.instances[0].closeCalls).toBe(0);

      await act(() => vi.advanceTimersByTimeAsync(1));

      expect(NeverOpeningSocket.instances[0].closeCalls).toBe(1);
      expect(result.current.connection).toBe("open");
      expect(polls).toBe(0);

      await act(() => vi.advanceTimersByTimeAsync(1000));

      await waitFor(() => expect(result.current.token).toEqual(token));
      // close() fired onclose too, but only one polling loop may run.
      expect(polls).toBe(1);
      expect(NeverOpeningSocket.instances).toHaveLength(1);
    });

    it("closes the pending socket and never polls when unmounted before the timeout", async () => {
      vi.useFakeTimers();
      NeverOpeningSocket.instances = [];
      vi.stubGlobal("WebSocket", NeverOpeningSocket);
      let polls = 0;
      server.use(
        http.get("/api/v1/sessions/:sessionId/qr/current", () => {
          polls++;
          return ok(buildTokenMessage());
        }),
      );
      const { unmount } = renderHook(() => useQrBoard("s1"));
      await act(() => vi.advanceTimersByTimeAsync(2000));

      unmount();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(NeverOpeningSocket.instances[0].closeCalls).toBe(1);
      expect(polls).toBe(0);
    });
  });
});
