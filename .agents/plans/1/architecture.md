# Architecture — Medhus Landing Page

## Overview
Static Next.js site, exported to HTML/CSS/JS at build time, served by GitHub Pages CDN.

## File layout
```
medhus-website/
├── next.config.js          # output:'export', basePath, images.unoptimized
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── app/
│   ├── layout.tsx          # <html>, <head>, metadata, font
│   └── page.tsx            # assembles sections
├── components/
│   ├── Hero.tsx            # H1 + subheadline + CTA button
│   ├── Features.tsx        # 3-card grid of API capabilities
│   ├── HowItWorks.tsx      # numbered 3-step flow
│   └── Footer.tsx          # links + copyright
└── .github/workflows/
    └── deploy.yml          # npm ci → build → deploy out/ to gh-pages
```

## Data flow
All content is static — no runtime data fetching.
```
next build → out/ → GitHub Actions → gh-pages branch → GitHub Pages CDN → browser
```

## Components

| Component | Responsibility | State |
|-----------|---------------|-------|
| `layout.tsx` | HTML shell, metadata, font load | none |
| `page.tsx` | Section composition | none |
| `Hero` | Headline, subheadline, CTA | none |
| `Features` | 3-column capability cards | none |
| `HowItWorks` | Numbered step list | none |
| `Footer` | Nav links, copyright | none |

## Performance budget

| Metric | Target |
|--------|--------|
| Lighthouse Performance | ≥ 90 |
| Lighthouse Accessibility | ≥ 90 |
| First Contentful Paint | < 1.5 s (simulated 4G) |
| Total JS bundle (gzipped) | < 100 KB |
