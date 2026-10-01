import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import type { Role, User } from "../../lib/types";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { Modal } from "../../components/ui/Modal";
import { PageSpinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Table, Thead, Th, Tbody, Td } from "../../components/ui/Table";

const ROLES: Role[] = ["admin", "professor", "student"];

export function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setError("");
    try {
      const query: Record<string, string> = {};
      if (roleFilter) query.role = roleFilter;
      if (activeFilter) query.active = activeFilter;
      const data = await api.get<User[]>("/api/v1/admin/users", query);
      setUsers(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when filters change
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, activeFilter]);

  async function toggleActive(user: User) {
    try {
      const updated = await api.patch<User>(`/api/v1/admin/users/${user.id}`, {
        is_active: !user.is_active,
      });
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteUser(user: User) {
    if (!confirm(`Delete ${user.full_name}? This cannot be undone.`)) return;
    try {
      await api.del(`/api/v1/admin/users/${user.id}`);
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Users"
          subtitle="Create and manage admin, professor, and student accounts."
          action={<Button onClick={() => setShowCreate(true)}>New user</Button>}
        />

        {error && (
          <div className="mb-4">
            <Banner tone="error" onDismiss={() => setError("")}>
              {error}
            </Banner>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <Select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "")}
            className="w-40"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by status"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as "" | "true" | "false")}
            className="w-40"
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>

        {users === null ? (
          <PageSpinner />
        ) : users.length === 0 ? (
          <EmptyState title="No users found" hint="Try adjusting the filters or create a new user." />
        ) : (
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Code</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>{u.full_name}</Td>
                  <Td>{u.email}</Td>
                  <Td className="capitalize">{u.role}</Td>
                  <Td>{u.student_code ?? "—"}</Td>
                  <Td>
                    <Badge tone={u.is_active ? "green" : "neutral"}>
                      {u.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => toggleActive(u)}>
                        {u.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button variant="ghost" onClick={() => deleteUser(u)}>
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(user) => {
            setUsers((prev) => (prev ? [user, ...prev] : [user]));
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: User) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [studentCode, setStudentCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, string> = {
        full_name: fullName,
        email,
        password,
        role,
      };
      if (role === "student") body.student_code = studentCode;
      const user = await api.post<User>("/api/v1/auth/register", body);
      onCreated(user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="New user" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <Banner tone="error">{error}</Banner>}
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Temporary password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="The user will be forced to change this on first login."
          required
        />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        {role === "student" && (
          <Input
            label="Student code"
            value={studentCode}
            onChange={(e) => setStudentCode(e.target.value)}
            required
          />
        )}
        <Button type="submit" loading={loading} className="mt-2 w-full">
          Create user
        </Button>
      </form>
    </Modal>
  );
}
