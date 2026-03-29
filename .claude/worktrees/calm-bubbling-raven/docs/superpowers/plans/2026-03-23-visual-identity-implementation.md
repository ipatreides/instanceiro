# Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Instanceiro visual identity design spec — replacing the current purple/gold hardcoded theme with a token-based Obsidian+Copper system supporting dark and light modes.

**Architecture:** CSS custom properties defined in `globals.css` with dark/light theme classes on `<html>`. Tailwind v4's `@theme inline` block maps tokens to Tailwind utilities. The Outfit font replaces Arial via `next/font/google`. A `ThemeProvider` component manages theme state with `prefers-color-scheme` detection and localStorage persistence. An inline script prevents theme flash on load.

**Tech Stack:** Next.js 16 + Tailwind CSS v4 + CSS custom properties + `next/font/google` (Outfit)

**Deferred:** Lucide React icon library migration (spec recommends it but the current inline SVGs work fine — can be adopted incrementally later). "Soon" threshold configurability (spec mentions it, will use hardcoded 60 minutes for now).

**Spec:** `docs/superpowers/specs/2026-03-23-visual-identity-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/components/ui/theme-toggle.tsx` | Dark/light toggle button |
| `src/components/ui/logo.tsx` | SVG logo component (3 size variants + logotype) |
| `src/components/ui/status-badge.tsx` | Status badge (available/soon/cooldown/error) |
| `src/components/ui/shield-icon.tsx` | Status-aware shield icon |
| `src/lib/theme.tsx` | ThemeProvider context + `useTheme` hook |
| `src/app/icon.svg` | SVG favicon (16px simplified shield) |

### Modified files
| File | Changes |
|------|---------|
| `src/app/globals.css` | Replace CSS variables with full token system, dark/light themes |
| `src/app/layout.tsx` | Add Outfit font via `next/font`, wrap with ThemeProvider |
| `src/app/page.tsx` | Replace hardcoded colors with token classes |
| `src/app/login/page.tsx` | Replace hardcoded colors with token classes |
| `src/app/signup/page.tsx` | Replace hardcoded colors with token classes |
| `src/app/dashboard/page.tsx` | Replace hardcoded colors, add logo, update layout |
| `src/components/instances/instance-card.tsx` | Use new status tokens + shield icon + status badge |
| `src/components/ui/modal.tsx` | Replace hardcoded colors with token classes |
| `src/components/ui/spinner.tsx` | Replace purple with primary token |
| `src/components/auth/login-button.tsx` | Update button styling to match new identity |
| Remaining components (accounts, characters, friends, instances, notifications, schedules) | Replace hardcoded hex colors with semantic token classes |

---

## Task 1: Design Tokens + Theme CSS

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace globals.css with full token system**

