"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import { DarkModeProvider } from "@/hooks/useDarkMode";

const DARK_ROUTES = ["/processing", "/results", "/database", "/export", "/review"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const isDark = DARK_ROUTES.some((r) => pathname.startsWith(r));

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <DarkModeProvider value={isDark}>
      <div className={`flex flex-1 min-h-0 ${isDark ? "dark" : ""}`}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header isDark={isDark} />
          <main
            className={`flex-1 overflow-y-auto overflow-x-hidden relative bg-orbs ${
              isDark ? "bg-dark-bg text-dark-text-primary" : ""
            }`}
          >
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="min-h-full relative z-10"
            >
              {children}
            </motion.div>
          </main>
          <Footer isDark={isDark} />
        </div>
      </div>
    </DarkModeProvider>
  );
}
