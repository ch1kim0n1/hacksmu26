# ElephantVoices Design System

> **Purpose**: This document defines the complete visual language for the ElephantVoices web application. It is the single source of truth for all UI decisions. When building any component, page, or layout — reference this file first.
>
> **Stack**: Next.js 14+ (App Router), React, Tailwind CSS v3+

---

## 1. Design Philosophy

The design is inspired by elephants themselves — their textured gray skin, the warm African savanna they inhabit, and the gravity of the conservation mission. The aesthetic is **refined editorial naturalism**: premium and sophisticated, but warm and approachable — never cold or corporate.

### Core Principles

- **Warmth over neutrality**: No pure white (#fff) or pure black (#000) anywhere. Every neutral is warm-shifted.
- **Restraint over decoration**: Generous whitespace, thin borders, subtle transitions. Let photography and typography carry the emotion.
- **Editorial hierarchy**: Three typographic voices create rhythm — emotional display, informational serif, functional sans.
- **Surgical accent color**: Gold is used sparingly and intentionally — only for eyebrows, CTAs, hover states, and key interactive elements.
- **Tactile quality**: Backgrounds feel like paper, not screens. Borders at 0.5px. Cards lift gently, never aggressively.

---

## 2. Color Palette

### 2.1 Tailwind Configuration

Add these to `tailwind.config.ts` under `theme.extend.colors`:

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette — Elephant grays (warm-shifted)
        ev: {
          charcoal: "#2C2926",    // Deepest tone — primary text, dark sections bg
          "charcoal-light": "#4A453F", // Dark UI elements, footer bg
          elephant: "#6B6560",    // Secondary text, icons
          "warm-gray": "#8A837B", // Tertiary text, captions, placeholders
          dust: "#B5ADA4",        // Disabled states, subtle borders
          sand: "#D4CCC3",        // Borders, dividers, input borders
          cream: "#F0EBE3",       // Card backgrounds, surface color
          ivory: "#F8F5F0",       // Page background — USE INSTEAD OF white
        },

        // Accent palette — Savanna & landscape
        accent: {
          savanna: "#C4A46C",     // Primary accent — CTAs, links, hover highlights
          gold: "#A8873B",        // Active states, hover on accent elements
          "deep-gold": "#8B6E2F", // Pressed states, dark-mode accent text
        },

        // Supporting palette — Nature
        nature: {
          sage: "#7A8B6F",        // Conservation sections, success states
          "deep-sage": "#5A6B4F", // Hover on sage elements
          earth: "#6B4F3A",       // Warm supporting color, earth-toned sections
          terracotta: "#C4785A",  // Warm highlight, alert/attention (non-destructive)
          sunset: "#D4956B",      // Decorative gradients, warm overlays
        },

        // Semantic aliases (map to the palette above)
        background: {
          page: "#F8F5F0",        // = ev-ivory
          surface: "#F0EBE3",     // = ev-cream
          elevated: "#FFFFFF",    // Cards that need to pop on cream bg (rare)
          dark: "#2C2926",        // = ev-charcoal
          "dark-surface": "#4A453F", // = ev-charcoal-light
        },
      },

      borderColor: {
        DEFAULT: "#D4CCC3", // = ev-sand
      },
    },
  },
  plugins: [],
};

export default config;
```

### 2.2 CSS Custom Properties

Also define these in your global CSS (`globals.css`) for use in arbitrary values and non-Tailwind contexts:

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Primary */
  --ev-charcoal: #2C2926;
  --ev-charcoal-light: #4A453F;
  --ev-elephant: #6B6560;
  --ev-warm-gray: #8A837B;
  --ev-dust: #B5ADA4;
  --ev-sand: #D4CCC3;
  --ev-cream: #F0EBE3;
  --ev-ivory: #F8F5F0;

  /* Accent */
  --ev-savanna: #C4A46C;
  --ev-gold: #A8873B;
  --ev-deep-gold: #8B6E2F;

  /* Nature */
  --ev-sage: #7A8B6F;
  --ev-deep-sage: #5A6B4F;
  --ev-earth: #6B4F3A;
  --ev-terracotta: #C4785A;
  --ev-sunset: #D4956B;
}

/* Warm page background — applied to <body> or root layout */
body {
  background-color: var(--ev-ivory);
  color: var(--ev-charcoal);
}
```

