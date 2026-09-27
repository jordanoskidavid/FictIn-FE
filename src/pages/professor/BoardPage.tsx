import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { clearStoredSessionId } from "../../lib/activeSession";
import { useQrBoard } from "../../hooks/useQrBoard";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";

export function BoardPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { token, connection, ended } = useQrBoard(sessionId!);
  const [msLeft, setMsLeft] = useState(0);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [subjectId, setSubjectId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ subject_id: string }>(`/api/v1/sessions/${sessionId}`)
      .then((s) => setSubjectId(s.subject_id))
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    if (!token) return;
    const expiresAt = new Date(token.expires_at).getTime();
    const tick = () => setMsLeft(Math.max(0, expiresAt - Date.now()));
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (ended && subjectId) {
      clearStoredSessionId(subjectId);
    }
  }, [ended, subjectId]);

  async function handleStop() {
    if (!sessionId) return;
    setStopping(true);
    setError("");
    try {
      await api.post(`/api/v1/sessions/${sessionId}/stop`);
      if (subjectId) clearStoredSessionId(subjectId);
      navigate(subjectId ? `/professor/subjects/${subjectId}` : "/professor/subjects");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStopping(false);
    }
  }

  const qrValue = token ? JSON.stringify({ session_id: token.session_id, token: token.token }) : "";
  const pct = token ? Math.max(0, Math.min(100, (msLeft / 1500) * 100)) : 0;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-slate-950 px-4 text-white">
      <div className="flex items-center gap-3">
        <Badge tone={connection === "open" ? "green" : "amber"}>
          {connection === "open" ? "Connected" : "Connecting…"}
        </Badge>
        {ended && <Badge tone="neutral">Session ended</Badge>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {ended ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-medium">This session has ended.</p>
          <Button
            variant="secondary"
            onClick={() => navigate(subjectId ? `/professor/subjects/${subjectId}` : "/professor/subjects")}
          >
            Back to subject
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-6">
            {qrValue ? (
              <QRCodeSVG
                value={qrValue}
                size={360}
                level="M"
                role="img"
                aria-label="Attendance QR code"
              />
            ) : (
              <div className="flex h-[360px] w-[360px] items-center justify-center text-slate-400">
                Waiting for first token…
              </div>
            )}
          </div>

          <div className="h-1.5 w-80 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-100 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="text-sm text-slate-400">
            Students scan this code with the fictIn app. It refreshes automatically every second.
          </p>

          <Button variant="danger" onClick={handleStop} loading={stopping}>
            End session
          </Button>
        </>
      )}
    </div>
  );
}
