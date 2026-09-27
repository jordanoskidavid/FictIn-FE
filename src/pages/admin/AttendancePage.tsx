import { useState } from "react";
import type { FormEvent } from "react";
import { api, downloadCsv } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import type { AttendanceRow } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Table, Thead, Th, Tbody, Td } from "../../components/ui/Table";

export function AdminAttendancePage() {
  const [sessionId, setSessionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function buildQuery() {
    const query: Record<string, string> = {};
    if (sessionId.trim()) query.session_id = sessionId.trim();
    if (subjectId.trim()) query.subject_id = subjectId.trim();
    if (studentId.trim()) query.student_id = studentId.trim();
    return query;
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.get<AttendanceRow[]>("/api/v1/admin/attendance", buildQuery());
      setRows(data ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    setError("");
    setDownloading(true);
    try {
      await downloadCsv("/api/v1/admin/attendance", { ...buildQuery(), format: "csv" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Attendance"
        subtitle="Search across every session, subject, and student."
        action={
          <Button variant="secondary" onClick={handleDownload} loading={downloading}>
            Download CSV
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Banner tone="error" onDismiss={() => setError("")}>
            {error}
          </Banner>
        </div>
      )}

      <form onSubmit={handleSearch} className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          label="Session ID"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="optional"
          className="w-56"
        />
        <Input
          label="Subject ID"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          placeholder="optional"
          className="w-56"
        />
        <Input
          label="Student ID"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder="optional"
          className="w-56"
        />
        <Button type="submit" loading={loading}>
          Search
        </Button>
      </form>

      {rows === null ? (
        <EmptyState title="No results yet" hint="Run a search to see attendance records." />
      ) : rows.length === 0 ? (
        <EmptyState title="No matching records" />
      ) : (
        <Table>
          <Thead>
            <Th>Student</Th>
            <Th>Code</Th>
            <Th>Subject</Th>
            <Th>Scanned at</Th>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{r.student_name}</Td>
                <Td>{r.student_code ?? "—"}</Td>
                <Td>
                  {r.subject_code} — {r.subject_name}
                </Td>
                <Td>{formatDateTime(r.scanned_at)}</Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}
