# Marquio Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a primeira versão funcional do app web Marquio, do briefing opcional ao manual editável e ao PDF, reutilizando o repositório existente.

**Architecture:** Um pacote TypeScript com núcleo de documento independente, Studio React e servidor/CLI Node. Pranchetas DOM/SVG usam o mesmo renderer na edição e exportação; arquivos locais são a fonte canônica no modo local. Codex e Claude Code usam adaptadores finos sobre comandos validados do mesmo produto.

**Tech Stack:** Node.js 22+, TypeScript, React, Vite, Zod, Vitest, Playwright/Chromium, JSZip, pdf-lib e Inter distribuída com OFL. Confirmar versões compatíveis nas fontes oficiais ao instalar, fixá-las no lockfile e não adotar uma biblioteca de transformação sem a prova da tarefa 3.

**Spec:** [Especificação aprovada](../../proposals/2026-10-15-marquio.md), [cenas de mockup](../../proposals/mockups-marquio.md) e [evidências técnicas](../../proposals/pesquisa-tecnica.md). Usuário aprovou “Marquio e editor próprio” em 15/10/2026.

**Status:** plano aprovado pelo usuário em 15/10/2026, com execução por subagentes. Os comandos de produto descritos abaixo serão implementados nesta execução.

## Global Constraints

- “A instalação no Claude Code e no Codex é uma porta de entrada para o mesmo aplicativo.”
- “A quantidade de páginas é resultado do conteúdo, não uma meta obrigatória.”
- “O nome que o usuário pediu para omitir não entra em código, prompts, exemplos, documentação ou créditos do produto.”
- “Se uma seção foi pulada, o agente não volta a exigir a resposta na mesma coleta.”
- “Todos os objetos do manual devem estar no documento editável.”
- “Gerar novamente uma seção não sobrescreve silenciosamente as alterações manuais.”
- “O modo local serve em `127.0.0.1`, escolhe uma porta disponível e abre o navegador do usuário.”
- “Não exigir conta ou banco remoto para o fluxo principal.”
- “Um PDF antigo não pode ser aceito como prova de sucesso.”
- “Não alegar suporte CMYK, PDF/X, PSD ou editabilidade do PDF na primeira versão.”
- Não incluir o PDF privado, suas fontes extraídas, pessoas ou peças na distribuição. Não unir os repositórios independentes do portfólio. Manter o modo legado durante a migração.

## Review Focus

1. Texto longo e fonte enviada: medir no renderer com as fontes prontas; continuar páginas sem cortar ou reduzir o texto silenciosamente. Testes nas tarefas 3 e 4.
2. Mudança de porta e confirmação de save perdida: apenas revisões confirmadas em disco garantem continuidade entre origens; retentativa não pode duplicar comandos. Testes na tarefa 8.
3. Coordenadas sob zoom, rotação e agrupamento: manipulações devem preservar a geometria e o histórico ao reabrir. Testes nas tarefas 2 e 5.
4. Exportação concorrente a uma edição: snapshot imutável e revisão identificada; jamais exportar uma cópia velha como atual. Testes nas tarefas 8 e 9.
5. Importação portátil com assets/fontes e caminhos inválidos: manter os bytes, não depender da máquina original e rejeitar referências externas ao pacote. Testes nas tarefas 1 e 8.

## Mapa de arquivos e dependências

Um único `package.json`, sem monorepo nesta versão. Fontes em `src/`; produto compilado em `dist/studio/` e `dist/node/`. `bin/marquio.mjs` inicia a CLI compilada. `fixtures/aurora/` contém uma identidade fictícia original. Dependências Node de filesystem/processo não entram no bundle web.