### 2.3 Color Usage Rules

| Role | Color | Tailwind Class | When to Use |
|------|-------|----------------|-------------|
| Page background | Ivory `#F8F5F0` | `bg-ev-ivory` | Always. Never use `bg-white`. |
| Card / surface bg | Cream `#F0EBE3` | `bg-ev-cream` | Cards, sections, panels, sidebar bg |
| Primary text | Charcoal `#2C2926` | `text-ev-charcoal` | Headlines, body text, primary labels |
| Secondary text | Elephant `#6B6560` | `text-ev-elephant` | Subtitles, descriptions, secondary info |
| Tertiary text | Warm Gray `#8A837B` | `text-ev-warm-gray` | Captions, timestamps, helper text, placeholders |
| Accent / CTA | Savanna `#C4A46C` | `text-accent-savanna` / `bg-accent-savanna` | Links, buttons, eyebrow labels, active tab indicators |
| Accent hover | Gold `#A8873B` | `hover:text-accent-gold` / `hover:bg-accent-gold` | Hover state for any savanna-colored element |
| Borders | Sand `#D4CCC3` | `border-ev-sand` | All borders and dividers — always at `border` (1px) or use `border-[0.5px]` for refined look |
| Dark sections | Charcoal `#2C2926` | `bg-ev-charcoal` | Hero alternates, footer, feature highlights |
| Dark section text | Cream `#F0EBE3` | `text-ev-cream` | Text on dark backgrounds |
| Dark section muted | Dust `#B5ADA4` | `text-ev-dust` | Secondary text on dark backgrounds |
| Conservation / nature | Sage `#7A8B6F` | `bg-nature-sage` | Research sections, nature-themed cards, success |
| Warm sections | Terracotta `#C4785A` | `bg-nature-terracotta` | Advocacy sections, warm callouts |
| Disabled | Dust `#B5ADA4` | `text-ev-dust` / `bg-ev-dust` | Disabled buttons, inactive tabs |

### 2.4 Gradient Recipes

Use sparingly — only for card image areas, hero overlays, and decorative sections:

```jsx
// Nature / conservation card header
<div className="bg-gradient-to-br from-nature-sage to-nature-deep-sage" />

// Gold / savanna card header
<div className="bg-gradient-to-br from-accent-savanna to-accent-deep-gold" />

// Earth / advocacy card header
<div className="bg-gradient-to-br from-nature-earth to-nature-terracotta" />

// Dark hero overlay (on top of imagery)
<div className="bg-gradient-to-t from-ev-charcoal/90 via-ev-charcoal/40 to-transparent" />

// Subtle warm fade for section breaks
<div className="bg-gradient-to-b from-ev-ivory to-ev-cream" />
```

---

## 3. Typography

### 3.1 Font Setup

Three Google Fonts, each with a specific role:

```tsx
// app/layout.tsx
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local"; // if using Instrument Serif locally
// OR import from Google:
// import { Instrument_Serif } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

// Instrument Serif — only Regular + Italic exist
// Import from Google Fonts:
// const instrumentSerif = Instrument_Serif({
//   subsets: ["latin"],
//   weight: ["400"],
//   style: ["normal", "italic"],
//   variable: "--font-instrument",
//   display: "swap",
// });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${jakarta.variable}`}
      // Add instrumentSerif.variable if using it
    >
      <body className="bg-ev-ivory text-ev-charcoal font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

Add font families to Tailwind config:

```ts
// tailwind.config.ts — add inside theme.extend
fontFamily: {
  display: ["var(--font-cormorant)", "Georgia", "serif"],
  accent: ["var(--font-instrument)", "Georgia", "serif"],
  sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
},
```

### 3.2 Typographic Scale

