"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-orbs">
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
        <Footer />
      </div>
    </div>
  );
}