```css
@import "tailwindcss";

/* ── Dark theme (default) ── */
:root,
[data-theme="dark"] {
  --bg: #0a0a0f;
  --surface: #141420;
  --border: #1e1e2e;
  --primary: #C87941;
  --primary-secondary: #E8A665;
  --primary-hover: #b56a35;
  --text-primary: #e8e8f0;
  --text-secondary: #7a7a8e;
  --status-available: #4a9a5a;
  --status-available-text: #6abf7a;
  --status-soon: #d4a843;
  --status-soon-text: #f0c060;
  --status-cooldown: #C87941;
  --status-cooldown-text: #E8A665;
  --status-error: #c44040;
  --status-error-text: #f07070;
  --icon-fill-opacity: 0.15;
  --card-hover-bg: #181830;
  --card-hover-border: #3a3a4a;
  --disabled-bg: #3a3a4a;
  --disabled-text: #5a5a6e;
  --focus-ring: #E8A665;
  --card-shadow: none;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

/* ── Light theme ── */
[data-theme="light"] {
  --bg: #f8f7f5;
  --surface: #ffffff;
  --border: #e5e2dc;
  --primary: #a0612e;
  --primary-secondary: #c4863e;
  --primary-hover: #8a5020;
  --text-primary: #1a1a1a;
  --text-secondary: #706b65;
  --status-available: #2e8a3e;
  --status-available-text: #1e6a2e;
  --status-soon: #b8922e;
  --status-soon-text: #8a6e1a;
  --status-cooldown: #a0612e;
  --status-cooldown-text: #8a5020;
  --status-error: #b83030;
  --status-error-text: #8a2020;
  --icon-fill-opacity: 0.10;
  --card-hover-bg: transparent;
  --card-hover-border: #d5d2cc;
  --disabled-bg: #e5e2dc;
  --disabled-text: #b5b0a8;
  --focus-ring: #c4863e;
  --card-shadow: 0 1px 3px #0000000a;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

@theme inline {
  --font-sans: var(--font-outfit);
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-secondary: var(--primary-secondary);
  --color-primary-hover: var(--primary-hover);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-status-available: var(--status-available);
  --color-status-available-text: var(--status-available-text);
  --color-status-soon: var(--status-soon);
  --color-status-soon-text: var(--status-soon-text);
  --color-status-cooldown: var(--status-cooldown);
  --color-status-cooldown-text: var(--status-cooldown-text);
  --color-status-error: var(--status-error);
  --color-status-error-text: var(--status-error-text);
  --color-card-hover-bg: var(--card-hover-bg);
  --color-card-hover-border: var(--card-hover-border);
  --color-disabled-bg: var(--disabled-bg);
  --color-disabled-text: var(--disabled-text);
  --color-focus-ring: var(--focus-ring);
  --shadow-card: var(--card-shadow);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}

body {
  background: var(--bg);
  color: var(--text-primary);
}

/* Hide all scrollbars globally — overflow containers should be draggable */
* {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
*::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 2: Verify the app still renders**

Run: `cd D:/rag/instance-tracker && npm run dev`

Open http://localhost:3000 — page should render (colors will still be hardcoded in components, but body background changes to Obsidian). Verify no CSS errors in console.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add design token system with dark/light theme CSS variables"
```

---

## Task 2: Outfit Font + Layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install no new packages (next/font is built-in). Update layout.tsx**

```tsx
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Instanceiro",
  description: "Gerencie suas instâncias de Ragnarok Online",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="dark" className={outfit.variable}>
      <body className="bg-bg text-text-primary min-h-screen antialiased font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
```

Note: `font-sans` works because `@theme inline` maps `--font-sans` to `var(--font-outfit)`.

- [ ] **Step 2: Verify font loads**

Run: `npm run dev`

Open http://localhost:3000 — text should render in Outfit (geometric sans-serif, noticeably different from Arial). Check DevTools → Elements → body → computed font-family shows "Outfit".

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: add Outfit font via next/font and update layout tokens"
```

---

## Task 3: Theme Provider + Toggle

**Files:**
- Create: `src/lib/theme.tsx`
- Create: `src/components/ui/theme-toggle.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create ThemeProvider**

Create `src/lib/theme.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: "dark", toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored) {
      setTheme(stored);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 2: Create ThemeToggle button**

Create `src/components/ui/theme-toggle.tsx`:

```tsx
"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-[var(--radius-md)] border border-border text-text-secondary hover:text-text-primary hover:border-primary transition-colors"
      aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Wrap layout with ThemeProvider**

In `src/app/layout.tsx`, add ThemeProvider import and wrap `{children}`:

```tsx
import { ThemeProvider } from "@/lib/theme";
```

Update the body content to:
```tsx
<body className="bg-bg text-text-primary min-h-screen antialiased font-[family-name:var(--font-outfit)]" suppressHydrationWarning>
  <ThemeProvider>{children}</ThemeProvider>
</body>
```

Also remove the static `data-theme="dark"` from `<html>` since ThemeProvider sets it dynamically. Add an inline script to prevent theme flash (FOUC). The html tag and body become:
```tsx
<html lang="pt-BR" className={outfit.variable} suppressHydrationWarning>
  <head>
    <script dangerouslySetInnerHTML={{ __html: `
      (function() {
        var t = localStorage.getItem('theme');
        if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', t);
      })();
    `}} />
  </head>
  <body className="bg-bg text-text-primary min-h-screen antialiased font-sans" suppressHydrationWarning>
    <ThemeProvider>{children}</ThemeProvider>
  </body>
</html>
```

