import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { clearStoredSessionId } from "../../lib/activeSession";
import type { AttendanceRow, SessionView } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { PageSpinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { statusTone } from "../../lib/status";
import { Table, Thead, Th, Tbody, Td } from "../../components/ui/Table";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionView | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function loadAll() {
    setError("");
    try {
      const [s, a] = await Promise.all([
        api.get<SessionView>(`/api/v1/sessions/${sessionId}`),
        api.get<AttendanceRow[]>(`/api/v1/sessions/${sessionId}/attendance`),
      ]);
      setSession(s);
      setAttendance(a ?? []);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleStop() {
    if (!session) return;
    setStopping(true);
    setError("");
    try {
      const updated = await api.post<SessionView>(`/api/v1/sessions/${session.id}/stop`);
      setSession(updated);
      clearStoredSessionId(session.subject_id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStopping(false);
    }
  }

  if (!session) {
    return error ? <Banner tone="error">{error}</Banner> : <PageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Session</h1>
          <Badge tone={statusTone(session.status)}>{session.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Link to={`/professor/subjects/${session.subject_id}`}>
            <Button variant="ghost">Back to subject</Button>
          </Link>
          {session.status === "live" && (
            <>
              <Link to={`/professor/sessions/${session.id}/board`}>
                <Button variant="secondary">Open board</Button>
              </Link>
              <Button variant="danger" onClick={handleStop} loading={stopping}>
                Stop session
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <Banner tone="error" onDismiss={() => setError("")}>
          {error}
        </Banner>
      )}

      <Card>
        <CardHeader title="Details" />
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Started</dt>
            <dd className="font-medium text-slate-900">
              {session.started_at ? formatDateTime(session.started_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Ended</dt>
            <dd className="font-medium text-slate-900">
              {session.ended_at ? formatDateTime(session.ended_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">QR rotating</dt>
            <dd className="font-medium text-slate-900">{session.qr_rotating ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Present</dt>
            <dd className="font-medium text-slate-900">{attendance?.length ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Attendance"
          subtitle="Everyone marked present for this session."
          action={
            <Button variant="ghost" onClick={() => void loadAll()}>
              Refresh
            </Button>
          }
        />
        {attendance === null ? (
          <PageSpinner />
        ) : attendance.length === 0 ? (
          <EmptyState title="No one has scanned in yet" />
        ) : (
          <Table>
            <Thead>
              <Th>Student</Th>
              <Th>Code</Th>
              <Th>Scanned at</Th>
            </Thead>
            <Tbody>
              {attendance.map((row) => (
                <tr key={row.id}>
                  <Td>{row.student_name}</Td>
                  <Td>{row.student_code ?? "—"}</Td>
                  <Td>{formatDateTime(row.scanned_at)}</Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
