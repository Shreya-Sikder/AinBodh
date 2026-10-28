import { Outlet, useLocation } from "react-router-dom";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import PageFooter from "./PageFooter";
import { useApp } from "../context/AppContext";

export default function AppShell() {
  const { sidebarOpen } = useApp();
  const location = useLocation();
  return (
    <div className="min-h-screen bg-surface">
      <TopBar />
      <Sidebar />
      <main className={`pt-14 transition-all duration-200 ${sidebarOpen ? "pl-[220px]" : "pl-0"}`}>
        <div key={location.pathname} className="page-enter min-h-[calc(100vh-56px)]">
          <Outlet />
        </div>
        <PageFooter />
      </main>
    </div>
  );
}