This script runs synchronously before React hydration, so the correct theme is applied before any paint.

- [ ] **Step 4: Verify theme toggle works**

Run: `npm run dev`

Temporarily add `<ThemeToggle />` to the landing page or open DevTools and run `document.documentElement.setAttribute('data-theme', 'light')` — background should switch from Obsidian to Cream. Run it again with 'dark' to switch back.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.tsx src/components/ui/theme-toggle.tsx src/app/layout.tsx
git commit -m "feat: add ThemeProvider with dark/light toggle and localStorage persistence"
```

---

## Task 4: Logo + Favicon

**Files:**
- Create: `src/components/ui/logo.tsx`
- Create: `src/app/icon.svg`
- Delete: `src/app/favicon.ico`

- [ ] **Step 1: Create Logo component**

Create `src/components/ui/logo.tsx`:

```tsx
interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 32, className }: LogoIconProps) {
  if (size <= 16) {
    // Simplified: shield + center dot
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className}>
        <path d="M40 10 L64 22 L64 44 Q64 62 40 72 Q16 62 16 44 L16 22 Z" stroke="var(--primary)" strokeWidth="8" fill="color-mix(in srgb, var(--primary) 12%, transparent)" strokeLinejoin="round" />
        <circle cx="40" cy="40" r="9" fill="var(--primary)" />
      </svg>
    );
  }

  if (size <= 32) {
    // Medium: shield + clock circle + hands
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className}>
        <path d="M40 10 L64 22 L64 44 Q64 62 40 72 Q16 62 16 44 L16 22 Z" stroke="var(--primary)" strokeWidth="5" fill="color-mix(in srgb, var(--primary) 12%, transparent)" strokeLinejoin="round" />
        <circle cx="40" cy="40" r="14" stroke="var(--primary-secondary)" strokeWidth="3" fill="none" />
        <line x1="40" y1="40" x2="40" y2="29" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" />
        <line x1="40" y1="40" x2="49" y2="40" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="40" cy="40" r="3.5" fill="var(--primary)" />
      </svg>
    );
  }

  // Full: shield + clock + hour marks
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className={className}>
      <path d="M40 10 L64 22 L64 44 Q64 62 40 72 Q16 62 16 44 L16 22 Z" stroke="var(--primary)" strokeWidth="4.5" fill="color-mix(in srgb, var(--primary) 10%, transparent)" strokeLinejoin="round" />
      <circle cx="40" cy="40" r="16" stroke="var(--primary-secondary)" strokeWidth="2.5" fill="none" />
      <line x1="40" y1="40" x2="40" y2="27" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="40" y1="40" x2="50" y2="40" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="40" r="3" fill="var(--primary)" />
      <line x1="40" y1="24.5" x2="40" y2="27" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
      <line x1="55.5" y1="40" x2="53" y2="40" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="55.5" x2="40" y2="53" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
      <line x1="24.5" y1="40" x2="27" y2="40" stroke="var(--primary-secondary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const SIZES = { sm: 20, md: 28, lg: 48 } as const;
