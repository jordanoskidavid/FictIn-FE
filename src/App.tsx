import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute, RoleHome } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { AdminSubjectsPage } from "./pages/admin/SubjectsPage";
import { AdminAttendancePage } from "./pages/admin/AttendancePage";
import { SubjectsListPage } from "./pages/professor/SubjectsListPage";
import { SubjectDetailPage } from "./pages/professor/SubjectDetailPage";
import { SessionPage } from "./pages/professor/SessionPage";
import { BoardPage } from "./pages/professor/BoardPage";
import { StudentSubjectsPage } from "./pages/student/SubjectsPage";
import { ScanPage } from "./pages/student/ScanPage";
import { StudentAttendancePage } from "./pages/student/AttendancePage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />

      <Route path="/professor/sessions/:sessionId/board" element={<ProtectedRoute roles={["professor"]} />}>
        <Route index element={<BoardPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<RoleHome />} />

          <Route path="/admin" element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="subjects" element={<AdminSubjectsPage />} />
            <Route path="attendance" element={<AdminAttendancePage />} />
          </Route>

          <Route path="/professor" element={<ProtectedRoute roles={["professor"]} />}>
            <Route path="subjects" element={<SubjectsListPage />} />
            <Route path="subjects/:id" element={<SubjectDetailPage />} />
            <Route path="sessions/:sessionId" element={<SessionPage />} />
          </Route>

          <Route path="/student" element={<ProtectedRoute roles={["student"]} />}>
            <Route path="subjects" element={<StudentSubjectsPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="attendance" element={<StudentAttendancePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
