# Instanceiro — Visual Identity Design

## Overview

Visual identity system for Instanceiro, a Ragnarok Online instance tracker for the LATAM community. The app is open-source and community-facing but not aiming to be a commercial product — the identity should be clean, distinctive, and functional.

**Design direction:** Minimalist/functional with personality. No heavy RPG theming.

## Logo

### Concept: Shield + Clock

A shield silhouette (adventure/protection) containing a clock face (cooldown/time management). Combines the two core concepts of the app: instances and time tracking.

### Icon Variants (progressive simplification)

| Size | Detail Level | Description |
|------|-------------|-------------|
| **48px+** (full) | Complete | Shield outline + clock circle + hour/minute hands + 4 hour marks |
| **32px** (avatar) | Medium | Shield outline + clock circle + hands + center dot. No hour marks |
| **16px** (favicon) | Minimal | Shield silhouette + solid center dot. No clock details |

### Logo Composition

- **Full logo:** Icon (48px) + "Instanceiro" logotype
- **Compact:** Icon (24-32px) + "Instanceiro" logotype
- **Icon only:** For favicon, app icon, avatar contexts

### Construction Notes

- Shield stroke: 4.5px (reinforced for presence next to bold text)
- Clock circle stroke: 2.5px (secondary element, lighter than shield)
- Shield fill: translucent primary color (10-12% opacity)
- Primary color: Copper (dark) / Copper-dark (light)
- Secondary color: Amber (dark) / Amber-dark (light)

## Color System

### Design Tokens (semantic, theme-agnostic)

| Token | Role | Dark Mode | Light Mode |
|-------|------|-----------|------------|
| `--bg` | Page background | `#0a0a0f` Obsidian | `#f8f7f5` Cream |
| `--surface` | Cards, panels | `#141420` Onyx | `#ffffff` White |
| `--border` | Dividers, card borders | `#1e1e2e` Charcoal | `#e5e2dc` Sand |
| `--primary` | Accent, CTA, cooldown | `#C87941` Copper | `#a0612e` Copper-dark |
| `--primary-secondary` | Secondary accent, clock marks | `#E8A665` Amber | `#c4863e` Amber-dark |
| `--text-primary` | Headings, body text | `#e8e8f0` Snow | `#1a1a1a` Ink |
| `--text-secondary` | Metadata, labels | `#7a7a8e` Slate | `#706b65` Stone |
| `--status-available` | Instance ready | `#4a9a5a` Jade | `#2e8a3e` Jade-dark |
| `--status-available-text` | Badge text (available) | `#6abf7a` | `#1e6a2e` |
| `--status-soon` | Less than 1h remaining | `#d4a843` Gold | `#b8922e` Gold-dark |
| `--status-soon-text` | Badge text (soon) | `#f0c060` | `#8a6e1a` |
| `--status-cooldown` | Active cooldown | `#C87941` Copper | `#a0612e` Copper-dark |
| `--status-cooldown-text` | Badge text (cooldown) | `#E8A665` | `#8a5020` |
| `--status-error` | Error, expired | `#c44040` Ember | `#b83030` Ember-dark |
| `--status-error-text` | Badge text (error) | `#f07070` | `#8a2020` |

### Status Semaphore

Three-state system for instance cooldowns, plus an error state:

```
Cooldown (Copper) → Soon < 1h (Gold) → Available (Jade)
Error/Expired (Ember) — for failed or expired instances
```

Each status applies to:
- Card left border color (3px solid `--status-*`)
- Shield icon stroke + fill color
- Status badge: background at ~12% opacity of `--status-*`, text uses `--status-*-text`

### Error State

The error/expired state follows the same pattern as other statuses:
- Card left border: `--status-error`
- Shield icon: Ember stroke + Ember fill at 15%/10%
- Badge: Ember at 12% bg + `--status-error-text`
- Used for: failed instance entries, expired sessions, connection errors

### Light Mode Principles

- **Warm, not cold** — off-white background (`#f8f7f5`), warm gray borders (`#e5e2dc`). No blue-gray.
- **Copper darkened** — `#C87941` washes out on light backgrounds. `#a0612e` maintains WCAG AA contrast.
- **Shadows replace borders** — light cards use `box-shadow: 0 1px 3px #0000000a` for depth instead of relying solely on borders.
- **Status colors darken slightly** — green and gold shift darker for readability on white.
- **Duotone icon fill reduced** — 10% opacity in light (vs 15% in dark) since light backgrounds need less fill.

