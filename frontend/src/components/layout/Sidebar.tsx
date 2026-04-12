"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, BarChart3, Database, Waves, Music2 } from "lucide-react";

const NAV_LINKS = [
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/recordings", label: "Recordings", icon: Music2 },
  { href: "/results", label: "Results", icon: BarChart3 },
  { href: "/database", label: "Database", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 z-30 flex h-screen w-16 shrink-0 flex-col border-r border-white/[0.06] bg-ev-charcoal shadow-[8px_0_30px_rgba(44,41,38,0.14)]"
      style={{ backgroundColor: "#2C2926" }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-center border-b border-white/[0.06]">
        <Link href="/">
          <motion.div
            whileHover={{ scale: 1.1, rotate: -3 }}
            whileTap={{ scale: 0.9 }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-savanna to-accent-deep-gold shadow-lg shadow-accent-savanna/25"
          >
            <Waves className="h-[18px] w-[18px] text-white" />
          </motion.div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-1 px-2 pt-4">
        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href ||
            pathname.startsWith(link.href + "/");
          const Icon = link.icon;

          return (
            <div key={link.href} className="relative flex h-12 w-full items-center justify-center">
              {isActive && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="absolute left-0 top-1/2 h-7 w-[4px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-accent-savanna to-accent-gold"
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

              <Link
                href={link.href}
                aria-label={link.label}
                className="group relative flex h-12 w-12 items-center justify-center rounded-2xl transition-colors"
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-glow"
                    className="absolute inset-0 rounded-2xl bg-white/[0.07]"
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
                    className={`h-5 w-5 transition-all duration-200 ${
                      isActive
                        ? "text-accent-savanna drop-shadow-[0_0_6px_rgba(196,164,108,0.4)]"
                        : "text-ev-dust/70 group-hover:text-ev-cream"
                    }`}
                  />
                </motion.div>

                <div className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-white/[0.06] bg-ev-charcoal-light px-2.5 py-1.5 text-[11px] font-medium text-ev-cream opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                  {link.label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-ev-charcoal-light" />
                </div>
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
