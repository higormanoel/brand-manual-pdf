# Brand Manual PDF

> Skill para o Claude Code gerar manuais de marca completos em PDF — formato editorial, páginas alternando escuro e claro, landscape 16:9.

Desenvolvida por **Higor Manoel** ([@higormanoeldesign](https://instagram.com/higormanoeldesign)).

---

## O que essa Skill faz

Conduz o usuário por todas as perguntas necessárias para montar um manual de marca profissional, analisa o que está faltando, e só gera o PDF quando todas as informações estiverem completas.

**Seções cobertas:**

| # | Seção |
|---|-------|
| Capa | Identidade visual da capa |
| 001 | Identidade & Posicionamento |
| — | Como nos definimos |
| — | Narrativas da Marca |
| 002 | Arquétipos |
| 003 | Tom de Voz (por modo + Dos & Donts) |
| 004 | Mantras & Dicionário da Marca |
| 005 | Paleta de Cores |
| 006 | Tipografia |
| 007 | Logotipo e aplicações *(opcional)* |
| 008 | Pilares de Conteúdo |
| 009 | Estilo Visual |
| — | Créditos |

Os créditos são **sempre perguntados ao usuário** — a skill não assume nada.

---

## Pré-requisitos

- **macOS**
- **Google Chrome** → [google.com/chrome](https://www.google.com/chrome/)
- **Node.js 18+** → [nodejs.org](https://nodejs.org/) ou `brew install node`
- **Git** → já vem no Mac; confirme com `git --version`

---

## 1. Instalar o Claude Code

```bash
npm install -g @anthropic/claude-code
```

Na primeira vez, autentique com sua conta Anthropic:

```bash
claude
```

> Sem conta? Crie uma em [claude.ai](https://claude.ai).

---

## 2. Instalar a Skill

### Clonar direto na pasta de skills

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/higormanoel/brand-manual-pdf.git ~/.codex/skills/brand-manual-pdf
```

O Claude Code detecta skills automaticamente nessa pasta. Pronto.

### Verificar

```bash
ls ~/.codex/skills/brand-manual-pdf
# SKILL.md  agents/  assets/  scripts/
```

---

## 3. Usar a Skill

Abra o Terminal e inicie o Claude Code:

```bash
claude
```

Peça para criar um manual de marca:

```
Crie um manual de marca em PDF para minha marca
```

```
Quero fazer um brand manual da [nome da marca]
```

```
Crie um manual de marca para https://www.instagram.com/nomedomarca/
```

---

## 4. Como funciona o processo

A skill conduz tudo em **3 estágios**:

### Estágio 1 — Coleta de informações

O Claude faz as perguntas em **7 fases**, uma por vez — nunca tudo de uma vez:

| Fase | O que é pedido |
|------|---------------|
| 1 | Nome, handle, Instagram/referência visual, nicho, público, proposta de valor, frase de posicionamento |
| 2 | Como nos definimos, narrativas, arquétipos, modos de tom de voz, Dos & Donts |
| 3 | Mantras e dicionário da marca |
| 4 | Paleta de cores, fontes, estilo visual, regras de aplicação |
| 5 | Logotipo e tagline *(opcional)* |
| 6 | Pilares de conteúdo |
| 7 | **Quem assina o manual** (designer + contribuidores) |

> A Fase 7 é sempre perguntada. Nenhum nome é assumido automaticamente.

---

### Estágio 2 — Análise e gaps

Depois de coletar tudo, o Claude analisa o que está completo e o que falta. Se encontrar algum dado insuficiente, ele vai **diretamente ao ponto** e pede só o que falta — sem repetir o que já foi respondido.

Isso continua até que **todas as seções estejam completas**.

---

### Estágio 3 — Geração do PDF

Só quando tudo estiver completo o Claude gera o HTML, renderiza via Chrome headless e salva o PDF. Ele pergunta onde você quer salvar antes de gerar.

---

## Análise de Instagram

Se você fornecer um perfil do Instagram (URL ou print da tela), a skill extrai automaticamente:

- Bio e posicionamento
- Padrões de copy nos títulos dos posts
- Cores dominantes do feed (estimativa de hex)
- Estilo visual e tratamento fotográfico
- Marcas ou agências vinculadas (que podem ter cores institucionais)

---

## Estrutura do repositório

```
brand-manual-pdf/
├── SKILL.md                        # Instruções completas para o Claude
├── agents/
│   └── openai.yaml                 # Metadados da skill
├── assets/
│   └── template_brand_manual.html  # Template HTML + CSS completo
└── scripts/
    └── generate_pdf.sh             # Chrome headless → PDF
```

---

## Atualizar

```bash
cd ~/.codex/skills/brand-manual-pdf
git pull
```

---

## Desenvolvida por

**Higor Manoel** — Designer, Estratégia de Marca & IA Aplicada

- Instagram: [@higormanoeldesign](https://instagram.com/higormanoeldesign)
- GitHub: [github.com/higormanoel](https://github.com/higormanoel)
