import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { ExpenseFormPage } from "./pages/ExpenseFormPage";
import { ExpenseListPage } from "./pages/ExpenseListPage";
import { ExpenseDetailPage } from "./pages/ExpenseDetailPage";
import { EmployeeManagementPage } from "./pages/EmployeeManagementPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { TeamExpensesPage } from "./pages/TeamExpensesPage";
import { ManagerLeaveManagementPage } from "./pages/ManagerLeaveManagementPage";
import { RuleBuilderPage } from "./pages/RuleBuilderPage";
import { ManagerQueuePage } from "./pages/ManagerQueuePage";
import { ManagerSpecialQueuePage } from "./pages/ManagerSpecialQueuePage";
import { ManagerTeamExpensesPage } from "./pages/ManagerTeamExpensesPage";
import { AdminApprovalsPage } from "./pages/AdminApprovalsPage";

function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      {/* Password reset - accessible without auth */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/expenses" element={<ExpenseListPage />} />
        <Route path="/app/expenses/new" element={<ExpenseFormPage />} />
        <Route path="/app/expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="/app/employees" element={<EmployeeManagementPage />} />
        <Route path="/app/approvals" element={<ApprovalsPage />} />
        <Route path="/app/team-expenses" element={<TeamExpensesPage />} />
        <Route path="/app/manager-leave" element={<ManagerLeaveManagementPage />} />
        <Route path="/app/admin/rules" element={<RuleBuilderPage />} />
        <Route path="/manager/queue" element={<ManagerQueuePage />} />
        <Route path="/manager/special-queue" element={<ManagerSpecialQueuePage />} />
        <Route path="/manager/team" element={<ManagerTeamExpensesPage />} />
        <Route path="/admin/approvals" element={<AdminApprovalsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
