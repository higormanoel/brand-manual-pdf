---
name: brand-manual-pdf
description: "Create professional brand manual PDFs in editorial format — alternating dark/light pages, landscape 16:9, minimal and typographic. Guides the user through all brand identity information via structured questions, analyzes completeness, and asks surgically for any missing data before generating. Covers: positioning, how we define ourselves, key narratives, archetypes, voice & tone modes with Dos & Donts per mode, mantras, brand dictionary, color palette, typography, logo system with applications, content pillars, and visual rules. Use when someone asks for a brand manual, brand guidelines, brand book, or brand identity document as a PDF. Optionally analyzes an Instagram profile or screenshot to extract visual identity data."
---

# Brand Manual PDF

Generates a complete brand manual PDF. The process has three stages: **collect**, **analyze & fill gaps**, then **generate**.

Never skip the gap-analysis stage. A manual with missing sections is worse than no manual at all.

---

## Stage 1 — Collect all data

Ask questions in phases. Never dump all phases at once — wait for answers before moving to the next phase. Be conversational and guide the user.

### Phase 1 — Brand core (ask first)

Send these 5 questions together:

1. **Nome e handle** — full brand name and @handle (Instagram, Twitter, etc.)
2. **Perfil do Instagram ou referência visual** — URL or screenshot of the profile grid + bio. If no Instagram, ask for any visual reference (website, portfolio, existing materials).
3. **Nicho e público-alvo** — market segment and target audience in 1–2 sentences
4. **Proposta de valor** — what makes this brand unique vs. competitors
5. **Frase de posicionamento** — a single bold sentence that defines them (will become the large quote on page 001)

If an Instagram URL or screenshot is provided, **analyze it before continuing**:
- Bio → niche, positioning clues, linked businesses/agencies
- Post titles → recurring words, content patterns, voice tone
- Visual grid → dominant colors, typography weight, photo treatment
- Linked brands → may carry institutional colors (ask the user to confirm)
- Estimate hex values from dominant colors

---

### Phase 2 — Personality

Ask after Phase 1 is complete:

6. **"Como nos definimos"** — 3 one-liner definitions (ex: "A agência de growth sem hack.")
7. **Principais narrativas** — 2 key audience-facing phrases + who they're for (ex: "> para nossos clientes")
8. **Arquétipos** — primary (1–2) and secondary trait (1). Options: O Criativo, O Explorador, O Herói, O Sábio, O Governante, O Bobo da Corte, O Cuidador, O Fora-da-Lei, O Mago, O Amante, O Cara Comum, O Inocente
9. **Modos de tom de voz** — name 2–3 voice modes. For each provide:
   - Mode name (ex: "Desromântico", "Memístico", "Sincerão")
   - Subtitle: 3–5 word gray italic phrase describing what this tone does
   - Body: 2 paragraphs explaining when and why to use it
   - Direcionadores: 5–8 bullet points (behaviors this tone has)
   - Pontos de atenção: 3–5 bullet points (what to avoid with this tone)
10. **Dos & Donts por modo** — for each voice mode: 3 pairs (❌ wrong version → ✅ correct version + 1–2 arrow explanation lines)

---

### Phase 3 — Verbal identity

11. **Mantras** — 8–12 short phrases that guide the brand internally and externally
12. **Dicionário** — preferred words (10–15) and proprietary expressions/terms (5–10)

---

### Phase 4 — Visual identity

13. **Paleta de cores** — hex codes with names. Identify groups: background(s), text, accent/signature, institutional color (if brand has one, e.g. from an agency), support colors, accent punctuals. Can extract from logo or Instagram.
14. **Fonte primária** — Google Fonts name (ex: Montserrat). Note which weights the brand uses.
15. **Fonte secundária** — optional accent font (ex: Playfair Display italic for highlighted words). Describe usage rule.
16. **Estilo visual** — describe the aesthetic in 3–5 words + 4 brief descriptive sentences
17. **5 regras visuais de aplicação** — what to always do / never do visually

---

### Phase 5 — Logo (optional)

18. **Logotipo** — does the brand have a logo to display? If yes, request the file (PNG, SVG, etc.). Show it on dark, mid, and light backgrounds. Also show tagline application if it exists.
19. **Tagline** — optional phrase shown alongside the logo (horizontal and/or vertical version)

---

### Phase 6 — Content pillars

20. **Pilares de conteúdo** — 3–5 pillars. For each: title, 2-sentence description, 2 example topics

---

### Phase 7 — Credits (always ask, never assume)

21. **Designer / criador do manual** — ask: "Quem assina a criação deste manual? (nome + @handle ou cargo)"
22. **Contribuidores** — ask: "Tem mais alguém que contribuiu para este trabalho de marca? (nomes e funções)" — can be empty

---

