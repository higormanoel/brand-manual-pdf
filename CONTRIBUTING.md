# Contributing to Marquio

Marquio helps designers finish real editable brand manuals. Read [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) and [AGENTS.md](AGENTS.md) before changing product behavior.

Use Node.js 22+, `npm ci`, `npx playwright install chromium` and `npm run build`. For Linux browser dependencies use `npx playwright install --with-deps chromium`. Install Poppler for `pdftotext` in real PDF tests. Start the compiled application with `node bin/marquio.mjs studio ./my-test-project`; use temporary projects for development, never someone else's client folder.

Run `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e` and `npm pack --dry-run` before submitting a change. Focused tests belong in `tests/**/*.test.ts`; real browser flows belong in `tests/browser/*.spec.ts`. Build before tests that execute Chromium export or installed launchers. CI runs these checks on Linux with Node 22. Do not publish or deploy as a test.

Keep changes reviewable. Explain the user-visible problem, resulting behavior and relevant verification in the pull request. Include real screenshots for interface changes. New document fields need validation, portable compatibility and revision-safe commands. Do not bypass repository saves or silently reset documents when validation fails.

Preserve optional/skipped sections, designer approval, provenance, local undo/recovery and the shared render tree. Agent adapters use the same canonical CLI and latest confirmed revision. Installation tests must use explicit temporary roots and preserve existing skills unless replacement is requested. Keep the legacy template/script available during migration.

Only contribute materials you may distribute. Client files, private reference documents, extracted commercial fonts and session URLs do not belong in examples or screenshots. Use the fictitious Aurora fixture and document original asset provenance. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); do not describe generated scenes as real client production.
