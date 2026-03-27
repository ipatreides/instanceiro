#!/bin/bash
# Pre-commit hook: block hardcoded colors in src/ that should use design tokens.
# Allowed exceptions: globals.css (token definitions), icon.svg (favicon),
# login-button.tsx (third-party brand colors),
# notifications-section.tsx (Discord brand colors),
# profile/page.tsx (Discord brand colors for bot invite).

set -euo pipefail

# Get staged .ts/.tsx files in src/, excluding allowed files
STAGED=$(git diff --cached --name-only --diff-filter=ACM -- 'src/**/*.ts' 'src/**/*.tsx' | \
  grep -v 'globals\.css$' | \
  grep -v 'icon\.svg$' | \
  grep -v 'login-button\.tsx$' | \
  grep -v 'notifications-section\.tsx$' | \
  grep -v 'profile/page\.tsx$' | \
  grep -v 'discord-section\.tsx$' || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

FAIL=0

# Get the full staged diff once
DIFF=$(git diff --cached -U0 -- $STAGED)

# Check 1: Old theme hex colors that must never appear
OLD_MATCHES=$(echo "$DIFF" | grep -n '^+' | grep -v '^[0-9]*:+++' | grep -iE '#0f0a1a|#1a1230|#2a1f40|#3D2A5C|#7C3AED|#6D28D9|#A89BC2|#6B5A8A|#9B6DFF|#221840|#352a50' || true)

if [ -n "$OLD_MATCHES" ]; then
  echo ""
  echo "❌ Old theme colors found in staged changes:"
  echo "$OLD_MATCHES"
  echo ""
  FAIL=1
fi

# Check 2: Arbitrary hex in Tailwind utility classes (bg-[#...], text-[#...], etc.)
HEX_MATCHES=$(echo "$DIFF" | grep -n '^+' | grep -v '^[0-9]*:+++' | grep -oE '(bg|text|border|ring|shadow|from|to|via)-\[#[0-9a-fA-F]+\]' || true)

if [ -n "$HEX_MATCHES" ]; then
  echo ""
  echo "⚠️  Hardcoded hex in Tailwind classes:"
  echo "$HEX_MATCHES"
  echo "   Use a design token instead (bg-surface, text-primary, border-border, etc.)"
  echo ""
  FAIL=1
fi

if [ "$FAIL" -eq 1 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  Design Token Violation — commit blocked                ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "Tokens are defined in src/app/globals.css."
  echo "See CLAUDE.md for the design system reference."
  echo ""
  echo "To bypass (emergency only): git commit --no-verify"
  exit 1
fi

exit 0
