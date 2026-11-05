# Measured Attegi modernization

## Approved intent
Andrea approved measured modernization rather than a ground-up rewrite: fix the floating Subscribe widget and reusable ad layout first, then implement only evidence-backed performance, security and accessibility improvements. Preserve the current design, Ghost features, existing content and advertising snippets. No new framework or dependency without demonstrated need. Do not deploy to the live site automatically.

## Approach
Reuse the existing theme and design tokens rather than rebuilding it. Retain native Ghost membership/signup flows. Prefer a theme-owned, server-rendered floating Portal link sharing the existing glass button styles; replace only the default iframe launcher visually and only while Ghost actually provides that launcher. This avoids reaching into Portal iframe internals, adding polling/observers, or maintaining duplicate signup logic. Respect members-disabled, invite-only and signed-in states, the Portal launcher visibility setting, keyboard focus, reduced motion, mobile safe areas and existing reading controls.

For ads, fix the shared theme rule causing inline-positioned banner images to extend beyond their reserved box. Do not edit posts, affiliate links, copy or images. Keep normal article-image spacing intact.

## Alternatives considered
- Full rewrite: rejected; no measured need and higher compatibility/migration risk.
- Restyle the iframe contents with JavaScript: rejected; depends on external Portal internals and adds runtime synchronization work.
- Reuse native Portal links and existing CSS: selected for the floating launcher; smallest maintainable change with automatic light/dark token inheritance.

## Measurements and acceptance
Capture baseline and updated asset byte sizes and representative browser timings. Report unavailable metrics as unavailable; no invented Lighthouse/Core Web Vitals scores or unsupported speed claims. Implement additional audit findings only when reproduced and covered by regression tests.

Verify banner/CTA separation and no horizontal overflow on mobile/desktop; light/dark/system modes; membership states; launcher on/off/loading, signup opening and modal/menu focus; reading-control collisions; reduced motion. Run the full test/build/GScan pipeline, independent review, exact-revision GitHub CI and Sonar checks. Publish a versioned, downloaded-and-verified theme ZIP while preserving previous release bytes. Summarize remaining limitations and unchanged live-site state.