| Role | Font | Weight | Size (Tailwind) | Line Height | Letter Spacing | Tailwind Classes |
|------|------|--------|-----------------|-------------|----------------|-----------------|
| Hero headline | Cormorant Garamond | 300 (Light) | `text-5xl` to `text-7xl` | `leading-[1.1]` | `tracking-tight` | `font-display font-light text-5xl md:text-7xl leading-[1.1] tracking-tight` |
| Section headline | Cormorant Garamond | 300 (Light) | `text-3xl` to `text-5xl` | `leading-[1.15]` | `tracking-tight` | `font-display font-light text-3xl md:text-5xl leading-[1.15] tracking-tight` |
| Subsection headline | Cormorant Garamond | 400 (Regular) | `text-2xl` to `text-3xl` | `leading-snug` | default | `font-display text-2xl md:text-3xl leading-snug` |
| Editorial subheading | Instrument Serif | 400 | `text-xl` to `text-2xl` | `leading-relaxed` | default | `font-accent text-xl md:text-2xl leading-relaxed` |
| Editorial italic | Instrument Serif | 400 Italic | `text-lg` to `text-xl` | `leading-relaxed` | default | `font-accent italic text-lg md:text-xl leading-relaxed text-ev-elephant` |
| Body text | Plus Jakarta Sans | 400 | `text-base` (16px) | `leading-relaxed` (1.625) | default | `font-sans text-base leading-relaxed text-ev-elephant` |
| Body emphasis | Plus Jakarta Sans | 600 | `text-base` | `leading-relaxed` | default | `font-sans font-semibold text-base leading-relaxed text-ev-charcoal` |
| Eyebrow / overline | Plus Jakarta Sans | 500 | `text-xs` (12px) | `leading-normal` | `tracking-[0.15em]` | `font-sans font-medium text-xs uppercase tracking-[0.15em] text-accent-savanna` |
| Navigation links | Plus Jakarta Sans | 500 | `text-xs` (12px) | `leading-normal` | `tracking-[0.1em]` | `font-sans font-medium text-xs uppercase tracking-[0.1em] text-ev-warm-gray hover:text-accent-gold transition-colors` |
| Button text | Plus Jakarta Sans | 600 | `text-[11px]` | `leading-normal` | `tracking-[0.14em]` | `font-sans font-semibold text-[11px] uppercase tracking-[0.14em]` |
| Caption / small | Plus Jakarta Sans | 400 | `text-sm` (14px) | `leading-normal` | default | `font-sans text-sm text-ev-warm-gray` |
| Stat number | Cormorant Garamond | 300 | `text-3xl` to `text-4xl` | `leading-none` | default | `font-display font-light text-3xl md:text-4xl leading-none text-accent-savanna` |
| Stat label | Plus Jakarta Sans | 500 | `text-[10px]` | `leading-normal` | `tracking-[0.12em]` | `font-sans font-medium text-[10px] uppercase tracking-[0.12em] text-ev-warm-gray` |

### 3.3 Typography Rules

1. **Headlines are always `font-light` (300)** — never bold. The high contrast of Cormorant Garamond at light weight is the signature look.
2. **Body text is always `text-ev-elephant`**, not charcoal. Charcoal is reserved for headlines and emphasized body text.
3. **Eyebrows are always uppercase, tracked, and gold** (`text-accent-savanna`). They precede headlines.
4. **Never use underlines for links** — use color change (`text-accent-savanna hover:text-accent-gold`) with `transition-colors`.
5. **Max line width for body text**: `max-w-prose` (65ch) or `max-w-xl`. Never let body text span full width.

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

Use Tailwind's default spacing scale, with these preferred values:

- **Section padding**: `py-16 md:py-24 lg:py-32` (vertical), `px-6 md:px-12 lg:px-16` (horizontal)
- **Card padding**: `p-6` or `p-8`
- **Between sections**: `space-y-24 md:space-y-32`
- **Between headline + body**: `mt-4` or `mt-6`
- **Between eyebrow + headline**: `mb-3` or `mb-4`
- **Grid gap**: `gap-4` (cards), `gap-6` (content blocks), `gap-8` (feature sections)
- **Stat row gap**: `gap-8 md:gap-12`

### 4.2 Container

```tsx
// Use a custom container — NOT Tailwind's default container
// Max width: 1200px, centered with generous side padding

const Section = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <section className={`mx-auto max-w-[1200px] px-6 md:px-12 lg:px-16 ${className}`}>
    {children}
  </section>
);
```

### 4.3 Grid Patterns

