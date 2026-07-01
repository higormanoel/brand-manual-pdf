---
name: brand-manual-pdf
description: "Create professional brand manual PDFs in editorial format — alternating dark/light pages, landscape 16:9, minimal and typographic. Covers the full brand identity system: positioning, narratives, archetypes, voice & tone (with Dos & Donts per mode), mantras, brand dictionary, color palette, typography, logo system, content pillars, and visual rules. Use when someone asks for a brand manual, brand guidelines, brand book, or brand identity document as a PDF. Optionally analyzes an Instagram profile (URL or screenshot) to extract visual identity. Always signed by Higor Manoel (@higormanoeldesign) as designer, plus any contributors the user lists."
---

# Brand Manual PDF

Generates a complete brand manual PDF. Output: HTML rendered by Chrome headless at 297mm × 167mm (landscape 16:9). Base CSS and page structure live in `assets/template_brand_manual.html`.

## Page layout system

Pages alternate dark (cover, openers, credits) and white (content):

- **Dark pages**: `background #0B0E0E`, off-white text. Openers: muted large number + bold section title at bottom-left, thin rule above.
- **White pages**: thin header label + rule at top, bold section title top-left, two-column body (small text left, large quote or data right), thin footer rule + section label left + year/brand right.
- Brand accent color: ONLY in palette swatches and one word on cover title. Never as general body text.
- No em dashes (`—`) in prose copy. Use commas instead. Keep `—` only in design labels (headers, footers, section numbers, font family names, archetype badges).

## Sections to produce

| # | Section | Content |
|---|---------|---------|
| Capa | Cover | Brand @handle, "Manual da Marca" title (one accent word in brand color), Playfair italic subtitle, footer rule |
| 001 | Identidade & Posicionamento | Positioning statement (large right quote), body paragraphs left |
| — | Como nos definimos | 3 short one-liner definitions in 3 columns |
| 002 | Narrativas da Marca | 2 large key quotes with attribution line |
| 003 | Arquétipos | 2–3 archetype cards: badge label, italic name, description, keyword chips |
| 004 | Tom de Voz | 2–3 voice modes: title, gray italic subtitle, body, Direcionadores bullets, Pontos de atenção bullets |
| — | Dos & Donts (per mode) | 3 pairs: ❌ wrong → ✅ right + arrow explanations |
| 005 | Mantras & Dicionário | Mantras (8–12 phrases in 2 columns), Brand Dictionary (preferred words / proprietary terms) |
| 006 | Paleta de Cores | Grouped color swatches (tríade principal, cor institucional if any, suporte, apoio), "Como usar" column |
| 007 | Tipografia | Primary font: specimen, weights, use chips. Secondary font: same. |
| 008 | Logotipo | Logo on dark + light background cards, tagline variations. **Skip if no logo provided.** |
| 009 | Pilares de Conteúdo | 3–5 pillar cards: number, title, description, 2 example topics |
| 010 | Estilo Visual | Aesthetic paragraphs + 5 application rules |
| Créditos | Credits | Higor Manoel @higormanoeldesign + contributors |

## Intake — ask in phases, never all at once

### Phase 1 — Core identity (ask together)
1. **Nome e handle** — full brand name and @handle
2. **Instagram / referência visual** — URL or screenshot of profile grid + bio (extracts colors, voice, pillars, linked brands)
3. **Nicho e público-alvo** — market segment + audience in 1–2 sentences
4. **Proposta de valor** — what makes this brand distinct vs. competitors
5. **Frase de posicionamento** — single bold sentence (becomes the large right quote on page 001)

### Phase 2 — Personality (after Phase 1)
6. **"Como nos definimos"** — 3 one-liner definitions (ex: "A agência de growth sem hack.")
7. **Principais narrativas** — 2 audience-facing key phrases + context (ex: "> para nossos clientes")
8. **Arquétipos** — primary (1–2) + secondary trait (1). Options: O Criativo, O Explorador, O Herói, O Sábio, O Governante, O Bobo da Corte, O Cuidador, O Fora-da-Lei, O Mago, O Amante, O Cara Comum, O Inocente
9. **Modos de tom de voz** — 2–3 mode names. For each: name, 3-word italic subtitle, body paragraph, 5–8 Direcionadores, 3–5 Pontos de atenção
10. **Dos & Donts** — for each voice mode: 3 pairs (❌ version → ✅ version + arrow explanation)

### Phase 3 — Verbal identity
11. **Mantras** — 8–12 short guiding phrases
12. **Dicionário** — 10–15 preferred words + 5–10 proprietary expressions

### Phase 4 — Visual identity
13. **Paleta** — hex codes with names. Identify: background(s), text, accent/signature, support, accent colors. Extract from logo or Instagram if available.
14. **Fonte primária** — Google Fonts name (default: Montserrat). Which weights matter?
15. **Fonte secundária** — optional (default: Playfair Display italic for accent highlights). Usage rule?
16. **Estilo visual** — aesthetic in 3–5 words + 4 brief descriptive sentences
17. **5 regras visuais** — what to always do / never do visually

### Phase 5 — Logo (optional)
18. **Logotipo** — does the brand have a logo to display? If yes, request the image file. Show on dark + light backgrounds.
19. **Tagline** — optional phrase to place next to the logo

### Phase 6 — Content pillars
20. **Pilares** — 3–5 pillars: title + 2-sentence description + 2 example topics

### Phase 7 — Credits (always last)
21. **Contribuidores** — who else contributed (names + roles). Higor Manoel @higormanoeldesign is always the document designer.

## Instagram analysis

When a profile URL or screenshot is provided:
- **Bio**: extract niche, value prop, voice clues, linked businesses/agencies
- **Post titles**: recurring words, tone patterns, content categories → inform pillars and voice modes
- **Visual grid**: dominant colors, typography weight, photo treatment (warm/cool, saturated/desaturated)
- **Linked brands**: may carry institutional colors (confirm with user before including)
- **Estimate hex values** from dominant visual elements; validate with user

## Generate the PDF

1. Build HTML based on `assets/template_brand_manual.html` — adapt per brand data
2. Start server: `python3 -m http.server 9191` from the HTML directory
3. Run: `bash scripts/generate_pdf.sh <html_url_on_localhost> <output_path>`
4. Default output: `/Users/higormanoel/Desktop/Motions/COM IA/Manual_da_Marca_[brandname].pdf`
5. Visually verify 2–3 key pages in browser before delivering
6. Report file size and page count

## Copy rules

- No em dashes in prose. Commas instead.
- No AI filler phrases ("vale ressaltar", "é importante notar", "destaca-se que").
- Direct, declarative sentences. Active voice.
- Large right-column quotes: 1–2 sentences max, high-impact.
- Body copy: Montserrat 400. Section titles: 700–800.
- Accent/highlight words: Playfair Display italic only.
- All copy in Brazilian Portuguese unless the brand uses another language.

## Credits page — always include

```
Manual criado por
Higor Manoel
@higormanoeldesign
Designer · Estratégia de Marca · IA Aplicada

[Each contributor on its own line: Name — Role]

Manual da Marca — @[handle] · [year]
```
