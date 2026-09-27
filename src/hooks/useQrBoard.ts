import { useEffect, useRef, useState } from "react";
import { api, wsUrl } from "../lib/api";
import type { TokenMessage } from "../lib/types";

type ConnectionState = "connecting" | "open" | "closed";

export function useQrBoard(sessionId: string) {
  const [token, setToken] = useState<TokenMessage | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [ended, setEnded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let cancelled = false;
    let fellBackToPolling = false;

    function startPolling() {
      if (fellBackToPolling || cancelled) return;
      fellBackToPolling = true;
      setConnection("open");
      pollRef.current = setInterval(async () => {
        try {
          const msg = await api.get<TokenMessage>(`/api/v1/sessions/${sessionId}/qr/current`);
          if (!cancelled) setToken(msg);
        } catch {
          if (!cancelled) setEnded(true);
        }
      }, 1000);
    }

    function connect() {
      setConnection("connecting");
      socket = new WebSocket(wsUrl(`/ws/sessions/${sessionId}/qr`));

      const connectTimeout = setTimeout(() => {
        if (socket && socket.readyState !== WebSocket.OPEN) {
          socket.close();
          startPolling();
        }
      }, 4000);

      socket.onopen = () => {
        clearTimeout(connectTimeout);
        if (!cancelled) setConnection("open");
      };

      socket.onmessage = (event) => {
        clearTimeout(connectTimeout);
        try {
          const msg = JSON.parse(event.data) as TokenMessage;
          if (!cancelled) setToken(msg);
        } catch {
          // ignore malformed frame
        }
      };

      socket.onclose = (event) => {
        clearTimeout(connectTimeout);
        if (cancelled) return;
        if (event.code === 1000) {
          setEnded(true);
          setConnection("closed");
        } else if (!fellBackToPolling) {
          startPolling();
        }
      };

      socket.onerror = () => {
        clearTimeout(connectTimeout);
      };
    }

    connect();

    return () => {
      cancelled = true;
      socket?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId]);

  return { token, connection, ended };
}