```tsx
// 3-column content card grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" />

// 2-column feature layout (text + image)
<div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center" />

// 4-column stat row
<div className="flex flex-wrap justify-center gap-8 md:gap-12" />

// 2-column footer
<div className="grid grid-cols-1 md:grid-cols-4 gap-8" />
```

---

## 5. Component Patterns

### 5.1 Buttons

```tsx
// Primary button — dark fill
<button className="
  bg-ev-charcoal text-ev-ivory
  font-sans font-semibold text-[11px] uppercase tracking-[0.14em]
  px-8 py-3.5
  rounded-sm
  hover:bg-ev-elephant
  transition-colors duration-300
  cursor-pointer
">
  Explore the ethogram
</button>

// Secondary button — outline
<button className="
  bg-transparent text-ev-charcoal
  font-sans font-semibold text-[11px] uppercase tracking-[0.14em]
  px-8 py-3.5
  rounded-sm
  border border-ev-sand
  hover:border-accent-gold hover:text-accent-gold
  transition-colors duration-300
  cursor-pointer
">
  Support our work
</button>

// Accent button — gold fill (use on dark backgrounds)
<button className="
  bg-accent-savanna text-ev-charcoal
  font-sans font-semibold text-[11px] uppercase tracking-[0.14em]
  px-8 py-3.5
  rounded-sm
  hover:bg-accent-gold
  transition-colors duration-300
  cursor-pointer
">
  Donate now
</button>

// Text link button — minimal
<button className="
  text-accent-savanna
  font-sans font-medium text-sm
  hover:text-accent-gold
  transition-colors duration-300
  cursor-pointer
  inline-flex items-center gap-1.5
">
  Learn more →
</button>
```

**Button rules:**
- Buttons always use `rounded-sm` (2px) — never fully rounded or pill-shaped
- Primary action: dark fill. Secondary: outline. On dark bg: gold fill.
- Always uppercase with wide letter-spacing
- Padding: `px-8 py-3.5` standard, `px-6 py-3` compact

### 5.2 Cards

```tsx
// Content card with image header
<div className="
  bg-white
  border border-ev-sand/60
  rounded-xl
  overflow-hidden
  transition-transform duration-200
  hover:-translate-y-0.5
">
  {/* Image area — use gradient or actual image */}
  <div className="h-48 bg-gradient-to-br from-nature-sage to-nature-deep-sage" />

  {/* Content */}
  <div className="p-5">
    <p className="font-sans font-semibold text-[10px] uppercase tracking-[0.1em] text-accent-savanna mb-1.5">
      Research
    </p>
    <h3 className="font-accent text-lg text-ev-charcoal leading-snug mb-2">
      Elephant name-like calls
    </h3>
    <p className="font-sans text-sm text-ev-warm-gray leading-relaxed">
      Elephants address family members with individualized vocalizations.
    </p>
  </div>
</div>

// Flat info card (no image, for stats or info blocks)
<div className="bg-ev-cream rounded-lg p-5">
  <p className="font-sans font-semibold text-[11px] uppercase tracking-[0.06em] text-ev-charcoal mb-1">
    Role label
  </p>
  <p className="font-sans text-sm text-ev-elephant">
    Description or value
  </p>
</div>
```

**Card rules:**
- Cards use `rounded-xl` (12px)
- Border: `border border-ev-sand/60` — subtle, warm
- Hover: `hover:-translate-y-0.5` — gentle lift, never dramatic shadow
- No drop shadows. Ever. Use border + subtle translate for depth.

### 5.3 Navigation

```tsx
<nav className="flex items-center justify-between px-6 md:px-12 lg:px-16 py-4 border-b border-ev-sand/40">
  {/* Logo */}
  <a className="font-display font-medium text-lg text-ev-charcoal tracking-wide">
    ElephantVoices
  </a>

  {/* Links */}
  <div className="hidden md:flex items-center gap-6">
    <a className="font-sans font-medium text-xs uppercase tracking-[0.1em] text-ev-warm-gray hover:text-accent-gold transition-colors duration-300">
      Research
    </a>
    <a className="font-sans font-medium text-xs uppercase tracking-[0.1em] text-ev-warm-gray hover:text-accent-gold transition-colors duration-300">
      Ethogram
    </a>
    <a className="font-sans font-medium text-xs uppercase tracking-[0.1em] text-ev-warm-gray hover:text-accent-gold transition-colors duration-300">
      Conservation
    </a>
    <a className="font-sans font-medium text-xs uppercase tracking-[0.1em] text-ev-warm-gray hover:text-accent-gold transition-colors duration-300">
      About
    </a>

    {/* CTA */}
    <a className="
      bg-ev-charcoal text-ev-ivory
      font-sans font-semibold text-[11px] uppercase tracking-[0.12em]
      px-5 py-2.5 rounded-sm
      hover:bg-ev-elephant transition-colors duration-300
    ">
      Donate
    </a>
  </div>
</nav>
```

