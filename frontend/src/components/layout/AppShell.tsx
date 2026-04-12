"use client";

import { usePathname } from "next/navigation";
import { MobileSidebarContext, useMobileSidebarState } from "@/hooks/useSidebar";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const mobileSidebar = useMobileSidebarState();

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <MobileSidebarContext.Provider value={mobileSidebar}>
      <div className="flex flex-1 min-h-0">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />

          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-ev-ivory">
            <div className="min-h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </MobileSidebarContext.Provider>
  );
}
