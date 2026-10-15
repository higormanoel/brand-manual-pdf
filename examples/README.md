# Aurora walkthrough

Aurora is an original fictitious neighborhood coffee roaster, created for this project. It represents no real client or institution. The example contains approved fictitious copy and design decisions; new projects must obtain their own facts, rules, assets and credits.

- [Aurora.pdf](Aurora.pdf): 46 pages at 1920 × 1080 PDF points, exported from confirmed revision 0 with the production Chromium renderer.
- [Aurora.marquio.zip](Aurora.marquio.zip): editable project with 13 assets, including the original Libre Baskerville TTF and complete OFL notice, relative paths and original bytes, without server sessions or command receipts.
- [Studio walkthrough](../docs/assets/studio-walkthrough.gif): actual local-runtime navigation, text editing, undo and portable backup in a temporary copy. It is a screen recording assembled from timed browser frames; no interface or interaction was fabricated.
- [Desktop](../docs/assets/studio-desktop.png), [narrow desktop](../docs/assets/studio-narrow.png) and [mobile](../docs/assets/studio-mobile.png): real production Studio at 1600 × 1000, 1024 × 768 and 390 × 844 respectively.

Build with `npm ci`, `npx playwright install chromium` and `npm run build`, then create a fresh local example:

```bash
node examples/create-demo.mjs ./marquio-demo-output
node bin/marquio.mjs studio ./marquio-demo-output/aurora
```

The helper reuses `studio --demo`, the canonical export command and authenticated portable API. It refuses to replace an existing output. It creates the editable `aurora/` project folder, a new `Aurora.pdf` and `Aurora.marquio.zip`. Generation measures text in Chromium with real fonts. Project IDs and PDF timestamps may differ between fresh runs; page content and asset provenance come from the same original source fixture.

For browser-only editing, open the ZIP through Studio's project menu and save a portable backup before changing origin/port. For local confirmed saves and validated PDF export, reopen the generated `aurora/` folder with the CLI. Keep the complete folder: later edits add immutable commits beyond the base checkpoint.

To reproduce the captures, install the normal development dependencies and a working system `ffmpeg` (or Python 3 with Pillow as a fallback), then run:

```bash
node examples/capture-demo.mjs ./marquio-demo-output/aurora ./docs/assets
```

The capture helper opens a temporary copy on requested port 4190 (or the available fallback selected by the CLI), navigates real production controls and deletes its working copy afterward. It never edits the source example. Its GIF uses real timed screenshots at a modest frame rate to keep the repository asset small. Optional `MARQUIO_FFMPEG_EXECUTABLE` and `MARQUIO_PYTHON` select the encoder executables without changing system installations. No external provider or recording service is used.

Identity copy and the five base SVG assets are [original CC0 fixture material](../fixtures/aurora/README.md). The three application SVG compositions are [original CC0 artwork](../public/demo-artwork/README.md). Their photographic base scenes were generated originally for Marquio, with [exact prompts and provenance](../public/mockups/PROVENANCE.md); they do not document a real client's production. The identity uses the portable Libre Baskerville TTF and application-bundled Inter. Their software is licensed under [Libre Baskerville SIL OFL](../public/licenses/LibreBaskerville-OFL.txt) and [Inter SIL OFL](../public/licenses/Inter-OFL.txt); see the fixture documentation for pinned source URLs and hashes. Demonstration lettering is outlined in the SVG artwork so its appearance remains independent of proprietary system fonts. New client documents still report missing fonts and require licensed uploads when appropriate.

This example contains presentation mockups, not connected websites or a connected generation provider. The portable project is the editable source; the PDF is a delivery artifact. PSD, CMYK and PDF/X are outside this release's scope.