| Área | Arquivos principais | Responsabilidade |
|---|---|---|
| Documento | `src/core/project.ts`, `nodes.ts`, `schema.ts`, `assets.ts` | Contrato, validação e referências estáveis |
| Comandos | `src/core/commands.ts`, `history.ts`, `geometry.ts` | Operações puras, undo/redo e transformações |
| Renderer | `src/render/Artboard.tsx`, `NodeRenderer.tsx`, `textMeasurement.ts`, `preflight.ts`, `print.css` | Árvore comum de tela/PDF e diagnósticos |
| Editorial | `src/editorial/generate.ts`, `pagination.ts`, `neutral.ts` | Composição, continuação, ordem e variantes |
| Studio | `src/studio/App.tsx`, `editor/`, `intake/`, `panels/`, `styles/` | Fluxo e ferramentas visíveis |
| Mockups | `src/mockups/presets.ts`, `prompts.ts`, `projection.ts`, `providers.ts` | Catálogo, parâmetros e resultados |
| Storage | `src/storage/repository.ts`, `portable.ts`, `recovery.ts` | Persistência local e arquivo transportável |
| Runtime | `src/server/server.ts`, `session.ts`, `src/export/pdf.ts`, `src/cli/cli.ts` | Servidor, revisão, PDF e comandos |
| Integrações | `integrations/codex/SKILL.md`, `integrations/claude/SKILL.md`, `src/cli/install.ts` | Instalação própria de cada agente |

Sequência principal: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10. Tarefa 8 pode avançar em paralelo após 1 e 2, respeitando os contratos de revisão. Não editar arquivos compartilhados simultaneamente sem definir um responsável.

## Task 1: Documento validado e fixture original

