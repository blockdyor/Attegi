# Theme Modernization Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for parent integration; isolated helpers return scoped commits and evidence.

**Goal:** Deliver the approved measured theme update without a rewrite.
**Architecture:** Server-rendered Ghost Portal links reuse Attegi glass styles; shared CSS fixes existing HTML advertisements. No extra runtime dependency.
**Tech Stack:** Ghost Handlebars, SCSS, existing vanilla JS, Bun tests/build/GScan.
**Spec:** docs/superpowers/specs/2026-11-05-theme-modernization-design.md

## Global constraints
Preserve current design, Ghost signup/account behavior, ad snippets and content. No automatic live deployment. No arbitrary modernizing refactors. Keep Sonar findings visible and verify exact revisions.

## Review focus
- Signed-in, invite-only and members-disabled states must render the appropriate launcher or none.
- Portal disabled/late/failed initialization must not produce duplicate or nonfunctional controls.
- Theme/manual/system changes and reduced-motion preference must affect the launcher without additional JS.
- Mobile reading controls and modal/menu focus must not be covered or bypassed.
- Banner positioning fixes must preserve ordinary article images and all existing advertiser links/copy.

## Task 1: Theme-native floating launcher
Files: default.hbs, src/sass/style.scss, scripts/tests/social-links.test.js.
- [ ] Add failing render tests for membership states and Portal link targets.
- [ ] Add one server-rendered floating link reusing nav-button-primary and translated labels.
- [ ] Scope CSS replacement to an initialized native launcher, reuse glass/motion tokens, guard modal/menu state and reading-control collisions.
- [ ] Verify actual browser rendering/Portal opening at mobile/desktop, both color schemes, disabled launcher and reduced motion.

## Task 2: Shared advertising layout
Files: content-image SCSS section and focused regression fixture/test returned by the isolated ad-layout worker.
- [ ] Reproduce overlap using the user's exact HTML, then implement the smallest shared CSS fix.
- [ ] Verify CTA starts after the banner at supported breakpoints and ordinary image margins remain unchanged.

## Task 3: Evidence-backed audit and release
- [ ] Capture baseline resources/timings; review up to three concrete runtime findings and implement only reproduced worthwhile issues with regression tests.
- [ ] Integrate disjoint worker changes; run full validation and independent review.
- [ ] Run exact-head CI/Sonar; compare final resource sizes without claiming unmeasured speed gains.
- [ ] Publish the next patch release, verify downloaded ZIP/tag/digest and sync the existing Obsidian record. Do not deploy live.
