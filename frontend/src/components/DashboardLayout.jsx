import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { NotificationBell } from "./NotificationBell";

export function DashboardLayout({ children }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const role = user?.user_metadata?.role || "employee";
  const fullName = user?.user_metadata?.full_name || user?.email;
  const organizationName = user?.user_metadata?.organization_name || "Your Organization";

  const navigation = [
    { name: "Dashboard", href: "/app", icon: "📊", roles: ["admin", "manager", "employee"] },
    { name: "Submit Expense", href: "/app/expenses/new", icon: "➕", roles: ["employee", "manager", "admin"] },
    { name: "My Expenses", href: "/app/expenses", icon: "📋", roles: ["employee", "manager", "admin"] },
    { name: "Approvals", href: "/app/approvals", icon: "✅", roles: ["admin", "manager"] },
    { name: "Team Expenses", href: "/app/team-expenses", icon: "👥", roles: ["admin", "manager"] },
    { name: "Employees", href: "/app/employees", icon: "🧑‍💼", roles: ["admin"] },
  ];

  const filteredNav = navigation.filter(item => item.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-20"} bg-slate-900 text-white transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-xl">
              💰
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-lg">ReimburseMe</h1>
                <p className="text-xs text-slate-400">{organizationName}</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive 
                    ? "bg-indigo-600 text-white" 
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {sidebarOpen && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
              {fullName?.charAt(0).toUpperCase()}
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden flex-1">
                <p className="font-medium truncate">{fullName}</p>
                <p className="text-xs text-slate-400 capitalize">{role}</p>
              </div>
            )}
            {sidebarOpen && <NotificationBell />}
          </div>
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {sidebarOpen ? "Sign out" : "👋"}
          </button>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 m-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
        >
          {sidebarOpen ? "←" : "→"}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
