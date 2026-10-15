# Marquio contributor instructions

This is the independent repository `higormanoel/brand-manual-pdf`, evolving into Marquio Studio. Preserve unrelated local changes and independent Git repositories/worktrees. Read `PRODUCT.md` and `DESIGN.md` for the approved product and visual direction. `CLAUDE.md` points to these same instructions.

## Product contracts

- Every title, rule, footer, credit and application is an editable document node.
- Fields and sections may be skipped. Preserve that choice; do not invent client facts, logos, rules or credits. Suggestions remain pending until designer approval.
- Client identity and editorial style are separate configurations. The Studio follows familiar design-tool organization; the default manual is restrained, editorial and 16:9.
- Editor and exporter share the render tree. Canonical geometry is 1920 × 1080; distinguish CSS pixels from PDF points. Transform origin is local top-left: translate, rotate, scale; group children use local coordinates.
- The local server and repository own confirmed revisions. `project.marquio.json` is the immutable base, with later states in `commits/`; never read it alone as current or overwrite it directly. Consumers use `ProjectRepository.load/commit/snapshot` and revision-safe commands with commandId/expectedRevision.
- Export an immutable snapshot of a confirmed revision. Regeneration retains recoverable manual work. Assets live outside edit history; portable files include bytes and relative paths without machine-specific paths or temporary URLs.
- Keep browser recovery pending/confirmed states honest. IndexedDB is origin/port scoped. Browser-only provides portable backup and browser Print; validated PDF export requires the local runtime.
- External image generation is optional. A prompt is not a generated image; a presentation illustration is not real production photography. Do not claim an unavailable provider connection, PSD, CMYK, PDF/X or full Photoshop support.

## Materials and installation

Use the fictitious Aurora fixture and original public mockups for demonstrations. Preserve provenance and typeface notices. Private reference documents, extracted reference images/commercial fonts and the reference author's identity must not appear in distributed code, prompts, examples, documentation or credits. Client uploads require suitable permissions and are not public fixtures.

Preserve `legacy/SKILL.md`, `assets/template_brand_manual.html` and `scripts/generate_pdf.sh` during migration. Do not modify external installed skill checkouts as an effect of testing. Installation tests use explicit temporary roots and preserve existing skills unless force was requested. Do not publish npm packages, deploy or rename the remote as a test.

## Verification and collaboration

Use the scripts in `package.json`. Unit/integration tests are `tests/**/*.test.ts`; browser tests are `tests/browser/*.spec.ts`. Build before tests using the compiled CLI/exporter. Run focused checks during changes and the relevant full checks before completion: typecheck, build, unit tests, real Chromium E2E and package dry-run. Do not claim the application or PDF export works from types or static screenshots alone.

When multiple assistants work here, coordinate ownership before shared-file edits. Stage only your files; do not use `git add .`, reset others' changes or rewrite existing worktree records. Record useful implementation handoffs in the task's local execution ledger when present. Product history and plans live under `docs/`; they do not override explicit current user instructions.