**Files:** criar `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `src/core/{project,nodes,schema,assets}.ts`, `tests/core/project.test.ts`, `fixtures/aurora/` e a configuração mínima de testes/build.

**Interfaces:** exportar `BrandProject`, `AssetRecord`, `SectionRecord`, `Page`, `DocumentNode`, `Diagnostic`; `parseProject(input: unknown): BrandProject`; `createProject(title: string): BrandProject`. `schemaVersion` inicial é `1`; IDs estáveis; `revision` inteiro não negativo; grade-base de página `1920 × 1080`. Tipos de nó: `text`, `image`, `shape`, `group`, `mockup`; grupos contêm filhos em coordenadas locais. Asset tem ID, tipo MIME, nome, caminho relativo e hash; binários ficam fora do histórico. Seção tem `enabled` separado de `status` (`not-started`, `provided`, `suggested`, `skipped`, `approved`).

- [ ] Escrever testes: projeto apenas com nome é válido; `skipped` não exige conteúdo; seção desabilitada preserva dados; referência a asset inexistente, revisão negativa e versão futura retornam diagnóstico claro. Fixture não contém placeholders e identifica a marca como fictícia.
- [ ] Instalar somente o runtime necessário à tarefa e executar `npm test -- tests/core/project.test.ts`; confirmar falha por contratos ausentes.
- [ ] Implementar contratos, schema e fixture. Guardar origem de conteúdo e aprovação; não inferir regras institucionais nem responsáveis.
- [ ] Reexecutar teste e `npm run typecheck`; ambos devem passar.
- [ ] Revisar e criar commit `feat: add versioned Marquio project model`.

## Task 2: Comandos, geometria e histórico

**Files:** criar `src/core/{commands,history,geometry}.ts` e `tests/core/{commands,geometry,history}.test.ts`.

**Interfaces:** `applyCommands(project: BrandProject, commands: DocumentCommand[]): BrandProject`; `CommandBatch {commandId: string, expectedRevision: number, commands: DocumentCommand[]}`; `SaveAck {commandId: string, revision: number, project: BrandProject}`. Comandos cobrem inserir/editar/excluir/reordenar nós e páginas, agrupar/desagrupar e instalar uma variante gerada. O núcleo não incrementa a revisão persistida; isso cabe ao repositório. `createHistory(project)` fornece `execute`, `undo`, `redo`; zoom e seleção ficam fora do documento.

- [ ] Testar: duplicar grupo recria IDs dos filhos; agrupar/desagrupar preserva posição visual; undo/redo restaura texto, rotação, recorte e ordem; nó bloqueado não move por gesto; comandos inválidos não alteram o original.
- [ ] Executar `npm test -- tests/core/commands.test.ts tests/core/geometry.test.ts tests/core/history.test.ts` e confirmar falhas iniciais.
- [ ] Implementar matrizes de coordenadas de grupos e um único caminho de conversão entre tela e documento; alinhar/distribuir usa esse mesmo contrato.
- [ ] Reexecutar os testes; verificar que histórico não copia bytes de assets.
- [ ] Revisar e criar commit `feat: add document commands and reversible editing`.

## Task 3: Renderer comum e prova de fidelidade

**Files:** criar `index.html`, `src/main.tsx`, `src/render/{Artboard,NodeRenderer}.tsx`, `textMeasurement.ts`, `preflight.ts`, `print.css`, `src/mockups/projection.ts`, `tests/browser/render.spec.ts` e `playwright.config.ts`.

**Interfaces:** `Artboard({page, assets, resolveAsset, mode})`; `mode` é `editor` ou `print`, com geometria idêntica. `measureText(request: TextMeasureRequest): Promise<TextMeasureResult>` usa a fonte carregada e a caixa real no DOM. `preflight(project, measurements): Diagnostic[]` localiza página e nó. `projectToQuad(corners): number[]` retorna a matriz CSS de perspectiva e rejeita quadriláteros degenerados.

- [ ] Escrever teste de navegador com texto rotacionado, grupo, transparência, recorte, fonte local e arte projetada em quatro cantos; criar PDF de prova com a mesma árvore e comparar visualmente os objetos.
- [ ] Executar `npm run test:e2e -- tests/browser/render.spec.ts` antes do renderer; confirmar falha.
- [ ] Implementar renderer e medição, incluindo espera de fontes/imagens. Usar Inter local com aviso OFL. Editor trabalha em 1920 × 1080 unidades; impressão usa `@page` de 1920 × 1080 pontos e escala explícita de 4/3 entre unidades CSS e o papel. Verificar dimensões com pdf-lib em vez de assumir equivalência entre px e pt.
- [ ] Validar a projeção no PDF. Se o Chromium não preservar uma aplicação projetada, usar uma imagem derivada somente para a superfície, mantendo arte/cantos/máscara no projeto e texto do manual vivo. Registrar essa decisão antes de expandir o compositor.
- [ ] Confirmar texto pesquisável no PDF de prova, dimensões e leitura das imagens; revisar o PNG renderizado e criar commit `feat: share artboard rendering and print geometry`.

## Task 4: Geração editorial e continuação de texto

**Files:** criar `src/editorial/{generate,pagination,neutral}.ts`, `tests/editorial/generate.test.ts`, `tests/browser/pagination.spec.ts`.

**Interfaces:** `generateManual(project: BrandProject, options: {measureText}): Promise<GenerationResult>`; resultado contém `sections: GeneratedSection[]` e `diagnostics`, sem substituir páginas existentes. `GeneratedSection` contém `sectionId`, `variantId`, `pages` e `sourceRevision`. IDs de papel editorial são estáveis dentro da variante.

- [ ] Testar nome isolado, todas as seções puladas, uma voz com exemplos, paleta sem logo e fixture completa. A sequência é posicionamento, logo, fotografia, cores, tipografia, elementos, mídias e identidade completa; blocos desabilitados não deixam aberturas vazias.
- [ ] Testar no navegador corpo longo e fonte enviada: continuar páginas e manter o texto integral, sem colisão com cabeçalho/rodapé. Regenerar uma seção editada conserva a variante anterior.
- [ ] Confirmar falhas com `npm test -- tests/editorial/generate.test.ts` e `npm run test:e2e -- tests/browser/pagination.spec.ts`.
- [ ] Implementar composições com os valores da especificação: fundos próximos de `#040606`/`#FFFFFF`, corpo `#0F0F0F`, margem de referência de 91 unidades e escala Inter 72/56/36/21/13 conforme o papel. Cabeçalho, regra e créditos são nós comuns. Arquétipos e pilares são extras opcionais.
- [ ] Validar os dois testes, inspecionar miniaturas e criar commit `feat: generate editable editorial brand manuals`.

