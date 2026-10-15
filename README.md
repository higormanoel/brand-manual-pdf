# Marquio

Build a brand manual from the identity materials you have, then finish it in an editable design studio. Skip unavailable sections, review suggestions, adjust every object and export a multipage PDF from the confirmed project revision.

Marquio runs locally without an account. Codex and Claude Code are two entrances to the same application and project format. [Guia em português](README.pt-BR.md).

## Run from this repository

Requires **Node.js 22+**, npm and Chromium. Install Playwright's Chromium below, or use an installed Chrome/Chromium with `MARQUIO_CHROMIUM_EXECUTABLE=/absolute/path/to/browser`. On Linux, Playwright's `--with-deps` installs required system libraries. Tests that inspect PDF text also require Poppler (`pdftotext`). This package is private; these commands use a checkout, not a published npm package.

```bash
git clone https://github.com/higormanoel/brand-manual-pdf.git
cd brand-manual-pdf
npm ci
npx playwright install chromium
npm run build
node bin/marquio.mjs studio ./my-brand --name "My brand"
```

The server binds to `127.0.0.1`, selects an available port and prints/opens its session URL. Keep that terminal running. Reopen the same project folder to resume. Use the URL from the current process; the session token is a local access credential and should not be shared. Stop with Ctrl+C.

For an original fictitious example:

```bash
node bin/marquio.mjs studio ./aurora-demo --demo
```

Aurora is a fictitious neighborhood coffee roaster. Its text, identity and illustrations are original. Three original generated photographic base scenes, with [generation prompts and provenance](public/mockups/PROVENANCE.md), receive separate editable client artwork. These are presentation composites, not photographs of a real client's printed production. No paid generation service is needed.

## Finish a manual

1. Enter the optional brief, upload logos and fonts, choose colors and add the sections you need. A skipped section stays skipped. Credits and brand rules come from you.
2. Generate editorial pages. Suggested content stays marked until you approve it. Your client typography and palette remain separate from the manual's editorial preset.
3. Edit text, images, shapes, groups, layers and applications on the artboards. Review line breaks, font warnings and mockups. The document uses 1920 × 1080 coordinates; every header, rule, number and credit is a document object.
4. Wait for the confirmed save state. Preview the actual Studio pages, export the PDF and download a portable project backup. The PDF is the delivery copy; the portable project is the editable source.

Local mode stores a project folder through the server. `project.marquio.json` is an immutable base checkpoint; later states live in `commits/`. The repository API resolves the latest revision. Do not edit those files by hand. Reopen the complete folder, or transfer a portable backup containing relative asset paths and bytes. Regeneration appends variants and retains earlier states; intentional replacement is guarded by the expected pages and revision.

Browser-only mode uses IndexedDB and offers portable backup and browser Print. Storage belongs to the **origin and port**. A different port cannot recover pending changes from the former origin. Export portable backups to transfer browser-only work; the browser-only mode does not expose the local validated PDF exporter.

## Codex and Claude Code

After building, install into an explicitly chosen project root:

```bash
node bin/marquio.mjs install --agent codex --target "/path/to/client-work"
node bin/marquio.mjs install --agent claude --target "/path/to/client-work"
```

Codex discovers `.agents/skills/marquio` and invokes `$marquio`; Claude Code discovers `.claude/skills/marquio` and invokes `/marquio`. For a personal installation, explicitly pass your home directory as `--target "$HOME"`. Existing installations are preserved unless you add `--force`. Review the target first: force replaces that Marquio skill folder.

The installed launcher references this source checkout and its build, safely passing arguments without a shell. Keep the checkout available; rebuild after updating and reinstall after moving it. It works from another working directory and with spaces in paths. It neither changes agent authentication nor installs global packages. Paths follow the official [Codex skills documentation](https://learn.chatgpt.com/docs/build-skills) and [Claude Code skills documentation](https://code.claude.com/docs/en/skills), checked 15 October 2026.

The adapters collect optional briefing fields, preserve skipped choices and pending suggestions, use the canonical CLI and open the real Studio before final PDF delivery. External generation is optional: provide your own available service or import its result. Included scenes, planar templates and prompts work without a provider account.

## CLI and confirmed revisions

```bash
node bin/marquio.mjs --help
node bin/marquio.mjs validate ./my-brand --json
node bin/marquio.mjs import-asset ./my-brand ./logo.svg --revision 0 --command-id logo-import-1
node bin/marquio.mjs apply ./my-brand --batch ./changes.json
node bin/marquio.mjs generate ./my-brand --command-id editorial-1
node bin/marquio.mjs export ./my-brand --output ./manual.pdf --revision 3
```

Revision numbers above are examples. Use the revision actually returned by the preceding operation. An edit batch contains `commandId`, `expectedRevision` and `commands` from [the command schema](src/core/commands.ts), with existing IDs from the current project. Asset import returns its asset record and save acknowledgement. A conflict requires reloading and reconciling the current project; repeating the same unknown-outcome command uses its original ID. PDF export snapshots the requested confirmed revision so later edits cannot alter the exported document.

## Scope

The Studio supports editable pages, text, images, shapes, groups, layers, transforms, history, optional intake, reusable mockups, local projects and portable backups. Local generation measures text with browser fonts; Chromium exports through the shared renderer with searchable text. Font uploads remain your responsibility to license; missing fonts produce substitution diagnostics. Inter is included under its [SIL Open Font License](public/licenses/Inter-OFL.txt).

This release does not support PSD import/export, CMYK, PDF/X or full Photoshop editing. It has no connected image-generation provider by default. Imported assets must be supported images or fonts, and manual review remains part of final export. Local storage requires a filesystem that supports exclusive hard links and directory synchronization; a network filesystem is not a supported distributed collaboration backend. No automatic pruning of retained project revisions or assets is performed.

## Development and legacy workflow

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e
npm pack --dry-run
```

Build before the full test suite: the PDF and installed-launcher integration tests execute the real built application. Linux CI installs Chromium system dependencies and Poppler. See [contributing](CONTRIBUTING.md), [security](SECURITY.md), [changes](CHANGELOG.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

The original instructions are preserved in [legacy/SKILL.md](legacy/SKILL.md); the HTML template remains in [assets/template_brand_manual.html](assets/template_brand_manual.html), and [scripts/generate_pdf.sh](scripts/generate_pdf.sh) retains its original behavior. Existing external skill checkouts are not migrated automatically. New installations use Marquio's editable project workflow. The repository URL remains `higormanoel/brand-manual-pdf`.
