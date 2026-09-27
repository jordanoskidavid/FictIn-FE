import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import type { Subject } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Banner } from "../../components/ui/Banner";
import { PageSpinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";

export function StudentSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Subject[]>("/api/v1/student/subjects")
      .then((data) => setSubjects(data ?? []))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <Card>
      <CardHeader title="My subjects" subtitle="Subjects you're currently enrolled in." />
      {error && <Banner tone="error">{error}</Banner>}
      {subjects === null ? (
        <PageSpinner />
      ) : subjects.length === 0 ? (
        <EmptyState title="You're not enrolled in any subjects yet" hint="Ask your professor to add you." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.code}</p>
              <p className="mt-1 font-medium text-slate-900">{s.name}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
