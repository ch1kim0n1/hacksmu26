import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock useSidebar hook
const mockSetMobileOpen = vi.fn();
vi.mock("@/hooks/useSidebar", () => ({
  MobileSidebarContext: React.createContext({
    mobileOpen: false,
    setMobileOpen: () => {},
  }),
  useMobileSidebarState: () => ({ mobileOpen: false, setMobileOpen: mockSetMobileOpen }),
  useMobileSidebar: () => ({ mobileOpen: false, setMobileOpen: mockSetMobileOpen }),
}));

import Sidebar from "@/components/layout/Sidebar";

describe("Sidebar — Research section links", () => {
  it("renders the Research section heading", () => {
    render(<Sidebar />);
    expect(screen.getByText("Research")).toBeInTheDocument();
  });

  it("renders an Export link pointing to /export", () => {
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /Export/ });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/export");
  });

  it("renders a Compare link pointing to /compare", () => {
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /Compare/ });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/compare");
  });

  it("renders a Review Queue link pointing to /review", () => {
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /Review Queue/ });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/review");
  });

  it("renders correct labels for all three Research links", () => {
    render(<Sidebar />);
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
  });
});
