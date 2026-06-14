# Overview — Medhus Landing Page (Issue #1)

## Problem statement
Medhus has no web presence. Developers landing on the domain see nothing.
We need a single polished marketing page that communicates what Medhus does
and drives a conversion action.

## Agreed goal
A live, shareable landing page that tells a developer "Medhus gives you
AI audio/video workflow APIs" within 5 seconds and shows them what to do next.

## Non-goals
- Multi-page site (about, blog, docs) — deferred
- Backend / auth — not needed for a static marketing page
- Custom domain — not in scope for this slice
- Actual API calls from the page

## Success criteria
1. `https://medhus-ai.github.io/medhus-website/` loads in a browser
2. A new visitor can answer "what is Medhus and what can I do?" in ≤ 5 s
3. At least one CTA is visible above the fold
4. Lighthouse accessibility ≥ 90
5. Page renders without overflow at 375 px (mobile) and 1280 px (desktop)

## Phase A — Setup
Init Next.js with static export config and Tailwind; wire GitHub Actions deploy.

## Phase B — Content
Build Hero, Features, How It Works, and Footer components.

## Phase C — Polish & Ship
Responsive pass, a11y check, deploy verified at live URL.
