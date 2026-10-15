# Marquio visual system

Visual authority: the user's explicit Photoshop/PhotoCraft reference and the approved neutral editorial preset. This is an Operate surface; familiar design-tool behavior and clear artboard space govern decisions. Do not add a marketing dashboard or reopen the approved visual direction.

## Studio

Inter throughout the application, self-hosted. Compact fixed scale: 11px secondary metadata, 12px controls, 13px standard labels, 16px panel titles, 24px dialog headings. Tabular numerals for coordinates. A single consistent SVG icon family at 16–18px, with accessible names and keyboard focus.

Tokens:

```css
--studio-bg: #171717;
--studio-surface: #202020;
--studio-raised: #292929;
--studio-canvas: #2c2c2c;
--studio-border: #3a3a3a;
--studio-text: #f1f1f1;
--studio-muted: #b5b5b5;
--studio-subtle: #929292;
--studio-selection: #a8c9f5;
--studio-danger: #ffb4ab;
--studio-focus: #b9d5ff;
```

Neutral primary action uses light fill and dark text. Selection/focus blue only marks interactive state. Keep client palette colors inside client objects and swatches. Border radius 4px on controls, 6px on grouped floating UI; avoid large rounded dashboard cards.

Top project bar approximately 48px, secondary tool options 36px, left tool rail 44px, page navigation approximately 196px and properties/layers panel approximately 264px. At narrow desktop widths, collapse nonessential panels to tabs and preserve usable canvas navigation. On mobile, offer page preview and one panel at a time; do not squeeze all desktop panels into the viewport.

Use real project thumbnails and miniature artboards. Selected nodes receive thin handles and measured coordinates. All tool buttons have hover, focus, active, disabled and pressed states; busy actions identify their operation. Save status distinguishes pending, confirmed and conflict. Errors identify the page/asset and a recovery action.

## Editorial artboards

Canonical coordinates 1920 × 1080. Dark `#040606`, light `#FFFFFF`, body `#0F0F0F`, muted opener number `#38393B`. Approximate reference margin 91 units. Inter scale: 72 for cover/openers, 56 for quotes, 36 for section titles, 21 for body and 13 for labels. Use hierarchy, generous whitespace and asymmetric columns. No required accent word on the cover.

Openers carry a bottom-left chapter number/title. Light content has compact header and footer rules, small labels, left title/body and larger content to the right. Photo and application pages may be full bleed. The client typography appears in specimens and applications; editorial fonts remain an independent setting.

Every rule, title, footer and credit is a document node. Omitted sections recalculate numbering. Fit long copy by measured continuation pages; never silently clip text.

## Demonstration and mockups

Aurora is explicitly fictitious, with original restrained identity and original SVG assets. Planar card, screen and poster scenes can use precise geometry and are labeled as presentation illustrations. Photographic scenes require actual supplied/generated photographic assets; do not imitate photographs with crude SVG people or promote illustrations as photoreal generation.

## Verification

One batched desktop/narrow/mobile screenshot pass after integration, one correction batch and a confirmation pass. Functional tests cover actual editor operations and export. Preserve focus contrast, readable muted labels, current page indication and complete content under resizing. Documentation records observed implementation rather than claiming unfinished features.