## Stage 2 — Analyze completeness and fill gaps

After all phases are answered, review the collected data against every section in the manual. For each section below, check if the data is sufficient to produce it:

| Section | Minimum required to proceed |
|---------|----------------------------|
| Capa | brand name, handle, subtitle |
| 001 Posicionamento | positioning statement, 2–3 body paragraphs |
| Como nos definimos | 3 one-liner definitions |
| Narrativas | 2 quotes with attribution |
| Arquétipos | 2 archetypes minimum (name + description + chips) |
| Tom de Voz | at least 1 complete mode (title + subtitle + body + direcionadores + pontos de atenção) |
| Dos & Donts | at least 3 pairs per voice mode |
| Mantras | at least 6 mantras |
| Dicionário | at least 8 preferred words + 3 proprietary terms |
| Paleta | at least 3 hex colors named |
| Tipografia | at least 1 Google Font named |
| Logotipo | skip if no file provided — do NOT invent a logo |
| Pilares | at least 3 complete pillars |
| Estilo Visual | at least 4 visual descriptors + 4 rules |
| Créditos | designer name confirmed |

**For each gap found:**
- State clearly what is missing: "Para completar a seção X, preciso de Y."
- Ask only for that specific missing data — do not re-ask what was already answered.
- If the user cannot provide something (e.g. no logo), note it and skip that section.

**Keep asking until all required fields are filled.** Do not proceed to generation with gaps.

---

## Stage 3 — Generate the PDF

Only when Stage 2 confirms everything is complete:

1. Build the HTML from `assets/template_brand_manual.html` — adapt every section with the collected data
2. Start local server: `python3 -m http.server 9191` from the HTML file directory
3. Run: `bash scripts/generate_pdf.sh <url> <output_path>`
4. Ask the user where to save the PDF. Default: `~/Desktop/Manual_da_Marca_[handle].pdf`
5. Visually verify 2–3 key pages in browser before delivering
6. Report file size and page count

---

## Page layout rules

Use `assets/template_brand_manual.html` for all CSS and structure. Never deviate from this system:

- **Dark pages** (cover, openers, credits): near-black background, off-white text. Openers: muted large number + bold section title bottom-left, thin rule above.
- **White pages** (content): thin header label + rule at top, bold section title top-left, two-column body (small text left, large quote or data right), thin footer rule + section label left + year/brand right.
- **Accent color**: ONLY in palette swatches and one word on the cover title. Never as general body text color.
- **No em dashes** (`—`) in prose copy. Commas instead. Keep `—` only in design labels (headers, footers, section numbers, font family names, archetype badge labels).

---

## Sections and page order

```
Capa (dark)
001 — Opener: Identidade & Posicionamento (dark)
  └── Identidade (white): body + large positioning quote
  └── Como nos definimos (white): 3-column definitions
  └── Narrativas (white): 2 large quotes with attribution
002 — Opener: Arquétipos (dark)
  └── Arquétipos (white): 2–3 archetype cards
003 — Opener: Tom de Voz (dark)
  └── [Mode 1] (white): title + subtitle + body + Direcionadores + Pontos de atenção
  └── [Mode 1] Dos & Donts (white): 3 pairs ❌ → ✅
  └── [Mode 2] (white): same structure
  └── [Mode 2] Dos & Donts (white): 3 pairs
  └── [Mode 3] ... (repeat as needed)
004 — Opener: Mantras & Dicionário (dark)
  └── Mantras & Dicionário (white): mantras 2-col + brand dictionary
005 — Opener: Paleta de Cores (dark)
  └── Paleta (white): grouped swatches + usage rules
006 — Opener: Tipografia (dark)
  └── Tipografia (white): primary font + secondary font specimens
007 — Opener: Logotipo (dark)  ← SKIP if no logo provided
  └── Logotipo (white): logo on dark/light cards + tagline
008 — Opener: Pilares de Conteúdo (dark)
  └── Pilares (white): 3–5 pillar cards
009 — Opener: Estilo Visual (dark)
  └── Estilo Visual (white): aesthetic description + 5 application rules
Créditos (dark): designer + contributors
```

---

## Copy rules

- No em dashes in prose. Commas only.
- No AI filler phrases ("vale ressaltar", "é importante notar", "destaca-se que").
- All body copy: direct, declarative, active voice.
- Large right-column quotes: 1–2 sentences max, bold, high-impact.
- Body: primary font weight 400. Section titles: 700–800.
- Accent/highlight words: secondary font italic only.
- Default language: Brazilian Portuguese. Adapt if the brand uses another language.

---

## Credits page — fill from user answers

```
Manual criado por
[Designer name from Phase 7]
[@handle or role from Phase 7]
[Role/subtitle if provided]

[Each contributor: Name — Role]

Manual da Marca — @[handle] · [year]
```
