import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import type { Subject } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Banner } from "../../components/ui/Banner";
import { Modal } from "../../components/ui/Modal";
import { PageSpinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";

export function SubjectsListPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setError("");
    try {
      const data = await api.get<Subject[]>("/api/v1/subjects");
      setSubjects(data ?? []);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Your subjects"
          subtitle="Create subjects, manage rosters, and run live sessions."
          action={<Button onClick={() => setShowCreate(true)}>New subject</Button>}
        />

        {error && <Banner tone="error">{error}</Banner>}

        {subjects === null ? (
          <PageSpinner />
        ) : subjects.length === 0 ? (
          <EmptyState title="No subjects yet" hint="Create your first subject to get started." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <Link
                key={s.id}
                to={`/professor/subjects/${s.id}`}
                className="rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.code}</p>
                <p className="mt-1 font-medium text-slate-900">{s.name}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {showCreate && (
        <CreateSubjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(subject) => {
            setSubjects((prev) => (prev ? [subject, ...prev] : [subject]));
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateSubjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (subject: Subject) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const subject = await api.post<Subject>("/api/v1/subjects", { name, code });
      onCreated(subject);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="New subject" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <Banner tone="error">{error}</Banner>}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          hint="e.g. CS101 — will be uppercased"
          required
        />
        <Button type="submit" loading={loading} className="mt-2 w-full">
          Create subject
        </Button>
      </form>
    </Modal>
  );
}
