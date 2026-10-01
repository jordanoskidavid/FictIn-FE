import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { formatDateTime, formatDayOfWeek, formatTime } from "../../lib/format";
import { statusTone } from "../../lib/status";
import { clearStoredSessionId, getStoredSessionId, setStoredSessionId } from "../../lib/activeSession";
import type { ClassSchedule, ClassSession, EnrolledStudent, SessionSummary, SubjectDetail } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { Banner } from "../../components/ui/Banner";
import { PageSpinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Table, Thead, Th, Tbody, Td } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";

/** The already-live session's id from a start-session CONFLICT (`details.live_session_id`). */
function liveSessionIdFromConflict(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== "CONFLICT") return null;
  const details = err.details as { live_session_id?: unknown } | null | undefined;
  return typeof details?.live_session_id === "string" ? details.live_session_id : null;
}

export function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const subjectId = id!;

  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [error, setError] = useState("");
  const [liveSession, setLiveSession] = useState<ClassSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [scheduleForStart, setScheduleForStart] = useState("");
  const [conflictSessionId, setConflictSessionId] = useState<string | null>(null);
  const [stoppingExisting, setStoppingExisting] = useState(false);
  const [sessionsVersion, setSessionsVersion] = useState(0);
  // Set after a stop here, or by the board's "End session" via router state.
  const [endedSessionId, setEndedSessionId] = useState<string | null>(
    (location.state as { endedSessionId?: string } | null)?.endedSessionId ?? null,
  );

  async function load() {
    setError("");
    try {
      const data = await api.get<SubjectDetail>(`/api/v1/subjects/${subjectId}`);
      setDetail(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function checkStoredSession() {
    const stored = getStoredSessionId(subjectId);
    if (!stored) return;
    try {
      const session = await api.get<ClassSession>(`/api/v1/sessions/${stored}`);
      if (session.status === "live") {
        setLiveSession(session);
      } else {
        clearStoredSessionId(subjectId);
      }
    } catch {
      clearStoredSessionId(subjectId);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when subjectId param changes
    void load();
    void checkStoredSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      const body = scheduleForStart ? { schedule_id: scheduleForStart } : {};
      const session = await api.post<ClassSession>(`/api/v1/sessions/${subjectId}/start`, body);
      setStoredSessionId(subjectId, session.id);
      setLiveSession(session);
      navigate(`/professor/sessions/${session.id}/board`);
    } catch (err) {
      const existingId = liveSessionIdFromConflict(err);
      if (existingId) setConflictSessionId(existingId);
      else setError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  // The start CONFLICT is the only way to rediscover a live session once its board tab is gone.
  function handleResume() {
    if (!conflictSessionId) return;
    setStoredSessionId(subjectId, conflictSessionId);
    navigate(`/professor/sessions/${conflictSessionId}/board`);
  }

  async function handleStopExisting() {
    if (!conflictSessionId) return;
    setError("");
    setStoppingExisting(true);
    try {
      await api.post(`/api/v1/sessions/${conflictSessionId}/stop`);
      clearStoredSessionId(subjectId);
      setEndedSessionId(conflictSessionId);
      setConflictSessionId(null);
      setSessionsVersion((v) => v + 1);
    } catch (err) {
      // CONFLICT here means it's no longer live (ended elsewhere), so starting is possible again.
      if (err instanceof ApiError && err.code === "CONFLICT") setConflictSessionId(null);
      else setError(errorMessage(err));
    } finally {
      setStoppingExisting(false);
    }
  }

  async function handleStop() {
    if (!liveSession) return;
    try {
      await api.post(`/api/v1/sessions/${liveSession.id}/stop`);
      clearStoredSessionId(subjectId);
      setEndedSessionId(liveSession.id);
      setLiveSession(null);
      setSessionsVersion((v) => v + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteSubject() {
    if (!detail) return;
    if (!confirm(`Delete ${detail.subject.name}? This removes all schedules, enrollments, and attendance.`))
      return;
    try {
      await api.del(`/api/v1/subjects/${subjectId}`);
      navigate("/professor/subjects", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!detail) {
    return error ? <Banner tone="error">{error}</Banner> : <PageSpinner />;
  }

  const { subject, schedules, roster } = detail;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{subject.code}</p>
          <h1 className="text-xl font-semibold text-slate-900">{subject.name}</h1>
        </div>
        <Button variant="danger" onClick={handleDeleteSubject}>
          Delete subject
        </Button>
      </div>

      {error && (
        <Banner tone="error" onDismiss={() => setError("")}>
          {error}
        </Banner>
      )}

      {endedSessionId && (
        <Banner tone="success" onDismiss={() => setEndedSessionId(null)}>
          Session ended.{" "}
          <Link to={`/professor/sessions/${endedSessionId}`} className="font-medium underline">
            View attendance
          </Link>
        </Banner>
      )}

      <Card>
        <CardHeader title="Live session" subtitle="Only one live session per subject is allowed." />
        {liveSession ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="green">Live</Badge>
            <Link to={`/professor/sessions/${liveSession.id}/board`}>
              <Button variant="secondary">Open board</Button>
            </Link>
            <Link to={`/professor/sessions/${liveSession.id}`}>
              <Button variant="ghost">Session details</Button>
            </Link>
            <Button variant="danger" onClick={handleStop}>
              Stop session
            </Button>
          </div>
        ) : conflictSessionId ? (
          <div className="flex flex-col gap-3">
            <Banner tone="info">
              A session for this subject is already live, maybe on a board you closed. Resume it or
              stop it to start a new one.
            </Banner>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleResume}>Resume</Button>
              <Button variant="danger" onClick={handleStopExisting} loading={stoppingExisting}>
                Stop
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Schedule (optional)"
              value={scheduleForStart}
              onChange={(e) => setScheduleForStart(e.target.value)}
              className="w-56"
            >
              <option value="">No specific schedule</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDayOfWeek(s.day_of_week)} {formatTime(s.start_time)}–{formatTime(s.end_time)}
                </option>
              ))}
            </Select>
            <Button onClick={handleStart} loading={starting}>
              Start session
            </Button>
          </div>
        )}
      </Card>

      <PastSessionsCard subjectId={subjectId} refreshKey={sessionsVersion} />

      <SchedulesCard
        subjectId={subjectId}
        schedules={schedules}
        onAdded={(s) => setDetail((d) => (d ? { ...d, schedules: [...d.schedules, s] } : d))}
      />

      <RosterCard
        subjectId={subjectId}
        roster={roster}
        onEnrolled={(e) => setDetail((d) => (d ? { ...d, roster: [...d.roster, e] } : d))}
      />
    </div>
  );
}

function PastSessionsCard({ subjectId, refreshKey }: { subjectId: string; refreshKey: number }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<SessionSummary[]>(`/api/v1/subjects/${subjectId}/sessions`)
      .then((data) => {
        if (cancelled) return;
        setSessions(data);
        setError("");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, refreshKey]);

  return (
    <Card>
      <CardHeader title="Past sessions" subtitle="Open a session to see who attended." />
      {error && <Banner tone="error">{error}</Banner>}
      {sessions === null ? (
        !error && <PageSpinner />
      ) : sessions.length === 0 ? (
        <EmptyState title="No sessions yet" hint="Start a session to take attendance." />
      ) : (
        <Table label="Past sessions">
          <Thead>
            <Th>Started</Th>
            <Th>Status</Th>
            <Th>Present</Th>
          </Thead>
          <Tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link to={`/professor/sessions/${s.id}`} className="font-medium text-blue-700 hover:underline">
                    {formatDateTime(s.started_at ?? s.created_at)}
                  </Link>
                </Td>
                <Td>
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                </Td>
                <Td>{s.attendance_count}</Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}

function SchedulesCard({
  subjectId,
  schedules,
  onAdded,
}: {
  subjectId: string;
  schedules: ClassSchedule[];
  onAdded: (s: ClassSchedule) => void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [room, setRoom] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
      };
      if (room.trim()) body.room = room.trim();
      const schedule = await api.post<ClassSchedule>(`/api/v1/subjects/${subjectId}/schedules`, body);
      onAdded(schedule);
      setRoom("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Weekly schedule" />
      {error && <Banner tone="error">{error}</Banner>}

      {schedules.length === 0 ? (
        <EmptyState title="No schedule slots yet" />
      ) : (
        <Table>
          <Thead>
            <Th>Day</Th>
            <Th>Time</Th>
            <Th>Room</Th>
          </Thead>
          <Tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <Td>{formatDayOfWeek(s.day_of_week)}</Td>
                <Td>
                  {formatTime(s.start_time)}–{formatTime(s.end_time)}
                </Td>
                <Td>{s.room ?? "—"}</Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <Select label="Day" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className="w-36">
          {Array.from({ length: 7 }, (_, i) => i).map((d) => (
            <option key={d} value={d}>
              {formatDayOfWeek(d)}
            </option>
          ))}
        </Select>
        <Input
          label="Start"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
        />
        <Input label="End" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        <Input
          label="Room (optional)"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="w-32"
        />
        <Button type="submit" loading={loading} variant="secondary">
          Add slot
        </Button>
      </form>
    </Card>
  );
}

function RosterCard({
  subjectId,
  roster,
  onEnrolled,
}: {
  subjectId: string;
  roster: EnrolledStudent[];
  onEnrolled: (e: EnrolledStudent) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const value = identifier.trim();
      const body = value.includes("-") && value.length > 20 ? { student_id: value } : { student_code: value };
      await api.post(`/api/v1/subjects/${subjectId}/enrollments`, body);
      const updatedRoster = await api.get<EnrolledStudent[]>(`/api/v1/subjects/${subjectId}/enrollments`);
      const added = updatedRoster.find((r) => !roster.some((existing) => existing.enrollment_id === r.enrollment_id));
      if (added) onEnrolled(added);
      setIdentifier("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Roster" subtitle={`${roster.length} enrolled student(s)`} />
      {error && <Banner tone="error">{error}</Banner>}

      {roster.length === 0 ? (
        <EmptyState title="No students enrolled yet" />
      ) : (
        <Table>
          <Thead>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Code</Th>
          </Thead>
          <Tbody>
            {roster.map((r) => (
              <tr key={r.enrollment_id}>
                <Td>{r.full_name}</Td>
                <Td>{r.email}</Td>
                <Td>{r.student_code ?? "—"}</Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <Input
          label="Enroll student"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          hint="Student ID or student code"
          className="w-64"
          required
        />
        <Button type="submit" loading={loading} variant="secondary">
          Enroll
        </Button>
      </form>
    </Card>
  );
}
