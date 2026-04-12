"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/database", label: "Database" },
  { href: "/export", label: "Export" },
  { href: "/about", label: "About" },
];

type HeaderProps = {
  variant?: "default" | "overlay";
};

export default function Header({ variant = "default" }: HeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isOverlay = variant === "overlay";

  return (
    <header
      className={
        isOverlay
          ? "absolute inset-x-0 top-0 z-[12] w-full border-b border-[#b59a76]/30 bg-[#f4ebdf]/55 backdrop-blur-md"
          : "sticky top-0 z-50 w-full border-b border-ev-sand bg-ev-ivory/95 backdrop-blur-sm"
      }
    >
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-accent-gold">EchoField</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-6">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-accent-savanna min-h-[44px] flex items-center ${
                  isActive
                    ? "text-accent-savanna"
                    : isOverlay
                      ? "text-[#5d4a34]"
                      : "text-ev-elephant"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`sm:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
            isOverlay
              ? "text-[#5d4a34] hover:text-[#3f3121]"
              : "text-ev-elephant hover:text-ev-charcoal"
          }`}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <nav
          className={
            isOverlay
              ? "sm:hidden border-t border-[#b59a76]/30 bg-[#f4ebdf]/90 px-4 py-2"
              : "sm:hidden border-t border-ev-sand bg-ev-cream px-4 py-2"
          }
        >
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block py-3 text-sm font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? "text-accent-savanna"
                    : isOverlay
                      ? "text-[#5d4a34]"
                      : "text-ev-elephant"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
