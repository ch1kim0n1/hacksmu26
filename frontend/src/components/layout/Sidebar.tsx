"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, BarChart3, Database, Waves, Radio } from "lucide-react";

const NAV_LINKS = [
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/results", label: "Results", icon: BarChart3 },
  { href: "/database", label: "Database", icon: Database },
  { href: "/realtime", label: "Real-Time Filter", icon: Radio },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden sm:flex flex-col w-16 bg-ev-charcoal shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-white/[0.06]">
        <Link href="/">
          <motion.div
            whileHover={{ scale: 1.1, rotate: -3 }}
            whileTap={{ scale: 0.9 }}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-savanna to-accent-deep-gold flex items-center justify-center shadow-lg shadow-accent-savanna/25"
          >
            <Waves className="w-[18px] h-[18px] text-white" />
          </motion.div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-1 pt-4 px-2">
        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href ||
            pathname.startsWith(link.href + "/");
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-label={link.label}
              className="group relative flex items-center justify-center w-full py-2.5 rounded-xl transition-colors"
            >
              {/* Active indicator bar */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-accent-savanna to-accent-gold"
                  transition={{
                    type: "spring",
                    stiffness: 350,
                    damping: 30,
                  }}
                  style={{
                    boxShadow: "0 0 10px rgba(196, 164, 108, 0.5)",
                  }}
                />
              )}

              {/* Active background */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-glow"
                  className="absolute inset-x-1 inset-y-0 rounded-xl bg-white/[0.07]"
                  transition={{
                    type: "spring",
                    stiffness: 350,
                    damping: 30,
                  }}
                />
              )}

              <motion.div
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                className="relative z-10"
              >
                <Icon
                  className={`w-5 h-5 transition-all duration-200 ${
                    isActive
                      ? "text-accent-savanna drop-shadow-[0_0_6px_rgba(196,164,108,0.4)]"
                      : "text-ev-dust/70 group-hover:text-ev-cream"
                  }`}
                />
              </motion.div>

              {/* Tooltip */}
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-ev-charcoal-light rounded-lg text-[11px] text-ev-cream font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 shadow-xl border border-white/[0.06]">
                {link.label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-ev-charcoal-light" />
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
