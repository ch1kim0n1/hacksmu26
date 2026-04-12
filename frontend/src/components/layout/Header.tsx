"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, BarChart3, Database, Menu, X, Waves } from "lucide-react";

const MOBILE_NAV = [
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/results", label: "Results", icon: BarChart3 },
  { href: "/database", label: "Database", icon: Database },
];

const PAGE_TITLES: Record<string, string> = {
  "/upload": "Upload Recordings",
  "/results": "Results",
  "/database": "Call Database",
  "/processing": "Processing",
  "/export": "Export",
};

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const title =
    Object.entries(PAGE_TITLES).find(
      ([path]) => pathname === path || pathname.startsWith(path + "/"),
    )?.[1] || "Dashboard";

  return (
    <header className="sticky top-0 z-40 bg-ev-ivory/80 backdrop-blur-xl border-b border-ev-sand/40">
      <div className="flex h-12 items-center justify-between px-4 sm:px-5 lg:px-8">
        {/* Mobile logo + page title */}
        <div className="flex items-center gap-3">
          <Link href="/" className="sm:hidden">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-savanna to-accent-deep-gold flex items-center justify-center">
              <Waves className="w-4 h-4 text-white" />
            </div>
          </Link>

          <motion.h1
            key={title}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="text-sm font-semibold text-ev-charcoal"
          >
            {title}
          </motion.h1>
        </div>

        {/* Mobile hamburger */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg text-ev-elephant hover:text-ev-charcoal hover:bg-ev-cream transition-all"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </motion.button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sm:hidden border-t border-ev-sand/30 bg-ev-ivory/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-4 py-2 space-y-0.5">
              {MOBILE_NAV.map((link) => {
                const isActive =
                  pathname === link.href ||
                  pathname.startsWith(link.href + "/");
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 py-2.5 px-3 text-sm font-medium rounded-lg transition-all ${
                      isActive
                        ? "text-accent-savanna bg-accent-savanna/8"
                        : "text-ev-elephant hover:bg-ev-cream"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
