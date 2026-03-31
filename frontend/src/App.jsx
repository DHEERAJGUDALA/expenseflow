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
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
