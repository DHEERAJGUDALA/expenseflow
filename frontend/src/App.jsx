import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ExpenseFormPage } from "./pages/ExpenseFormPage";
import { ExpenseListPage } from "./pages/ExpenseListPage";
import { EmployeeManagementPage } from "./pages/EmployeeManagementPage";

function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/expenses" element={<ExpenseListPage />} />
        <Route path="/app/expenses/new" element={<ExpenseFormPage />} />
        <Route path="/app/employees" element={<EmployeeManagementPage />} />
        {/* Placeholder routes for future pages */}
        <Route path="/app/approvals" element={<DashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
