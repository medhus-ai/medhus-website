# Tasks — Issue #1

## T1 — Project scaffold
**engineer:** frontend-engineer  
**depends_on:** —  
**files_likely_touched:**
- `package.json`, `next.config.js`, `tailwind.config.js`,
  `postcss.config.js`, `app/layout.tsx`, `app/globals.css`

**acceptance:**
- `npm run build` exits 0 and produces `out/index.html`
- `npx tsc --noEmit` passes with zero errors
- `next.config.js` sets `output:'export'`, `basePath:'/medhus-website'`,
  `images:{unoptimized:true}`

---

## T2 — Landing page sections
**engineer:** frontend-engineer  
**depends_on:** T1  
**files_likely_touched:**
- `app/page.tsx`
- `components/Hero.tsx`
- `components/Features.tsx`
- `components/HowItWorks.tsx`
- `components/Footer.tsx`

**acceptance:**
- All four sections appear in `out/index.html`
- Hero has an H1 containing "Medhus", a subheadline explaining AI audio/video
  workflow APIs, and a visible CTA link or button
- Features shows ≥ 3 cards, each describing a distinct API capability
- HowItWorks shows a numbered 3-step flow
- Footer has at least a copyright line
- Keyboard tab order: layout nav → hero CTA → feature links → footer
- Zero inline styles except one-off positional fixes

---

## T3 — Responsive styling and a11y pass
**engineer:** frontend-engineer  
**depends_on:** T2  
**files_likely_touched:** `components/*.tsx` (Tailwind class additions only)

**acceptance:**
- No horizontal overflow at 375 px or 1280 px viewport
- All images and icons have non-empty `alt` attributes
- Text contrast ratio ≥ 4.5:1 (WCAG AA) on all foreground/background pairs
- Lighthouse accessibility score ≥ 90 on the exported page

---

## T4 — GitHub Actions deploy
**engineer:** frontend-engineer  
**depends_on:** T1  
**files_likely_touched:** `.github/workflows/deploy.yml`

**acceptance:**
- Push to `main` triggers the workflow
- Workflow runs `npm ci && npm run build` and deploys `out/` to `gh-pages` branch
- A failed build exits non-zero and blocks the deploy step
- After a successful run, `https://medhus-ai.github.io/medhus-website/` returns HTTP 200

**human prerequisite:** Enable GitHub Pages in repo Settings → Pages → Source: `gh-pages` branch
