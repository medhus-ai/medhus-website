# Risks — Issue #1

## R1 — Next.js image optimization breaks static export
**Risk:** Using `next/image` without `unoptimized:true` causes build failure or broken images.  
**Mitigation:** Set `images:{unoptimized:true}` in `next.config.js` on T1.  
**Rollback:** Caught at build time; fix config and rebuild.

## R2 — Base path mismatch causes 404s
**Risk:** GH Pages serves at `/medhus-website/`; without `basePath` all internal links 404.  
**Mitigation:** Set `basePath:'/medhus-website'` and `assetPrefix:'/medhus-website'` in T1.  
**Rollback:** Update `next.config.js` and redeploy (one-line fix).

## R3 — GitHub Pages not enabled on the repo
**Risk:** Deploy workflow succeeds but the page is never served.  
**Mitigation:** Human enables GitHub Pages in repo Settings before testing T4 (noted as prerequisite in T4).  
**Rollback:** N/A — one-time settings change.

## R4 — Copy too generic to convert visitors
**Risk:** Placeholder copy ships without user review and fails to communicate the product clearly.  
**Mitigation:** User reviews and approves landing page copy in the PR before merge.  
**Rollback:** Copy update in a follow-up PR (no structural change needed).
