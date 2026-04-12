"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, Waves, Bell, Search, HelpCircle } from "lucide-react";
import { useMobileSidebar } from "@/hooks/useSidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Breadcrumb from "./Breadcrumb";

const PAGE_TITLES: Record<string, string> = {
  "/upload": "Upload Recordings",
  "/recordings": "Recordings",
  "/results": "Results",
  "/database": "Call Database",
  "/processing": "Processing",
  "/export": "Export",
  "/realtime": "Real-Time Filter",
  "/compare": "Compare",
  "/review": "Review",
  "/batch": "Batch Processing",
};

export default function Header() {
  const pathname = usePathname();
  const { setMobileOpen } = useMobileSidebar();

  const title =
    Object.entries(PAGE_TITLES).find(
      ([path]) => pathname === path || pathname.startsWith(path + "/")
    )?.[1] || "Dashboard";

  return (
    <header className="sticky top-0 z-40 w-full bg-[#1E1B19] border-b border-[#3A3530]">
      <div className="flex h-14 items-center gap-4 px-6">
        {/* Mobile sidebar trigger */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9 text-ev-dust hover:text-ev-cream hover:bg-white/[0.06]"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        {/* Mobile logo */}
        <Link href="/" className="md:hidden shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-savanna to-accent-deep-gold flex items-center justify-center">
            <Waves className="w-3.5 h-3.5 text-white" />
          </div>
        </Link>

        {/* Page title + breadcrumb */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <h1 className="text-sm font-semibold text-ev-cream truncate">
            {title}
          </h1>
          <div className="hidden sm:block">
            <Breadcrumb />
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-1">
          {/* Search */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex h-9 w-9 text-ev-dust hover:text-ev-cream hover:bg-white/[0.06]"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Help */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex h-9 w-9 text-ev-dust hover:text-ev-cream hover:bg-white/[0.06]"
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-ev-dust hover:text-ev-cream hover:bg-white/[0.06]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent-savanna" />
          </Button>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 gap-2 rounded-lg px-2 text-ev-dust hover:text-ev-cream hover:bg-white/[0.06]"
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src="https://api.dicebear.com/9.x/avataaars/svg?seed=EchoField&backgroundColor=c4a46c" alt="Dr. Amara Osei" />
                  <AvatarFallback>AO</AvatarFallback>
                </Avatar>
                <span className="hidden lg:inline text-sm font-medium">Dr. Osei</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Dr. Amara Osei</span>
                  <span className="text-xs text-ev-dust/60">a.osei@elephantvoices.org</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem>
                <Link href="/export" className="w-full">Export Data</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-ev-dust/60">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