## Task 5: Editor de pranchetas e páginas

**Files:** criar `src/studio/App.tsx`, `editor/{EditorCanvas,SelectionOverlay,Toolbar}.tsx`, `panels/{PagesPanel,LayersPanel,PropertiesPanel}.tsx`, `styles/studio.css`, `tests/browser/editor.spec.ts`.

**Interfaces:** o Studio mantém um projeto e envia `DocumentCommand[]` pelo histórico da tarefa 2. `onCommit(batch: CommandBatch): Promise<SaveAck>` é injetado; não grava arquivos diretamente. O renderer da tarefa 3 não contém alças, seleção ou controles.

- [ ] Escrever um fluxo real: inserir texto/imagem/forma, mover sob zoom de 50% e 125%, dimensionar, girar, alinhar, agrupar, reordenar camada, duplicar página, mudar fundo e desfazer/refazer. Editar rodapé prova que elementos do preset não estão achatados.
- [ ] Testar fonte/peso/cor/entrelinha/espaçamento/alinhamento, crop/ponto focal, lock/hide e teclado dentro de campo de texto. Seleção múltipla tem resultado coerente com as propriedades numéricas.
- [ ] Executar `npm run test:e2e -- tests/browser/editor.spec.ts` e confirmar falha antes de implementar.
- [ ] Implementar UI escura compacta, barra superior, ferramentas à esquerda, área central e painéis de páginas/camadas/propriedades. Implementar guias, grade, encaixe desligável, pan e fit-to-window. Decompor componentes por responsabilidade.
- [ ] Passar o fluxo, revisar em janela desktop e largura reduzida e criar commit `feat: add Marquio artboard editing studio`.

## Task 6: Briefing opcional, assets e revisão

**Files:** criar `src/studio/intake/{Intake,SectionForm,AssetPicker,Review}.tsx`, `src/studio/panels/AssetsPanel.tsx`, `tests/browser/intake.spec.ts`.

**Interfaces:** formulários alteram os campos estruturados via comandos; arquivos passam por `AssetImporter.import(file): Promise<AssetRecord>`. Solicitação de texto ao agente produz um pedido copiável e permite importar uma resposta estruturada marcada como `suggested`; a UI não a apresenta como geração automática sem um agente/provedor conectado.

- [ ] Testar novo projeto apenas com nome; pular e retomar uma seção; enviar logo e fonte; revisar o que foi sugerido; gerar e abrir editor. Sem logo, aplicações dependentes são omitidas.
- [ ] Testar trocar arquivo e recarregar sem perder referência; mostrar fonte substituída; perguntar créditos e deixá-los em branco quando o designer pula.
- [ ] Executar `npm run test:e2e -- tests/browser/intake.spec.ts` e confirmar falha.
- [ ] Implementar blocos da especificação, repetidores de voz/exemplos, cores, hierarquia tipográfica e uploads. Diagnósticos apontam a seção e a ação possível; dados opcionais não bloqueiam a geração parcial.
- [ ] Passar os testes e criar commit `feat: add optional brand intake and asset review`.

## Task 7: Mockups e prompts utilizáveis

**Files:** criar `src/mockups/{presets,prompts,providers}.ts`, `src/studio/panels/MockupsPanel.tsx`, `fixtures/mockups/`, `tests/mockups/prompts.test.ts`, `tests/browser/mockups.spec.ts`.

**Interfaces:** `resolveMockupPrompt(presetId, inputs): ResolvedPrompt`; `MockupProvider.generate(request): Promise<MockupResult>` é opcional e produz um resultado, sem editar o documento. Nó `mockup` preserva `sceneAssetId`, `artworkAssetId`, cantos, máscara opcional, overlay e origem. Estados distinguem prompt preparado, geração em curso, imagem pronta e aplicação aprovada.

