# Decisions — Issue #1

## Agreed goal (2026-06-14)
Single polished Next.js landing page on GitHub Pages. Done = live shareable URL.

## Q&A log

| # | Question | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | What is Medhus? | AI audio/video workflows API provider | Human answer |
| 2 | What does "done" look like? | Single landing page live and shareable | Human choice |
| 3 | Stack? | Next.js | Human choice |
| 4 | Deploy target? | GitHub Pages | Human choice |

## Derived decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Next.js export mode | `output: 'export'` | GitHub Pages is static-only; no SSR available |
| basePath | `/medhus-website` | GH Pages serves at subpath by default; required to avoid 404s |
| `images.unoptimized` | `true` | Next.js image optimization requires a server; static export has none |
| CSS framework | Tailwind CSS | Zero runtime, pairs naturally with Next.js, no new pattern introduced |
| GH Actions deploy | `actions/deploy-pages` (native) | No third-party action dependency needed |
| Page structure | Single `app/page.tsx` | Matches "single landing page" goal; no router needed |
| Sections | Hero + Features + How It Works + CTA/Footer | Standard API product page; minimal and sufficient |