const TEXT_SIZES = { sm: "text-lg", md: "text-xl", lg: "text-4xl" } as const;

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  const iconSize = SIZES[size];

  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoIcon size={iconSize} />
      {showText && (
        <span className={`font-bold tracking-tight text-text-primary ${TEXT_SIZES[size]}`}>
          Instanceiro
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create SVG favicon**

Create `src/app/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 80 80" fill="none">
  <path d="M40 10 L64 22 L64 44 Q64 62 40 72 Q16 62 16 44 L16 22 Z" stroke="#C87941" stroke-width="6" fill="#C8794118" stroke-linejoin="round"/>
  <circle cx="40" cy="40" r="14" stroke="#E8A665" stroke-width="3" fill="none"/>
  <line x1="40" y1="40" x2="40" y2="29" stroke="#C87941" stroke-width="4" stroke-linecap="round"/>
  <line x1="40" y1="40" x2="49" y2="40" stroke="#C87941" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="40" cy="40" r="3" fill="#C87941"/>
</svg>
```

- [ ] **Step 3: Delete old favicon**

```bash
rm src/app/favicon.ico
```

Next.js 16 auto-discovers `icon.svg` in the app directory.

- [ ] **Step 4: Verify favicon renders**

Run: `npm run dev`

Open http://localhost:3000 — browser tab should show the copper shield icon instead of the old Next.js favicon.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/logo.tsx src/app/icon.svg
git rm src/app/favicon.ico
git commit -m "feat: add Logo component with 3 size variants and SVG favicon"
```

---

## Task 5: Status Badge + Shield Icon Components

**Files:**
- Create: `src/components/ui/status-badge.tsx`
- Create: `src/components/ui/shield-icon.tsx`

- [ ] **Step 1: Create StatusBadge component**

Create `src/components/ui/status-badge.tsx`:

```tsx
type Status = "available" | "soon" | "cooldown" | "error";

const BADGE_STYLES: Record<Status, string> = {
  available: "bg-[color-mix(in_srgb,var(--status-available)_12%,transparent)] text-status-available-text",
  soon: "bg-[color-mix(in_srgb,var(--status-soon)_12%,transparent)] text-status-soon-text",
  cooldown: "bg-[color-mix(in_srgb,var(--status-cooldown)_12%,transparent)] text-status-cooldown-text",
  error: "bg-[color-mix(in_srgb,var(--status-error)_12%,transparent)] text-status-error-text",
};

const LABELS: Record<Status, string> = {
  available: "Disponível",
  soon: "Quase lá",
  cooldown: "Cooldown",
  error: "Erro",
};

interface StatusBadgeProps {
  status: Status;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] ${BADGE_STYLES[status]} ${className ?? ""}`}>
      {label ?? LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Create ShieldIcon component**

Create `src/components/ui/shield-icon.tsx`:

```tsx
type Status = "available" | "soon" | "cooldown" | "error";

const STATUS_COLORS: Record<Status, { stroke: string; fill: string }> = {
  available: { stroke: "var(--status-available)", fill: "var(--status-available)" },
  soon: { stroke: "var(--status-soon)", fill: "var(--status-soon)" },
  cooldown: { stroke: "var(--primary)", fill: "var(--primary)" },
  error: { stroke: "var(--status-error)", fill: "var(--status-error)" },
};

interface ShieldIconProps {
  status: Status;
  size?: number;
  className?: string;
}

export function ShieldIcon({ status, size = 18, className }: ShieldIconProps) {
  const { stroke, fill } = STATUS_COLORS[status];

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        fill={fill}
        fillOpacity="var(--icon-fill-opacity)"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Verify components render**

Temporarily import and render `<StatusBadge status="available" />` and `<ShieldIcon status="cooldown" />` on the landing page. Verify copper/jade/gold colors appear correctly. Remove the test renders.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/status-badge.tsx src/components/ui/shield-icon.tsx
git commit -m "feat: add StatusBadge and ShieldIcon components with token-based colors"
```

---

## Task 6: Landing Page Migration

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update landing page to use new tokens and logo**

Replace all hardcoded hex colors with token-based Tailwind classes. Key replacements:
- `bg-[#0f0a1a]` → `bg-bg`
- `bg-[#1a1230]` → `bg-surface`
- `border-[#3D2A5C]` → `border-border`
- `text-[#A89BC2]` → `text-text-secondary`
- `text-[#D4A843]` → `text-primary`
- `text-white` → `text-text-primary`
- `text-[#6B5A8A]` → `text-text-secondary`

Import and use the `Logo` component for the hero. Import `ThemeToggle` and place it in the top-right corner.

Replace inline SVG icons in feature cards with duotone-styled SVGs using `var(--primary)` stroke and `fill="var(--primary)" fill-opacity="var(--icon-fill-opacity)"`.

Add hover transition to feature cards: `hover:border-primary/40 transition-colors`.

For the login button CTA area, use `bg-primary text-bg hover:bg-primary-hover` (dark mode) which auto-adapts in light mode.

- [ ] **Step 2: Verify landing page renders correctly in both themes**

Run: `npm run dev`

Open http://localhost:3000. Verify:
- Dark mode: Obsidian background, Copper accents, Outfit font
- Toggle to light: Cream background, darker Copper, warm borders
- Feature card hover shows copper border tint
- Logo renders with shield icon

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: migrate landing page to new visual identity tokens"
```

---

## Task 7: Auth Pages Migration (Login + Signup)

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/signup/page.tsx`

- [ ] **Step 1: Update login page**

Same hex→token replacements as Task 6. Use `Logo` component for the header. Ensure form inputs use `bg-surface border-border text-text-primary` with `focus:ring-2 focus:ring-focus-ring` for focus states.

- [ ] **Step 2: Update signup page**

Same pattern. Replace all hardcoded colors with tokens.

- [ ] **Step 3: Verify both pages in both themes**

Run: `npm run dev`

Navigate to /login and /signup. Verify Obsidian+Copper in dark, Cream+Copper-dark in light. Verify input focus rings use Amber/Amber-dark.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/signup/page.tsx
git commit -m "feat: migrate auth pages to new visual identity tokens"
```

---

## Task 8: Instance Card Migration

**Files:**
- Modify: `src/components/instances/instance-card.tsx`

- [ ] **Step 1: Update status mappings and card styling**

Replace the `STATUS_BORDER` and `STATUS_DOT` maps:

```tsx
const STATUS_BORDER: Record<string, string> = {
  available: "border-l-status-available",
  cooldown: "border-l-status-cooldown",
  inactive: "border-l-disabled-bg",
};

const STATUS_DOT: Record<string, string> = {
  available: "bg-status-available",
  cooldown: "bg-status-cooldown",
  inactive: "bg-disabled-bg",
};
```

Replace card container classes:
- `bg-[#1a1230]` → `bg-surface`
- `border-[#3D2A5C]` → `border-border`
- `hover:bg-[#221840]` → `hover:bg-card-hover-bg`
- `rounded-md` → `rounded-md` (now mapped via `@theme inline`)
- Add `shadow-card` for light mode card shadows

Add hover left-border brightening per status. Use a wrapper approach — create CSS classes in globals.css or apply via group hover:

```css
/* Add to globals.css after the theme blocks */
.card-status-available { border-left-color: var(--status-available); }
.card-status-available:hover { border-left-color: var(--status-available-text); }
.card-status-cooldown { border-left-color: var(--status-cooldown); }
.card-status-cooldown:hover { border-left-color: var(--status-cooldown-text); }
.card-status-soon { border-left-color: var(--status-soon); }
.card-status-soon:hover { border-left-color: var(--status-soon-text); }
.card-status-error { border-left-color: var(--status-error); }
.card-status-error:hover { border-left-color: var(--status-error-text); }
```

Then use these classes on the card instead of Tailwind's `border-l-*` utilities.

Replace text classes:
- `text-white` → `text-text-primary`
- `text-orange-400` → `text-status-cooldown-text`
- `text-[#A89BC2]` → `text-text-secondary`
- `text-amber-400` → `text-primary-secondary`
- `text-purple-400` → `text-primary`

Add `shadow-[var(--card-shadow)]` to the card for light mode shadows.

- [ ] **Step 2: Verify instance cards render in dashboard**

Run: `npm run dev`, log in, navigate to /dashboard. Verify instance cards show copper borders for cooldown, green for available. Toggle theme and verify light mode shadows appear.

- [ ] **Step 3: Commit**

```bash
git add src/components/instances/instance-card.tsx
git commit -m "feat: migrate instance card to new status tokens and visual identity"
```

---

## Task 9: Dashboard Page Migration

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Update dashboard page**

This is the largest file. Key changes:
- Replace all hardcoded hex colors with token classes (same mapping as Task 6)
- Add `Logo` component in the top-left header area
- Add `ThemeToggle` in the top-right header area
- Replace any `#7C3AED` (purple) button colors with `bg-primary text-bg hover:bg-primary-hover`
- Replace `#6D28D9` hover with `hover:bg-primary-hover`
- Replace `#D4A843` gold accents with `text-primary-secondary`
- Update modal backgrounds from `#1a1230` / `#2a1f40` to `bg-surface`

Work through the file systematically — search for each hex color pattern and replace.

- [ ] **Step 2: Verify dashboard in both themes**

Run: `npm run dev`, navigate to /dashboard. Verify:
- Header shows logo + theme toggle
- All cards, modals, buttons use new tokens
- Light mode: cream bg, white cards with shadows, warm borders
- No remaining purple (#7C3AED) visible

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: migrate dashboard to new visual identity with logo and theme toggle"
```

---

## Task 10: UI Components Migration (Modal + Spinner)

**Files:**
- Modify: `src/components/ui/modal.tsx`
- Modify: `src/components/ui/spinner.tsx`

- [ ] **Step 1: Update modal.tsx**

Replace:
- `bg-[#1a1230]` → `bg-surface`
- `border-[#3D2A5C]` → `border-border`
- `bg-[#2a1f40]` → `bg-bg`
- `text-white` → `text-text-primary`
- Any purple colors → `text-primary` / `bg-primary`
- Overlay: `bg-black/60` (keep, works in both themes)
- Border radius: use `rounded-[var(--radius-lg)]` for the modal container

- [ ] **Step 2: Update spinner.tsx**

Replace:
- `border-[#7C3AED]` → `border-primary`
- Keep `border-t-transparent` as-is

- [ ] **Step 3: Verify modal and spinner**

Open a modal in the dashboard (click an instance card). Verify the modal uses surface/border tokens. Toggle theme and verify. Verify spinner color is copper.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/modal.tsx src/components/ui/spinner.tsx
git commit -m "feat: migrate modal and spinner to new visual identity tokens"
```

---

## Task 11: Remaining Components Migration

**Files:**
- Modify: All remaining components in `src/components/` that use hardcoded hex colors

Components to update (apply the same hex→token mapping):
- `src/components/accounts/account-bar.tsx`
- `src/components/accounts/account-container.tsx`
- `src/components/accounts/account-modal.tsx`
- `src/components/accounts/create-account-modal.tsx`
- `src/components/auth/login-button.tsx`
- `src/components/characters/character-form.tsx`
- `src/components/characters/character-share-tab.tsx`
- `src/components/friends/friends-sidebar.tsx`
- `src/components/instances/instance-column.tsx`
- `src/components/instances/instance-modal.tsx`
- `src/components/instances/instance-modal-details.tsx`
- `src/components/instances/instance-modal-history.tsx`
- `src/components/instances/instance-search.tsx`
- `src/components/instances/mobile-instance-tabs.tsx`
- `src/components/instances/participant-list.tsx`
- `src/components/notifications/notification-bell.tsx`
- `src/components/notifications/notification-item.tsx`
- `src/components/schedules/schedule-card.tsx`
- `src/components/schedules/schedule-form.tsx`
- `src/components/schedules/schedule-modal.tsx`
- `src/components/schedules/schedule-section.tsx`
- `src/components/ui/datetime-picker.tsx`

- [ ] **Step 1: Batch replace all hardcoded colors**

For each file, apply these replacements:

| Old Pattern | New Class |
|------------|-----------|
| `bg-[#0f0a1a]` | `bg-bg` |
| `bg-[#1a1230]` | `bg-surface` |
| `bg-[#2a1f40]` | `bg-bg` |
| `bg-[#221840]` | `bg-card-hover-bg` |
| `border-[#3D2A5C]` | `border-border` |
| `text-[#A89BC2]` | `text-text-secondary` |
| `text-[#6B5A8A]` | `text-text-secondary` |
| `text-[#D4A843]` | `text-primary-secondary` |
| `bg-[#7C3AED]` | `bg-primary` |
| `hover:bg-[#6D28D9]` | `hover:bg-primary-hover` |
| `text-[#9B6DFF]` | `text-primary` |
| `border-[#7C3AED]` | `border-primary` |
| `ring-[#7C3AED]` | `ring-focus-ring` |
| `text-white` (in colored contexts) | `text-text-primary` |
| `text-green-500` | `text-status-available` |
| `bg-green-500` | `bg-status-available` |
| `text-orange-400` | `text-status-cooldown-text` |
| `bg-orange-400` | `bg-status-cooldown` |
| `bg-gray-600` | `bg-disabled-bg` |
| `text-gray-600` | `text-disabled-text` |
| `bg-red-600` | `bg-status-error` |
| `text-red-600` | `text-status-error` |

Also update `rounded-md` / `rounded-lg` to use token-based radius where appropriate.

- [ ] **Step 2: Verify full app in both themes**

Run: `npm run dev`

Navigate through all major flows:
- Landing page
- Login / Signup
- Dashboard (instances, schedules, accounts)
- Open modals (instance detail, create account, create character)
- Notifications dropdown
- Friends sidebar

Toggle between dark and light. Verify no remaining hardcoded purple or old hex colors.

- [ ] **Step 3: Search for remaining hardcoded colors**

Run a grep to find any remaining hardcoded hex colors:

```bash
grep -rn "#0f0a1a\|#1a1230\|#2a1f40\|#3D2A5C\|#7C3AED\|#6D28D9\|#A89BC2\|#6B5A8A\|#D4A843\|#221840\|#9B6DFF" src/
```

Fix any remaining occurrences.

- [ ] **Step 4: Commit**

```bash
git add src/components/
git commit -m "feat: migrate all remaining components to new visual identity tokens"
```

---

## Task 12: Remaining Pages Migration

**Files:**
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/forgot-password/page.tsx`
- Modify: `src/app/reset-password/page.tsx`
- Modify: `src/app/invite/[code]/page.tsx`

- [ ] **Step 1: Update all remaining pages**

Apply the same hex→token mapping from Task 11 to these pages.

- [ ] **Step 2: Verify all pages**

Navigate to /profile, /forgot-password, /reset-password. Verify tokens applied in both themes.

- [ ] **Step 3: Final grep for hardcoded colors**

```bash
grep -rn "#0f0a1a\|#1a1230\|#2a1f40\|#3D2A5C\|#7C3AED\|#6D28D9\|#A89BC2\|#6B5A8A\|#D4A843\|#221840\|#352a50\|#ededed" src/
```

Fix any remaining occurrences. The only acceptable hex in `src/` should be in `globals.css` (theme definitions) and `icon.svg`.

- [ ] **Step 4: Commit**

```bash
git add src/app/
git commit -m "feat: migrate remaining pages to visual identity tokens"
```

---

## Task 13: Final Verification + Cleanup

**Files:**
- Possibly modify: any files with issues found during verification

- [ ] **Step 1: Full visual regression test**

Run: `npm run dev`

Walk through every page and feature in both themes:
1. Landing page — logo, feature cards, CTA button, footer
2. Login + Signup — forms, OAuth buttons, links
3. Dashboard — instance cards, columns, account bar, friends sidebar
4. Modals — instance detail, create account, create character, schedule
5. Profile page
6. Notifications dropdown

Verify:
- No flash of wrong theme on page load (ThemeProvider handles this)
- Focus rings use Amber/Amber-dark
- Status colors: green=available, copper=cooldown, gold=soon (if applicable)
- All text is legible in both themes
- Spinner is copper

- [ ] **Step 2: Run existing tests**

```bash
npm test
npx playwright test
```

Fix any test failures caused by changed class names or text content.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Verify no build errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add src/
git commit -m "fix: resolve visual regression issues from identity migration"
```