### 5.4 Hero Section

```tsx
// Light hero
<section className="bg-ev-ivory py-20 md:py-32 text-center">
  <div className="mx-auto max-w-[1200px] px-6">
    <p className="font-sans font-medium text-xs uppercase tracking-[0.18em] text-accent-savanna mb-4">
      Conservation · Advocacy · Research · Education
    </p>
    <h1 className="font-display font-light text-4xl md:text-6xl lg:text-7xl leading-[1.1] tracking-tight text-ev-charcoal mb-5 max-w-3xl mx-auto">
      Every voice matters. Theirs most of all.
    </h1>
    <p className="font-sans text-base md:text-lg leading-relaxed text-ev-warm-gray max-w-md mx-auto mb-8">
      Inspiring wonder in the intelligence, complexity and voices of elephants.
    </p>
    <div className="flex items-center justify-center gap-3">
      {/* Primary + Secondary buttons here */}
    </div>
  </div>
</section>

// Dark hero
<section className="bg-ev-charcoal py-20 md:py-32 text-center">
  <div className="mx-auto max-w-[1200px] px-6">
    <p className="font-sans font-medium text-xs uppercase tracking-[0.18em] text-accent-savanna mb-4">
      The Elephant Ethogram
    </p>
    <h1 className="font-display font-light text-4xl md:text-6xl leading-[1.1] tracking-tight text-ev-cream mb-5">
      A library of African elephant behavior
    </h1>
    <p className="font-sans text-base leading-relaxed text-ev-dust max-w-md mx-auto mb-8">
      Nearly 3,000 video clips, sounds and images — fully searchable.
    </p>
    {/* Use accent/gold button on dark bg */}
  </div>
</section>
```

### 5.5 Stat Row

```tsx
<div className="flex flex-wrap justify-center gap-10 md:gap-14 py-8 border-t border-ev-sand/40">
  {[
    { value: "40+", label: "Years of research" },
    { value: "10,400", label: "Recorded calls" },
    { value: "322", label: "Documented behaviors" },
    { value: "420k+", label: "Community members" },
  ].map((stat) => (
    <div key={stat.label} className="text-center">
      <p className="font-display font-light text-3xl md:text-4xl leading-none text-accent-savanna">
        {stat.value}
      </p>
      <p className="font-sans font-medium text-[10px] uppercase tracking-[0.12em] text-ev-warm-gray mt-2">
        {stat.label}
      </p>
    </div>
  ))}
</div>
```

### 5.6 Section Header Pattern

```tsx
// Standard section intro (centered)
<div className="text-center mb-12 md:mb-16">
  <p className="font-sans font-medium text-xs uppercase tracking-[0.15em] text-accent-savanna mb-3">
    Eyebrow label
  </p>
  <h2 className="font-display font-light text-3xl md:text-5xl leading-[1.15] tracking-tight text-ev-charcoal mb-4">
    Section headline here
  </h2>
  <p className="font-sans text-base leading-relaxed text-ev-warm-gray max-w-lg mx-auto">
    Supporting description text that provides context.
  </p>
</div>

// Left-aligned section intro
<div className="mb-10 md:mb-14">
  <p className="font-sans font-medium text-xs uppercase tracking-[0.15em] text-accent-savanna mb-3">
    Eyebrow label
  </p>
  <h2 className="font-display font-light text-3xl md:text-4xl leading-[1.15] tracking-tight text-ev-charcoal mb-4 max-w-xl">
    Section headline here
  </h2>
  <p className="font-sans text-base leading-relaxed text-ev-elephant max-w-prose">
    Supporting description text.
  </p>
</div>
```

