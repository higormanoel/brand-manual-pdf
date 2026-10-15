# Marquio

Este é o repositório independente de `higormanoel/brand-manual-pdf`, evoluindo para o Marquio Studio. Não unir com o portfólio ou outros repositórios. Siga as instruções do ambiente Pessoal em `/Users/higormanoel/Projects/Pessoal/AGENTS.md` e preserve alterações de outros assistentes.

## Decisões do usuário

Em 15/10/2026 o usuário aprovou a especificação de Marquio com editor próprio e, em seguida, o plano de implementação com subagentes. Os documentos estão em `docs/proposals/` e `docs/superpowers/plans/2026-10-15-marquio-studio.md`. Continue de onde a execução parou; não reabra as mesmas aprovações de nome, arquitetura, stack e método.

Leia `PRODUCT.md` e `DESIGN.md` para produto e direção visual. A interface usa convenções familiares de editor de design; o manual usa um preset editorial neutro em 16:9. A identidade do cliente e o sistema editorial são configurações diferentes.

## Requisitos de implementação

- Todos os títulos, regras, rodapés, créditos e demais elementos do manual são nós editáveis.
- Campos e seções podem ser pulados. Não invente regras de marca, dados institucionais, logos ou responsáveis.
- Sugestões permanecem identificadas até aprovação do designer.
- Editor e exportador compartilham a árvore de renderização. Geometria canônica de 1920 × 1080; diferencie CSS pixels de pontos de PDF.
- Transformações de nós usam origem local no canto superior esquerdo: translate(x,y), rotate(degrees), scale(scaleX,scaleY). Filhos de grupos estão em coordenadas locais.
- No modo local, o servidor grava documento/assets e confirma revisão. O navegador não é a única fonte de verdade. Exportação recebe um snapshot da revisão confirmada.
- Regeneração preserva o trabalho manual existente como versão recuperável.
- Assets ficam fora do histórico de edição. Arquivos portáteis não dependem de URLs temporárias ou caminhos absolutos da máquina.
- Geração externa é opcional. Um prompt pronto não é uma imagem gerada; ilustração não é fotografia de produção real.

## Materiais e procedência

A referência privada fornecida pelo usuário não pode ser distribuída no repositório. Não extrair suas imagens/fontes para o produto nem incluir o nome que o usuário explicitamente pediu para omitir. As cenas em `public/mockups/` foram geradas originalmente para este projeto e têm prompts/procedência. A marca Aurora é fictícia e seus assets são originais.

Preserve a skill/template/script legados durante a migração. Testes de instalação usam diretórios temporários, sem alterar instalações globais do usuário. Não publique pacote, faça deploy ou renomeie o repositório como efeito de testes.

## Retomada e verificação

Durante esta execução, o ledger local está em `.superpowers/sdd/2026-10-15-marquio-studio/progress.md`, com briefs, relatórios e revisões. Consulte também o histórico Git para não repetir tarefas concluídas. A implementação principal fica no worktree `Projetos/Marquio`, branch `codex/marquio-app`; a skill instalada é outro checkout preservado.

Use os scripts reais de `package.json`. Testes unitários ficam em `tests/**/*.test.ts`; testes de navegador ficam em `tests/browser/*.spec.ts`. Rode os testes focados durante desenvolvimento e a suíte apropriada antes de declarar conclusão. Não declare app, exportação ou integração completos com base apenas em tipos ou documentação.

Em execução paralela, cada agente possui seus arquivos. Não use `git add .`, não reverta alterações alheias e não edite contratos compartilhados sem coordenar com o responsável.
