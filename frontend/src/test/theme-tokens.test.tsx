import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

// ── cn utility ──

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("resolves tailwind conflicts via twMerge", () => {
    // twMerge keeps the last conflicting class
    expect(cn("p-4", "p-6")).toBe("p-6");
  });
});

// ── Button ──

describe("Button", () => {
  it("renders with default variant", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("bg-accent-teal");
  });

  it("renders outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button", { name: "Outline" });
    expect(btn.className).toContain("border");
    expect(btn.className).toContain("bg-transparent");
  });

  it("renders success variant", () => {
    render(<Button variant="success">OK</Button>);
    const btn = screen.getByRole("button", { name: "OK" });
    expect(btn.className).toContain("bg-success");
  });

  it("renders ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button", { name: "Ghost" });
    expect(btn.className).toContain("hover:bg-echofield-surface-elevated");
  });

  it("renders all sizes", () => {
    const { rerender } = render(<Button size="sm">S</Button>);
    expect(screen.getByRole("button").className).toContain("h-8");

    rerender(<Button size="default">M</Button>);
    expect(screen.getByRole("button").className).toContain("h-10");

    rerender(<Button size="lg">L</Button>);
    expect(screen.getByRole("button").className).toContain("h-12");

    rerender(<Button size="icon">I</Button>);
    expect(screen.getByRole("button").className).toContain("w-10");
  });

  it("can be disabled", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders as child when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/test">Link</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
  });
});

// ── Badge ──

describe("Badge", () => {
  it("renders default variant", () => {
    render(<Badge>Status</Badge>);
    const badge = screen.getByText("Status");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-accent-teal/10");
  });

  it("renders success variant", () => {
    render(<Badge variant="success">OK</Badge>);
    expect(screen.getByText("OK").className).toContain("bg-success/10");
  });

  it("renders warning variant", () => {
    render(<Badge variant="warning">Warn</Badge>);
    expect(screen.getByText("Warn").className).toContain("bg-warning/10");
  });

  it("renders danger variant", () => {
    render(<Badge variant="danger">Error</Badge>);
    expect(screen.getByText("Error").className).toContain("bg-danger/10");
  });

  it("renders gold variant", () => {
    render(<Badge variant="gold">Gold</Badge>);
    expect(screen.getByText("Gold").className).toContain("bg-gold/10");
  });

  it("renders outline variant", () => {
    render(<Badge variant="outline">Tag</Badge>);
    expect(screen.getByText("Tag").className).toContain("border-echofield-border");
  });
});

// ── Card ──

describe("Card", () => {
  it("renders card structure", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    expect(screen.getByTestId("card").className).toContain("bg-echofield-surface");
    expect(screen.getByTestId("card").className).toContain("border-echofield-border");
    expect(screen.getByText("Title").tagName).toBe("H3");
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Card data-testid="card" className="custom-class">Content</Card>);
    expect(screen.getByTestId("card").className).toContain("custom-class");
  });
});

// ── Input ──

describe("Input", () => {
  it("renders with dark theme styling", () => {
    render(<Input placeholder="Search..." />);
    const input = screen.getByPlaceholderText("Search...");
    expect(input).toBeInTheDocument();
    expect(input.className).toContain("bg-echofield-surface");
    expect(input.className).toContain("border-echofield-border");
  });

  it("can be disabled", () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText("Disabled")).toBeDisabled();
  });
});

// ── Progress ──

describe("Progress", () => {
  it("renders with correct background", () => {
    render(<Progress value={50} data-testid="progress" />);
    const root = screen.getByTestId("progress");
    expect(root.className).toContain("bg-echofield-surface-elevated");
  });

  it("renders indicator", () => {
    render(<Progress value={75} data-testid="progress" />);
    const root = screen.getByTestId("progress");
    const indicator = root.firstElementChild;
    expect(indicator).not.toBeNull();
    expect((indicator as HTMLElement).style.width).toBe("75%");
  });
});

// ── Design Token Consistency ──

describe("Design token consistency", () => {
  it("all components use echofield color tokens (not hardcoded hex)", () => {
    // Verify that our component variants reference theme tokens, not raw hex values.
    // This is a structural test — we check the variant strings contain token references.
    render(
      <div>
        <Button data-testid="btn">Test</Button>
        <Card data-testid="card">Card</Card>
        <Input data-testid="input" />
        <Badge data-testid="badge">Badge</Badge>
      </div>
    );

    const btn = screen.getByTestId("btn");
    const card = screen.getByTestId("card");
    const input = screen.getByTestId("input");
    const badge = screen.getByTestId("badge");

    // No raw hex colors in class names — all should use tailwind tokens
    const hexPattern = /#[0-9a-fA-F]{6}/;
    expect(btn.className).not.toMatch(hexPattern);
    expect(card.className).not.toMatch(hexPattern);
    expect(input.className).not.toMatch(hexPattern);
    expect(badge.className).not.toMatch(hexPattern);
  });
});