### 5.7 Dividers & Borders

```tsx
// Horizontal divider
<hr className="border-t border-ev-sand/40 my-12 md:my-16" />

// Section with top border
<section className="border-t border-ev-sand/40 pt-16 md:pt-24">
  {/* content */}
</section>

// Labeled divider (like the design system sections)
<div className="border-b border-ev-sand/60 pb-2 mb-8">
  <p className="font-display font-medium text-[13px] uppercase tracking-[0.15em] text-ev-warm-gray">
    01 — Section name
  </p>
</div>
```

### 5.8 Form Inputs

```tsx
// Text input
<input
  type="text"
  placeholder="Your email address"
  className="
    w-full
    bg-transparent
    border border-ev-sand
    rounded-sm
    px-4 py-3
    font-sans text-sm text-ev-charcoal
    placeholder:text-ev-dust
    focus:outline-none focus:border-accent-savanna
    transition-colors duration-200
  "
/>

// Newsletter signup row
<div className="flex gap-3">
  <input
    type="email"
    placeholder="Enter your email"
    className="flex-1 bg-transparent border border-ev-sand rounded-sm px-4 py-3 font-sans text-sm text-ev-charcoal placeholder:text-ev-dust focus:outline-none focus:border-accent-savanna transition-colors"
  />
  <button className="bg-ev-charcoal text-ev-ivory font-sans font-semibold text-[11px] uppercase tracking-[0.14em] px-6 py-3 rounded-sm hover:bg-ev-elephant transition-colors">
    Subscribe
  </button>
</div>
```

---

## 6. Imagery & Media Guidelines

### 6.1 Photo Treatment
- Prefer warm-toned, natural-light photography of elephants in their habitat
- Apply a subtle warm overlay when photos feel too cool: `mix-blend-multiply` with a cream/sand overlay div
- Never use stock-looking photos with oversaturated colors

### 6.2 Image Overlays
```tsx
// Warm overlay on photo
<div className="relative">
  <img src="..." className="w-full h-full object-cover" />
  <div className="absolute inset-0 bg-ev-cream/10 mix-blend-multiply" />
</div>

// Dark gradient overlay for text on images
<div className="relative">
  <img src="..." className="w-full h-full object-cover" />
  <div className="absolute inset-0 bg-gradient-to-t from-ev-charcoal/80 via-ev-charcoal/30 to-transparent" />
  <div className="absolute bottom-0 left-0 p-8">
    {/* text content */}
  </div>
</div>
```

### 6.3 Icons & Illustrations
- Use simple line-style icons (1px or 1.5px stroke weight)
- Icon color: `text-ev-elephant` default, `text-accent-savanna` for interactive
- Prefer Lucide React or Heroicons (outline variant) — never filled/solid icons
- Custom SVG illustrations should use palette colors only

---

## 7. Motion & Transitions

### 7.1 Standard Transitions
```tsx
// Color transitions (links, buttons, borders)
"transition-colors duration-300"

// Transform transitions (card hover)
"transition-transform duration-200"

// Combined (for elements with multiple changes)
"transition-all duration-300 ease-out"
```

### 7.2 Page Load Animations (Framer Motion)

```tsx
// Fade up on scroll into view
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, ease: "easeOut" },
};

// Staggered children
const staggerContainer = {
  initial: {},
  whileInView: { transition: { staggerChildren: 0.1 } },
  viewport: { once: true },
};

const staggerChild = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};
```

### 7.3 Motion Rules
- Entry animations: only `opacity` + `translateY` (fade up). Never slide from sides or scale.
- Duration: 300–600ms for entry, 200–300ms for interactions
- Easing: `ease-out` for entries, `ease-in-out` for hover states
- Never animate layout properties (width, height, padding)
- `viewport: { once: true }` — animations fire once, never replay on scroll back

---

## 8. Dark Mode (Optional)

If implementing dark mode, follow these mappings:

