"use client";

import { useState, createContext, useContext } from "react";

interface MobileSidebarContextValue {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const MobileSidebarContext = createContext<MobileSidebarContextValue>({
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function useMobileSidebarState() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return { mobileOpen, setMobileOpen };
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}
