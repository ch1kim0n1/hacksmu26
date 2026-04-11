"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const SIDEBAR_LINKS = [
  { href: "/", label: "Home", icon: "\uD83C\uDFE0" },
  { href: "/upload", label: "Upload", icon: "\uD83D\uDCC1" },
  { href: "/database", label: "Database", icon: "\uD83D\uDCCA" },
  { href: "/export", label: "Export", icon: "\uD83D\uDCE5" },
  { href: "/about", label: "About", icon: "\u2139\uFE0F" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-echofield-border bg-echofield-surface transition-all duration-200 ${
        collapsed ? "w-16" : "w-52"
      }`}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-10 items-center justify-center border-b border-echofield-border text-echofield-text-secondary hover:text-echofield-text-primary transition-colors"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "\u25B6" : "\u25C0"}
      </button>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {SIDEBAR_LINKS.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-echofield-surface-elevated text-accent-teal"
                  : "text-echofield-text-secondary hover:bg-echofield-surface-elevated hover:text-echofield-text-primary"
              }`}
              title={collapsed ? link.label : undefined}
            >
              <span className="text-base">{link.icon}</span>
              {!collapsed && <span>{link.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
