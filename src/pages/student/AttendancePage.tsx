import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import type { AttendanceRow } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Banner } from "../../components/ui/Banner";
import { PageSpinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Table, Thead, Th, Tbody, Td } from "../../components/ui/Table";

export function StudentAttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<AttendanceRow[]>("/api/v1/student/attendance")
      .then((data) => setRows(data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <Card>
      <CardHeader title="My attendance" subtitle="Every session you've scanned into, across all subjects." />
      {error && <Banner tone="error">{error}</Banner>}
      {rows === null ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No attendance recorded yet" />
      ) : (
        <Table>
          <Thead>
            <Th>Subject</Th>
            <Th>Scanned at</Th>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <tr key={r.id}>
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
