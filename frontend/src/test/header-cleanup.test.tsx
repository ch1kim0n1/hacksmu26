import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/navigation
const mockUsePathname = vi.fn(() => "/upload");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock useSidebar hook
const mockSetMobileOpen = vi.fn();
vi.mock("@/hooks/useSidebar", () => ({
  MobileSidebarContext: React.createContext({
    mobileOpen: false,
    setMobileOpen: () => {},
  }),
  useMobileSidebarState: () => ({
    mobileOpen: false,
    setMobileOpen: mockSetMobileOpen,
  }),
  useMobileSidebar: () => ({
    mobileOpen: false,
    setMobileOpen: mockSetMobileOpen,
  }),
}));

// Mock Radix dropdown to render content inline (not portaled)
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="dropdown-item">{children}</div>,
  DropdownMenuLabel: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="dropdown-label">{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

import Header from "@/components/layout/Header";

describe("Header cleanup — non-functional elements removed (#207)", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/upload");
  });

  it("does not render a Search button", () => {
    render(<Header />);
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
  });

  it("does not render a Help button", () => {
    render(<Header />);
    expect(screen.queryByLabelText("Help")).not.toBeInTheDocument();
  });

  it("does not render a Notifications button", () => {
    render(<Header />);
    expect(screen.queryByLabelText("Notifications")).not.toBeInTheDocument();
  });

  it("does not render a fake notification dot", () => {
    const { container } = render(<Header />);
    const dot = container.querySelector(".bg-accent-savanna");
    expect(dot).toBeNull();
  });

  it("still renders the user avatar", () => {
    render(<Header />);
    expect(screen.getByText("AO")).toBeInTheDocument();
    expect(screen.getByText("Dr. Osei")).toBeInTheDocument();
  });

  it("still renders the Export Data link in the dropdown", () => {
    render(<Header />);
    expect(screen.getByText("Export Data")).toBeInTheDocument();
  });

  it("does not render Profile menu item in the dropdown", () => {
    render(<Header />);
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("does not render Settings menu item in the dropdown", () => {
    render(<Header />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("does not render Sign Out menu item in the dropdown", () => {
    render(<Header />);
    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
  });

  it("still renders page title", () => {
    render(<Header />);
    expect(screen.getByText("Upload Recordings")).toBeInTheDocument();
  });

  it("still renders mobile sidebar trigger", () => {
    render(<Header />);
    expect(screen.getByLabelText("Open navigation")).toBeInTheDocument();
  });
});
