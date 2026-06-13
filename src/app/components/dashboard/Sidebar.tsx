import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Mic2,
  BarChart3,
  ClockArrowUp,
  UserCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LogOut,
} from "lucide-react";
import { Logo } from "../Logo";

const navItems = [
  { icon: LayoutDashboard, label: "Home", to: "/dashboard" },
  { icon: Mic2, label: "Practice", to: "/dashboard/practice" },
  { icon: BarChart3, label: "Analytics", to: "/dashboard/analytics" },
  { icon: ClockArrowUp, label: "History", to: "/dashboard/history" },
  { icon: UserCircle, label: "Profile", to: "/dashboard/profile" },
  { icon: Settings, label: "Settings", to: "/dashboard/settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/logout");
  };

  return (
    <motion.aside
      initial={{ x: -240, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col glass-panel border-t-0 border-l-0 border-b-0 rounded-none transition-all duration-300 ease-in-out relative flex-shrink-0 z-20"
      style={{ width: collapsed ? "72px" : "240px", minHeight: "100vh" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-glass-border overflow-hidden justify-center">
        {!collapsed && (
          <Logo className="h-10" />
        )}
        {collapsed && (
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-900/40">
            <Sparkles size={17} className="text-white" strokeWidth={2.5} />
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
        {navItems.map(({ icon: Icon, label, to }) => (
          <NavLink
            key={label}
            to={to}
            end={to === "/dashboard"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative ${
                isActive
                  ? "text-white"
                  : "text-text-secondary hover:text-white hover:bg-white/5"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-purple-500/20 z-0"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.5 : 2}
                  className="flex-shrink-0 relative z-10"
                />
                {!collapsed && (
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: isActive ? 600 : 500,
                      fontSize: "0.875rem",
                      whiteSpace: "nowrap",
                    }}
                    className="relative z-10"
                  >
                    {label}
                  </span>
                )}
                {/* Tooltip when collapsed */}
                {collapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1 bg-surface-3 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-glass-border"
                    style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
                  >
                    {label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: User + Logout */}
      <div className="border-t border-glass-border p-3 flex flex-col gap-2">
        <button
          onClick={() => navigate("/dashboard/profile")}
          className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors ${collapsed ? "justify-center" : ""}`}
        >
          <img
            src="https://images.unsplash.com/photo-1740174459726-8c57d8366061?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=80"
            alt="User avatar"
            className="w-8 h-8 rounded-full object-cover border-2 border-glass-border flex-shrink-0"
          />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "0.8rem", color: "var(--text-primary)" }}>
                Alex Johnson
              </span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                Free Plan
              </span>
            </div>
          )}
        </button>
        <button
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-text-secondary hover:text-[#EF4444] hover:bg-white/5 transition-all duration-150 group"
          title="Log out"
          onClick={handleLogout}
        >
          <LogOut size={17} strokeWidth={2} className="flex-shrink-0" />
          {!collapsed && (
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: "0.875rem" }}>
              Log Out
            </span>
          )}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3.5 top-20 w-7 h-7 bg-surface-2 border border-glass-border rounded-full flex items-center justify-center text-text-secondary hover:text-white hover:bg-primary hover:border-primary transition-all duration-150 shadow-md z-10"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
      </button>
    </motion.aside>
  );
}