### Hover/Focus Color Shifts

| Element | Dark Hover | Light Hover |
|---------|-----------|-------------|
| Primary button bg | `#b56a35` | `#8a5020` |
| Card background | `#181830` | — (shadow deepens instead) |
| Card border | `#3a3a4a` | shadow `0 3px 10px #0000000f` |
| Card left border (cooldown) | `#E8A665` | `#8a5020` |
| Card left border (available) | `#6abf7a` | `#1e6a2e` |
| Card left border (soon) | `#f0c060` | `#9a7a20` |
| Focus ring | `2px solid #E8A665` offset 2px | `2px solid #c4863e` offset 2px |
| Disabled button bg | `#3a3a4a` | `#e5e2dc` |
| Disabled button text | `#5a5a6e` | `#b5b0a8` |

## Typography

### Font: Outfit (Google Fonts)

Geometric sans-serif with soft corners. Modern without being cold — pairs well with the organic shield icon.

| Level | Weight | Size | Letter-spacing | Usage |
|-------|--------|------|---------------|-------|
| H1 | 700 | 32px | -1px | Page titles |
| H2 | 600 | 22px | 0 | Section headings, instance names |
| Body | 400 | 14px | 0 | Descriptions, metadata |
| Nav | 500 | 13px | 0 | Navigation links, secondary actions |
| Label | 600 | 11px | 1.5px (uppercase) | Status labels, section dividers |
| Button | 600 | 13px | 0 | CTA and action buttons |

### Font Loading

Single font family for the entire app. Load weights 400, 500, 600, 700 from Google Fonts.

## Iconography

### Style: Duotone

Outlined icons (1.5px stroke) with translucent fill in the primary color.

| Theme | Fill Opacity | Hex | Stroke Color |
|-------|-------------|-----|--------------|
| Dark | 15% | `#C8794126` | `#C87941` |
| Light | 10% | `#a0612e1a` | `#a0612e` |

### Icon Set

Use Lucide icons as the base set (open source, consistent with the outlined+round style). Apply the duotone treatment by adding fill to closed shapes.

### Status-Aware Icons

The shield icon (used for instance cards) adapts its colors to match the status:

| Status | Stroke | Fill |
|--------|--------|------|
| Cooldown | `--primary` | `--primary` at 15%/10% |
| Soon | `--status-soon` | `--status-soon` at 15%/10% |
| Available | `--status-available` | `--status-available` at 15%/10% |

## Component Patterns

### Instance Card

```
┌─────────────────────────────┐
│ ▌ [shield-icon] Instance Name │  ← left border = status color
│ ▌ Last: 18h ago • CharName    │     shield icon = status color
│ ▌ [status-badge]              │     badge = status bg + text
└─────────────────────────────┘
```

- Left border: 3px solid, colored by status
- Background: `--surface`
- Border: 1px solid `--border`
- Hover: background shifts (dark) or shadow deepens (light), left border brightens
- Light mode adds `box-shadow: 0 1px 3px #0000000a`

### Buttons

- **Primary:** `--primary` bg, inverted text (`--bg` dark, `#fff` light), `--radius-md` radius
- **Secondary/Ghost:** transparent bg, `--border` border, `--text-primary` text
- **Disabled:** muted bg and text (see hover table)
- All buttons: Outfit 600, 13px, 8px 20px padding

### Landing Feature Cards

- Same as surface cards but without left border
- Hover: border transitions to `--primary` at 40% opacity (dark) or shadow with primary tint (light)

## Mockups

Visual mockups for both themes are saved in:
- `.superpowers/brainstorm/4859-1774299395/design-final-v3.html` (dark mode)
- `.superpowers/brainstorm/4859-1774299395/light-mode-full.html` (light mode)
- `.superpowers/brainstorm/4859-1774299395/light-mode.html` (side-by-side comparison + token mapping)

## Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Badges, small tags |
| `--radius-md` | 8px | Cards, buttons, inputs |
| `--radius-lg` | 12px | Panels, modals, large containers |

## Implementation Notes

- Use CSS custom properties for all color tokens — theme switching is a class on `<html>` or `<body>`
- Default to dark mode, respect `prefers-color-scheme` media query
- Light mode `--text-secondary` is `#706b65` (passes WCAG AA at ~4.6:1 contrast ratio on `#f8f7f5`)
- The "soon" threshold (< 1h) should be configurable, defaulting to 60 minutes
- Favicon should use the simplified 16px variant as an SVG favicon for sharpness