- [ ] Testar os 12 presets sem placeholders remanescentes; dados faltantes retornam requisitos de upload. Nenhum prompt inventa logo, pessoa real, estatística ou informação do cliente.
- [ ] Testar uma arte exata em cartão, tela e pôster; mudar a arte preserva cantos e máscara. Importar uma cena sem metadados permite marcar os quatro cantos. Camiseta/boné oferecem prompt e imagem final, sem alegar edição paramétrica de tecido/bordado.
- [ ] Confirmar falhas em `npm test -- tests/mockups/prompts.test.ts` e `npm run test:e2e -- tests/browser/mockups.spec.ts`.
- [ ] Implementar catálogo a partir dos prompts aprovados, cópia/download do pedido, importação de resultado e compositor planar validado na tarefa 3. Criar cenas locais originais em SVG para cartão, tela e pôster, identificadas como ilustrações de apresentação. Cenas fotográficas dependem de upload ou gerador configurado; nunca apresentar ilustração como fotografia gerada.
- [ ] Passar testes, inspecionar as três aplicações e criar commit `feat: add reusable mockup prompts and editable applications`.

## Task 8: Persistência, arquivo portátil e API local

**Files:** criar `src/storage/{repository,portable,recovery}.ts`, `src/server/{server,session}.ts`, `tests/storage/{repository,portable}.test.ts`, `tests/server/session.test.ts`, `tests/browser/persistence.spec.ts`.

**Interfaces:** `ProjectRepository.open(folder)`; `load(): Promise<BrandProject>`; `commit(batch: CommandBatch): Promise<SaveAck>`; `snapshot(revision: number): Promise<ProjectSnapshot>`. `ProjectSnapshot` é imutável e inclui assets necessários. `exportPortable(snapshot): Promise<Uint8Array>` e `importPortable(bytes): Promise<ProjectSnapshot>`. Servidor expõe carregar, comandar, importar asset, obter snapshot e exportar, com contratos JSON validados.

- [ ] Testar dois clientes na mesma revisão: o segundo recebe conflito, não sobrescreve; repetir `commandId` após resposta perdida retorna o mesmo ack sem novo incremento. Gravação interrompida deixa documento válido anterior ou posterior.
- [ ] Testar pacote com fontes/imagens: mover pasta original e reabrir sem URLs temporárias. Rejeitar caminho com travessia, versão futura e referência a asset ausente.
- [ ] Testar reinício em outra porta: revisão confirmada reaparece. Distinguir alterações locais pendentes; IndexedDB da origem anterior não é garantia de recuperação entre portas.
- [ ] Confirmar falhas nos três grupos de testes e implementar coordenador de escrita único, gravação atômica e cópia dos assets por ID/hash. Browser-only usa IndexedDB e backup portátil; modo local aguarda confirmação do servidor.
- [ ] Implementar sessão local, verificação de Host/origem e proteção dos assets privados. Token de arranque não entra no projeto/arquivo portátil. Não permitir ler caminhos arbitrários fora da pasta do projeto.
- [ ] Passar testes unitários e `npm run test:e2e -- tests/browser/persistence.spec.ts`; criar commit `feat: persist local projects and portable asset bundles`.

## Task 9: CLI, abertura local e PDF validado

**Files:** criar `bin/marquio.mjs`, `src/cli/{cli,openBrowser}.ts`, `src/export/pdf.ts`, `tests/cli/cli.test.ts`, `tests/export/pdf.test.ts`, `tests/browser/export.spec.ts`.

**Interfaces:** comandos `studio`, `validate`, `generate`, `export`. `startStudio({folder, port?, open?}): Promise<{url, close}>` resolve somente após o servidor estar pronto; `exportPdf({snapshot, outputPath, browserExecutable?}): Promise<ExportReport>` devolve revisão, páginas, dimensões e caminho. Nenhum comando precisa de conta.

