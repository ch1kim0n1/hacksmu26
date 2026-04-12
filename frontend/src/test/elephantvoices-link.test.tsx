import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/upload",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock useSidebar hook
vi.mock("@/hooks/useSidebar", () => ({
  MobileSidebarContext: React.createContext({
    mobileOpen: false,
    setMobileOpen: () => {},
  }),
  useMobileSidebarState: () => ({ mobileOpen: false, setMobileOpen: vi.fn() }),
  useMobileSidebar: () => ({ mobileOpen: false, setMobileOpen: vi.fn() }),
}));

import Sidebar from "@/components/layout/Sidebar";

describe("ElephantVoices link in Sidebar", () => {
  it("renders ElephantVoices Track as a link to elephantvoices.org", () => {
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /elephantvoices track/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://www.elephantvoices.org");
  });

  it("opens ElephantVoices link in a new tab", () => {
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /elephantvoices track/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
