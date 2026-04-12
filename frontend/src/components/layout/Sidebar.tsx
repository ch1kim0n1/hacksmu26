"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Upload,
  BarChart3,
  Database,
  Waves,
  Radio,
  Layers,
  Users,
  BookOpen,
  Network,
  Monitor,
  Brain,
  MapPin,
  PieChart,
  GitBranch,
  Box,
  Webhook,
  Blocks,
} from "lucide-react";
import { useMobileSidebar } from "@/hooks/useSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/* ── Navigation data ── */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Main",
    items: [
      { href: "/upload", label: "Upload", icon: Upload },
      { href: "/recordings", label: "Recordings", icon: Layers },
      { href: "/elephants", label: "Elephants", icon: Users },
      { href: "/research/ethology", label: "Call Guide", icon: BookOpen },
      { href: "/research/social-network", label: "Social Network", icon: Network },
      { href: "/research/sound-vectors", label: "Sound Vectors", icon: Blocks },
      { href: "/field-monitor", label: "Field Monitor", icon: Monitor },
      { href: "/realtime", label: "Real-Time Filter", icon: Radio },
    ],
  },
  {
    title: "Analysis",
    items: [
      { href: "/results", label: "Results", icon: BarChart3 },
      { href: "/database", label: "Call Database", icon: Database },
      { href: "/analytics", label: "Analytics", icon: PieChart },
      { href: "/patterns", label: "Patterns", icon: GitBranch },
      { href: "/sites", label: "Sites", icon: MapPin },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/ml-training", label: "ML Training", icon: Brain },
      { href: "/models", label: "Models", icon: Box },
      { href: "/webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
];

/* ── Sidebar link ── */

function SidebarLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-white/[0.08] text-accent-savanna"
          : "text-ev-dust hover:bg-white/[0.05] hover:text-ev-cream"
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div
          className="absolute left-0 inset-y-1.5 w-[3px] rounded-r-full bg-gradient-to-b from-accent-savanna to-accent-gold"
          style={{ boxShadow: "0 0 8px rgba(196, 164, 108, 0.4)" }}
        />
      )}

      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
          isActive
            ? "text-accent-savanna"
            : "text-ev-dust/70 group-hover:text-ev-cream"
        )}
      />

      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/* ── Sidebar content (shared between desktop + mobile) ── */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ScrollArea className="flex-1">
      <nav className="flex flex-col gap-1 p-3">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title}>
            {i > 0 && <Separator className="my-2 bg-[#3A3530]" />}

            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-ev-dust/50">
              {section.title}
            </p>

            {section.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>
    </ScrollArea>
  );
}

/* ── Logo header ── */

function SidebarLogo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex items-center gap-3 h-14 px-4 border-b border-[#3A3530] shrink-0">
      <Link href="/" onClick={onNavigate} className="shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-savanna to-accent-deep-gold flex items-center justify-center shadow-lg shadow-accent-savanna/25">
          <Waves className="w-[18px] h-[18px] text-white" />
        </div>
      </Link>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-ev-cream truncate">
          EchoField
        </span>
        <span className="text-[10px] text-ev-dust/60 truncate">
          Vocalization Platform
        </span>
      </div>
    </div>
  );
}

/* ── Desktop sidebar ── */

export default function Sidebar() {
  const { mobileOpen, setMobileOpen } = useMobileSidebar();

  return (
    <>
      {/* Desktop — always expanded */}
      <aside className="hidden md:flex flex-col w-[220px] bg-[#1E1B19] shrink-0 border-r border-[#3A3530] relative z-30">
        <SidebarLogo />
        <SidebarNav />

        {/* Footer in sidebar */}
        <div className="border-t border-[#3A3530] px-4 py-3 shrink-0">
          <p className="text-[10px] text-ev-dust/40 text-center">
            Built for HackSMU 2026
          </p>
          <p className="text-[10px] text-ev-dust/30 text-center">
            ElephantVoices Track
          </p>
        </div>
      </aside>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[260px] p-0 bg-[#1E1B19] border-r border-[#3A3530]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarLogo onNavigate={() => setMobileOpen(false)} />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <div className="border-t border-[#3A3530] px-4 py-3 shrink-0">
            <p className="text-[10px] text-ev-dust/40 text-center">
              Built for HackSMU 2026 — ElephantVoices Track
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