- [ ] Testar inicialização com porta ocupada e `--no-open`; `studio` publica a URL efetiva e mantém processo disponível. Abrir navegador usa argumentos separados por plataforma, sem construir shell com conteúdo do projeto.
- [ ] Testar PDF de várias páginas com fonte enviada, crop, rotação e transparência; comparar dimensões/quantidade com o snapshot e extrair texto. Aguardar uma gravação atrasada e editar durante exportação: a entrega deve corresponder à revisão solicitada.
- [ ] Testar falha de fonte/asset/Chromium com PDF anterior no destino: não substituir arquivo e não relatar sucesso.
- [ ] Confirmar falhas em `npm test -- tests/cli/cli.test.ts tests/export/pdf.test.ts` e `npm run test:e2e -- tests/browser/export.spec.ts`.
- [ ] Implementar exportação pelo renderer comum, readiness e preflight; escrever temporário, carregar com pdf-lib, validar páginas/dimensões e então renomear. UI exibe revisão e permite abrir a prévia antes da entrega final. No browser-only, oferecer impressão e arquivo portátil com rotulagem correta.
- [ ] Passar testes, renderizar/inspecionar PDF real da fixture e criar commit `feat: open local studio and export validated brand book PDFs`.

## Task 10: Adaptadores, documentação e entrega demonstrável

**Files:** criar `integrations/{codex,claude}/SKILL.md`, `src/cli/install.ts`, `tests/cli/install.test.ts`, `README.pt-BR.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `.github/workflows/ci.yml` e templates de issues; atualizar `README.md`, `SKILL.md`, `agents/openai.yaml`.

**Interfaces:** `installAgent({agent, targetRoot, overwrite?: false}): InstallReport`; CLI adiciona `install --agent codex|claude`. Adaptadores documentam o mesmo formato e comandos, respeitam seções puladas e abrem o Studio antes de exportar a entrega final.

- [ ] Testar instalações em diretórios temporários próprios de cada host; preservar instalação existente sem `--force`; ambos adaptadores resolvem o mesmo projeto e revisão confirmada.
- [ ] Executar `npm test -- tests/cli/install.test.ts` e confirmar falha.
- [ ] Implementar instalação consultando a documentação oficial atual dos dois hosts. Preservar arquivos do modo legado e explicar a migração. Não instalar globalmente no computador do usuário durante os testes.
- [ ] Documentar instalação a partir deste repositório, requisitos reais, execução local, fluxo completo, uso sem geração paga e limites conhecidos. README principal em inglês com guia PT-BR. Adicionar MIT para o código novo conforme direção aprovada e inventário separado de Inter/assets. Não publicar pacote npm, alterar nome remoto ou fazer deploy nesta tarefa.
- [ ] Produzir capturas reais, projeto portátil e PDF da identidade fictícia, com instrução reproduzível. Assets de demonstração são próprios; verificar que o pacote não contém referência privada ou dados pessoais.
- [ ] Rodar `npm ci`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e`. Validar `npm pack --dry-run`, sem publicar. Revisão independente do conjunto e correção dos achados precedem commit `docs: ship Marquio setup and complete designer walkthrough`.

## Revisão do plano e execução

Cobertura conferida contra a especificação: coleta, omissões e origem (1/4/6); tipografia/diagramação e exportação (3/4/9); ferramentas e histórico (2/5); mockups (3/7); armazenamento e revisão (8); instalação nos agentes e demonstração pública (10). Os cinco itens de Review Focus têm testes nos responsáveis indicados.

Execução aprovada: **com subagentes**, mantendo um responsável por arquivo compartilhado e revisão de cada entrega. O contrato central permite desenvolver armazenamento em paralelo ao editor; renderer e exportação precisam de integração e revisão conjunta. A revisão do usuário e a escolha do método foram concluídas em 15/10/2026.

O resultado a apresentar ao fim da execução é o app funcionando localmente, o projeto editável fictício, seu PDF verificado e os comandos reais para iniciar o Studio. Documentação ou telas estáticas sozinhas não satisfazem esta entrega.
