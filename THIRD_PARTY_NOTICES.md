# Materials and licenses

The new Marquio application code, adapters and documentation are MIT licensed; see [LICENSE](LICENSE). Third-party code, typefaces and contributed client content retain their own terms. The legacy template/script remain preserved; no third-party reference document is licensed or distributed by this project.

| Material | Origin and terms |
| --- | --- |
| Inter typeface, bundled through `@fontsource/inter` | SIL Open Font License 1.1, including reserved font name Inter. Full notice: [public/licenses/Inter-OFL.txt](public/licenses/Inter-OFL.txt). |
| Aurora fixture copy and five identity SVGs | Original fictitious work for this project, dedicated under CC0; see [fixtures/aurora/README.md](fixtures/aurora/README.md). |
| Aurora card/poster/screen artwork | Original demonstration SVG artwork; see [public/demo-artwork/README.md](public/demo-artwork/README.md). |
| Card, poster and laptop photographic base scenes | Original AI-generated scenes for Marquio on 15 October 2026, with exact adjacent prompts and [provenance](public/mockups/PROVENANCE.md). Included for reuse in Marquio examples; no claim of real client production or exclusive rights in generated pixels. |
| Georgia/Arial names in fixture SVGs | References to system fonts only. No Georgia or Arial font files are included. Rendering may substitute; client font files need an appropriate license. |
| Client uploads | User-provided assets/fonts remain subject to their owner's rights and are not part of this distribution. |

Direct npm package license metadata checked from this checkout on 15 October 2026:

- Runtime: React and React DOM (MIT), Zod (MIT), pdf-lib (MIT), JSZip (MIT OR GPL-3.0-or-later; used under MIT), `@fontsource/inter` (OFL-1.1), Playwright (Apache-2.0).
- Tooling: TypeScript and the Playwright test runner (Apache-2.0); Vite, Vitest and the Vite React plugin (MIT). Other development dependencies and transitive packages carry the notices installed with those packages. This summary does not replace their full license files.

Chromium is installed separately through Playwright or supplied by the user; its own licenses apply. The private source reference, its extracted imagery and commercial fonts are not included. Do not add them to examples, bundles, screenshots or documentation.
