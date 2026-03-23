# CLAUDE.md — Instanceiro

## Project

Instanceiro is a Ragnarok Online instance tracker (Next.js 16, React 19, Tailwind CSS v4, Supabase). Portuguese (pt-BR) UI.

## Design System

**All styling MUST use design tokens.** Never use hardcoded hex colors in components or pages.

### Color Tokens (defined in `src/app/globals.css`)

| Token class | Role |
|-------------|------|
| `bg-bg` | Page background |
| `bg-surface` | Cards, panels, elevated surfaces |
| `border-border` | All borders and dividers |
| `text-text-primary` | Headings, body text |
| `text-text-secondary` | Metadata, labels, muted text |
| `bg-primary` / `text-primary` | Accent color (Copper), CTA buttons |
| `text-primary-secondary` | Secondary accent (Amber) |
| `hover:bg-primary-hover` | Button/element hover |
| `bg-card-hover-bg` | Card hover background |
| `ring-focus-ring` | Focus rings |
| `bg-disabled-bg` / `text-disabled-text` | Disabled states |

### Status Colors

| Status | Border class | Text class | Badge pattern |
|--------|-------------|------------|---------------|
| Available | `card-status-available` | `text-status-available-text` | `bg-[color-mix(...)] text-status-available-text` |
| Soon (<1h) | `card-status-soon` | `text-status-soon-text` | `bg-[color-mix(...)] text-status-soon-text` |
| Cooldown | `card-status-cooldown` | `text-status-cooldown-text` | `bg-[color-mix(...)] text-status-cooldown-text` |
| Error | `card-status-error` | `text-status-error-text` | `bg-[color-mix(...)] text-status-error-text` |

### Forbidden Patterns

These will be **blocked by the pre-commit hook** (`scripts/check-design-tokens.sh`):

- `bg-[#hex]`, `text-[#hex]`, `border-[#hex]` — use a token instead
- Any old theme colors: `#0f0a1a`, `#1a1230`, `#2a1f40`, `#3D2A5C`, `#7C3AED`, `#6D28D9`, `#A89BC2`, `#6B5A8A`, `#9B6DFF`
- Raw Tailwind color names for theme colors (e.g., `bg-purple-500`) — use `bg-primary` instead

**Exceptions** (allowed hardcoded hex):
- `src/app/globals.css` — token definitions
- `src/app/icon.svg` — favicon (SVGs can't use CSS vars)
- `src/components/auth/login-button.tsx` — third-party brand colors (Discord, Google)
- `color-mix(in srgb, var(--token) N%, transparent)` in className for translucent backgrounds

### Typography

- Font: **Outfit** (loaded via `next/font/google` in layout.tsx)
- Use `font-sans` (mapped to Outfit via `@theme inline`)
- Weights: 400 (body), 500 (nav), 600 (headings/buttons/labels), 700 (h1/logo)

### Border Radius

- `rounded-sm` / `rounded-[var(--radius-sm)]` — 4px (badges)
- `rounded-md` / `rounded-[var(--radius-md)]` — 8px (cards, buttons)
- `rounded-lg` / `rounded-[var(--radius-lg)]` — 12px (modals, panels)

### Icons

Duotone style: `stroke="var(--primary)"` + `fill="var(--primary)" fillOpacity="var(--icon-fill-opacity)"`

### Key Components

- `<Logo size="sm|md|lg" />` — shield+clock icon + "Instanceiro" text
- `<ThemeToggle />` — dark/light mode switch
- `<StatusBadge status="available|soon|cooldown|error" />` — colored status pill
- `<ShieldIcon status="..." />` — status-aware shield SVG

### Theme System

- Tokens switch automatically via `data-theme="dark|light"` on `<html>`
- `ThemeProvider` in `src/lib/theme.tsx` manages state
- Anti-flash inline script in layout.tsx prevents FOUC
- Default: dark. Respects `prefers-color-scheme` on first visit.

## Full Spec

See `docs/superpowers/specs/2026-03-23-visual-identity-design.md` for the complete design system specification.
