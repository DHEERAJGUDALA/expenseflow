import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { NotificationBell } from "./NotificationBell";
import {
  LayoutDashboard, Receipt, PlusCircle, Users, CheckCircle,
  Star, ClipboardList, Settings, LogOut, ChevronRight,
  Bell as BellIcon, Shield, CalendarOff
} from "lucide-react";

const ICON_MAP = {
  dashboard: LayoutDashboard,
  receipt: Receipt,
  submit: PlusCircle,
  team: Users,
  approvals: CheckCircle,
  special: Star,
  employees: Users,
  rules: Settings,
  pending: BellIcon,
  clipboard: ClipboardList,
  leave: CalendarOff,
  admin: Shield,
};

export function DashboardLayout({ children }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [hovering, setHovering] = useState(false);

  const role = user?.role || "employee";
  const fullName = user?.full_name || user?.email;
  const initials = fullName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U";
  const organizationName = user?.user_metadata?.organization_name || "Organization";

  const [hasSpecial, setHasSpecial] = useState(false);
  const [adminPendingCount, setAdminPendingCount] = useState(0);

  useEffect(() => {
    if (role === "manager") {
      import("../lib/api").then(({ managerApi }) => {
        managerApi.getSpecialQueue()
          .then(data => setHasSpecial(data.is_special_approver))
          .catch(() => {});
      });
    }
    if (role === "admin") {
      import("../lib/api").then(({ managerApi }) => {
        Promise.all([
          managerApi.getQueue().catch(() => ({ expenses: [] })),
          managerApi.getSpecialQueue().catch(() => ({ expenses: [] })),
        ]).then(([q, sq]) => {
          setAdminPendingCount((q.expenses?.length || 0) + (sq.expenses?.length || 0));
        });
      });
    }
  }, [role]);

  const navigation = [
    { name: "Dashboard", href: "/app", icon: "dashboard", roles: ["admin", "employee"] },
    { name: "Approval Queue", href: "/manager/queue", icon: "approvals", roles: ["manager"] },
    ...(hasSpecial ? [{ name: "Special Approvals", href: "/manager/special-queue", icon: "special", roles: ["manager"] }] : []),
    { name: "Team Expenses", href: "/manager/team", icon: "team", roles: ["manager"] },
    { name: "My Expenses", href: "/app/expenses", icon: "receipt", roles: ["employee", "manager", "admin"] },
    { name: "Submit Expense", href: "/app/expenses/new", icon: "submit", roles: ["employee", "manager"] },
    ...(adminPendingCount > 0 ? [{ name: `Pending (${adminPendingCount})`, href: "/admin/approvals", icon: "pending", roles: ["admin"], badge: adminPendingCount }] : []),
    { name: "Approvals", href: "/app/approvals", icon: "clipboard", roles: ["admin"] },
    { name: "Team Expenses", href: "/app/team-expenses", icon: "team", roles: ["admin"] },
    { name: "Employees", href: "/app/employees", icon: "employees", roles: ["admin"] },
    { name: "Approval Rules", href: "/app/admin/rules", icon: "rules", roles: ["admin"] },
  ];

  const filteredNav = navigation.filter(item => item.roles.includes(role));
  const isOpen = expanded || hovering;

  // Find current page name for breadcrumb
  const currentPage = filteredNav.find(item => item.href === location.pathname)?.name || "Page";

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      {/* ═══ Sidebar ═══ */}
      <motion.aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        animate={{ width: isOpen ? 240 : 64 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="fixed top-0 left-0 h-screen z-40 flex flex-col overflow-hidden"
        style={{
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)"
        }}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-3 gap-3" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
              color: "white",
              fontFamily: "var(--font-heading)",
            }}
          >
            RM
          </div>
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden min-w-0"
              >
                <p className="font-bold text-sm truncate" style={{ color: "var(--sidebar-text)", fontFamily: "var(--font-heading)" }}>
                  ReimburseMe
                </p>
                <p className="text-xs truncate" style={{ color: "var(--sidebar-text-dim)" }}>
                  {organizationName}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.href;
            const IconComponent = ICON_MAP[item.icon] || LayoutDashboard;
            return (
              <Link
                key={item.href + item.name}
                to={item.href}
                className="group flex items-center gap-3 h-10 rounded-lg px-2 relative transition-colors"
                style={{
                  background: isActive ? "var(--sidebar-elevated)" : "transparent",
                  color: isActive ? "var(--sidebar-text)" : "var(--sidebar-text-muted)",
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--sidebar-surface)";
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: "var(--accent)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                <IconComponent size={18} className="flex-shrink-0" style={{ color: isActive ? "var(--accent)" : undefined }} />

                <AnimatePresence>
                  {isOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-[13px] font-medium truncate whitespace-nowrap"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Badge for pending count */}
                {item.badge && isOpen && (
                  <span
                    className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "var(--accent)", color: "white", fontSize: "10px" }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-2 pb-3" style={{ borderTop: "1px solid var(--sidebar-border)", paddingTop: "12px" }}>
          <div className="flex items-center gap-3 px-2 mb-2">
            <div className="avatar avatar-md flex-shrink-0" style={{ fontSize: "12px" }}>{initials}</div>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="min-w-0 flex-1"
                >
                  <p className="text-sm font-medium truncate" style={{ color: "var(--sidebar-text)" }}>
                    {fullName}
                  </p>
                  <p className="text-xs capitalize" style={{ color: "var(--sidebar-text-dim)" }}>{role}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full h-9 px-2 rounded-lg transition-colors"
            style={{ color: "var(--sidebar-text-muted)" }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "var(--sidebar-surface)";
              e.currentTarget.style.color = "var(--danger)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--sidebar-text-muted)";
            }}
          >
            <LogOut size={18} className="flex-shrink-0" />
            <AnimatePresence>
              {isOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[13px] font-medium"
                >
                  Sign Out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 flex flex-col" style={{ marginLeft: 64 }}>
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 h-14 flex items-center justify-between px-6"
          style={{
            background: "rgba(248, 249, 252, 0.85)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border-subtle)"
          }}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--text-muted)" }}>
              {role === "admin" ? "Admin" : role === "manager" ? "Manager" : "Home"}
            </span>
            <ChevronRight size={14} style={{ color: "var(--text-placeholder)" }} />
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{currentPage}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
