# Brand Manual PDF

> Skill para gerar manuais de marca completos em PDF — formato editorial, páginas alternando escuro e claro, landscape 16:9. Criado por **Higor Manoel** ([@higormanoeldesign](https://instagram.com/higormanoeldesign)).

---

## O que essa Skill faz

Transforma as informações de uma marca em um manual de marca profissional em PDF, cobrindo:

- Identidade & Posicionamento
- Narrativas da Marca
- Arquétipos
- Tom de Voz com Dos & Donts por modo
- Mantras & Dicionário da Marca
- Paleta de Cores
- Tipografia
- Logotipo (opcional)
- Pilares de Conteúdo
- Estilo Visual
- Créditos (sempre assinado por Higor Manoel + contribuidores listados)

O resultado final é um PDF gerado via HTML + Chrome headless, com o mesmo padrão visual de manuais editoriais de alto padrão.

---

## Pré-requisitos

Antes de começar, você precisa ter instalado:

- **macOS** (o script de PDF usa o Chrome do Mac)
- **Google Chrome** — [google.com/chrome](https://www.google.com/chrome/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/) ou via `brew install node`
- **Git** — geralmente já vem no Mac; confirme com `git --version`

---

## 1. Instalar o Claude Code

O Claude Code é a CLI oficial da Anthropic. Abra o Terminal e rode:

```bash
npm install -g @anthropic/claude-code
```

Depois, faça login:

```bash
claude
```

Na primeira vez ele vai pedir para autenticar com sua conta Anthropic. Siga as instruções na tela.

> **Sem conta?** Crie uma em [claude.ai](https://claude.ai) antes de continuar.

---

## 2. Instalar a Skill

### Opção A — Clonar direto na pasta de skills

```bash
# Cria a pasta de skills se não existir
mkdir -p ~/.codex/skills

# Clona o repositório
git clone https://github.com/higormanoel/brand-manual-pdf.git ~/.codex/skills/brand-manual-pdf
```

Pronto. O Claude Code detecta skills automaticamente nessa pasta.

### Opção B — Clonar em outro lugar e criar symlink

```bash
git clone https://github.com/higormanoel/brand-manual-pdf.git ~/brand-manual-pdf
ln -s ~/brand-manual-pdf ~/.codex/skills/brand-manual-pdf
```

### Verificar a instalação

```bash
ls ~/.codex/skills/brand-manual-pdf
# Deve mostrar: SKILL.md  agents/  assets/  scripts/
```

---

## 3. Usar a Skill

Abra o Terminal na pasta do seu projeto (ou em qualquer lugar) e inicie o Claude Code:

```bash
claude
```

Dentro do Claude Code, peça para criar um manual de marca:

```
Crie um manual de marca em PDF para minha marca
```

ou

```
Quero fazer um brand manual da [nome da marca]
```

ou forneça o perfil do Instagram direto:

```
Crie um manual de marca para https://www.instagram.com/nomedomarca/
```

---

## 4. O que esperar

O Claude vai conduzir o processo em **7 fases de perguntas**, sempre uma fase por vez — nunca tudo de uma vez.

### Fase 1 — Identidade
- Nome e handle da marca
- Perfil do Instagram (URL ou print da tela)
- Nicho e público-alvo
- Proposta de valor
- Frase de posicionamento

### Fase 2 — Personalidade
- "Como nos definimos" (3 frases curtas)
- Principais narrativas
- Arquétipos de marca
- Modos de tom de voz + Direcionadores + Pontos de atenção
- Dos & Donts por modo de voz

### Fase 3 — Identidade Verbal
- Mantras (8–12 frases)
- Dicionário da marca (palavras preferidas + termos proprietários)

### Fase 4 — Identidade Visual
- Paleta de cores (hex codes)
- Fonte primária e secundária
- Estilo visual + regras de aplicação

### Fase 5 — Logotipo *(opcional)*
- Arquivo de logo
- Tagline

### Fase 6 — Pilares de Conteúdo
- 3–5 pilares com descrição e exemplos

### Fase 7 — Créditos
- Quem mais contribuiu para o projeto

---

## 5. Output

O PDF é salvo por padrão em:

```
/Users/[seu-usuario]/Desktop/Motions/COM IA/Manual_da_Marca_[marca].pdf
```

Você pode pedir para salvar em outro lugar durante a conversa.

---

## Análise de Instagram

Se você fornecer um perfil do Instagram (URL ou print), o Claude vai extrair automaticamente:

- Bio e posicionamento
- Padrões de copy nos títulos dos posts
- Cores dominantes do feed
- Estilo visual e tratamento fotográfico
- Marcas ou agências vinculadas (que podem ter cores institucionais próprias)

---

## Estrutura do repositório

```
brand-manual-pdf/
├── SKILL.md                        # Instruções para o Claude
├── agents/
│   └── openai.yaml                 # Metadados da skill
├── assets/
│   └── template_brand_manual.html  # Template HTML completo com CSS
└── scripts/
    └── generate_pdf.sh             # Script Chrome headless → PDF
```

---

## Atualizar a Skill

```bash
cd ~/.codex/skills/brand-manual-pdf
git pull
```

---

## Créditos

Criado por **Higor Manoel** — Designer, Estratégia de Marca & IA Aplicada.

- Instagram: [@higormanoeldesign](https://instagram.com/higormanoeldesign)
- GitHub: [github.com/higormanoel](https://github.com/higormanoel)
