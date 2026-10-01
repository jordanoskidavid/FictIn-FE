import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import type { Subject } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Banner } from "../../components/ui/Banner";
import { PageSpinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Table, Thead, Th, Tbody, Td } from "../../components/ui/Table";

export function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Subject[]>("/api/v1/admin/subjects")
      .then((data) => setSubjects(data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <Card>
      <CardHeader title="All subjects" subtitle="Every subject across all professors." />
      {error && <Banner tone="error">{error}</Banner>}
      {subjects === null ? (
        <PageSpinner />
      ) : subjects.length === 0 ? (
        <EmptyState title="No subjects yet" />
      ) : (
        <Table>
          <Thead>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Professor ID</Th>
          </Thead>
          <Tbody>
            {subjects.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium text-slate-900">{s.code}</Td>
                <Td>{s.name}</Td>
                <Td className="font-mono text-xs text-slate-500">{s.professor_id}</Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}
