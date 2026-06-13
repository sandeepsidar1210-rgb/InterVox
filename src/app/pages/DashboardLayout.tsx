import { Outlet } from "react-router";
import { Sidebar } from "../components/dashboard/Sidebar";

export default function DashboardLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden w-full bg-background">
        <Outlet />
      </div>
    </div>
  );
}