| Light Mode | Dark Mode | Notes |
|------------|-----------|-------|
| `bg-ev-ivory` | `bg-ev-charcoal` | Page background |
| `bg-ev-cream` | `bg-ev-charcoal-light` | Surface/card background |
| `text-ev-charcoal` | `text-ev-cream` | Primary text |
| `text-ev-elephant` | `text-ev-dust` | Secondary text |
| `text-ev-warm-gray` | `text-ev-warm-gray` | Tertiary (stays same) |
| `text-accent-savanna` | `text-accent-savanna` | Accent (stays same) |
| `border-ev-sand` | `border-ev-elephant/30` | Borders |
| `bg-ev-charcoal` (dark section) | `bg-ev-cream` (inverted) | Feature sections flip |

---

## 9. Responsive Breakpoints

Follow Tailwind defaults with these design-specific notes:

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Default (mobile) | < 768px | Single column, `text-4xl` headlines, stacked nav |
| `md` | ≥ 768px | 2-column grids, `text-5xl` headlines, visible nav |
| `lg` | ≥ 1024px | 3-column grids, `text-6xl`+ headlines, full layout |
| `xl` | ≥ 1280px | Max container width (1200px), generous whitespace |

---

## 10. Do's and Don'ts

### Do
- Use Ivory (`#F8F5F0`) as the page background — always
- Use Cormorant Garamond at `font-light` (300) for all headlines
- Use gold/savanna sparingly — it should feel precious, not everywhere
- Keep borders at 0.5px or 1px max — always `border-ev-sand`
- Let whitespace do the work — generous padding between sections
- Use `tracking-[0.1em]`+ on all uppercase text
- Use `max-w-prose` or `max-w-xl` to constrain body text width
- Prefer `rounded-sm` (2px) for buttons, `rounded-xl` (12px) for cards

### Don't
- Never use pure `#FFFFFF` white or `#000000` black
- Never use `font-bold` (700) on Cormorant Garamond headlines — always `font-light`
- Never use drop shadows or box shadows (except focus rings on inputs)
- Never use rounded-full / pill-shaped buttons
- Never underline links
- Never use more than one accent color in a single section
- Never put body text directly on a dark background without reducing to `text-ev-dust` or `text-ev-cream`
- Never use Inter, Roboto, Arial, or system fonts — stick to the three fonts defined here
- Never use colored backgrounds for full sections without a clear purpose (dark = feature highlight, sage = nature, earth = advocacy)
- Never let headlines run wider than `max-w-3xl`

---

## 11. Quick Reference — Copy-Paste Classes

```
HEADLINE:       font-display font-light text-4xl md:text-6xl leading-[1.1] tracking-tight text-ev-charcoal
SUBHEADLINE:    font-accent text-xl md:text-2xl leading-relaxed text-ev-charcoal
EYEBROW:        font-sans font-medium text-xs uppercase tracking-[0.15em] text-accent-savanna
BODY:           font-sans text-base leading-relaxed text-ev-elephant
BODY EMPHASIS:  font-sans font-semibold text-base text-ev-charcoal
CAPTION:        font-sans text-sm text-ev-warm-gray
NAV LINK:       font-sans font-medium text-xs uppercase tracking-[0.1em] text-ev-warm-gray hover:text-accent-gold transition-colors
STAT NUMBER:    font-display font-light text-3xl md:text-4xl leading-none text-accent-savanna
STAT LABEL:     font-sans font-medium text-[10px] uppercase tracking-[0.12em] text-ev-warm-gray
PAGE BG:        bg-ev-ivory
SURFACE BG:     bg-ev-cream
CARD:           bg-white border border-ev-sand/60 rounded-xl overflow-hidden hover:-translate-y-0.5 transition-transform
BORDER:         border-ev-sand/40
DARK SECTION:   bg-ev-charcoal text-ev-cream
BTN PRIMARY:    bg-ev-charcoal text-ev-ivory font-sans font-semibold text-[11px] uppercase tracking-[0.14em] px-8 py-3.5 rounded-sm hover:bg-ev-elephant transition-colors
BTN SECONDARY:  bg-transparent text-ev-charcoal border border-ev-sand font-sans font-semibold text-[11px] uppercase tracking-[0.14em] px-8 py-3.5 rounded-sm hover:border-accent-gold hover:text-accent-gold transition-colors
BTN ACCENT:     bg-accent-savanna text-ev-charcoal font-sans font-semibold text-[11px] uppercase tracking-[0.14em] px-8 py-3.5 rounded-sm hover:bg-accent-gold transition-colors
```
