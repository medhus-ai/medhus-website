# Tests — Issue #1

## Agent-runnable (automated)

| Test | Verifies | Command |
|------|----------|---------|
| Build succeeds | `out/index.html` exists | `npm run build` exits 0 |
| TypeScript clean | No type errors | `npx tsc --noEmit` |
| H1 present | Page has a headline | `grep -c '<h1' out/index.html` → ≥ 1 |
| CTA present | Action link/button in hero | `grep -i 'get started\|sign up\|api access\|contact' out/index.html` → ≥ 1 |
| basePath in assets | Assets don't 404 on GH Pages | `grep '/medhus-website/' out/index.html` → ≥ 1 |

## Human-exercised

| Test | What to check |
|------|---------------|
| Mobile view (375 px) | DevTools mobile — no horizontal scroll, text readable |
| Desktop view (1280 px) | Hero visible above fold, sections aligned |
| Lighthouse audit | Performance ≥ 90, Accessibility ≥ 90 |
| CTA click | Navigates to intended action (sign-up, email, or anchor) |
| Live URL | Open `https://medhus-ai.github.io/medhus-website/` in incognito — loads cleanly |
