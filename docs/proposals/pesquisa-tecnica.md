# Pesquisa técnica da evolução para app web

Data: 15/10/2026. Pesquisa somente leitura e proposta de arquitetura; nenhum app foi implementado durante esta etapa.

## Base existente

Repositório: [higormanoel/brand-manual-pdf](https://github.com/higormanoel/brand-manual-pdf/tree/d75bdfef26bb456a3f6e73f69bbf774ad9bc5814).

Clone local existente: `/Users/higormanoel/.codex/skills/brand-manual-pdf`. Branch `main`, commit `d75bdfef26bb456a3f6e73f69bbf774ad9bc5814`. Estava limpo antes de adicionar estes documentos. Existe apenas o worktree principal registrado; nenhum registro foi removido ou alterado nesta pesquisa.

Constatações reproduzíveis por inspeção dos cinco arquivos:

- Sem aplicação, runtime, schema, editor, persistência, biblioteca de mockups, testes ou CI.
- A skill exige dados suficientes para todas as seções obrigatórias. Isso conflita com o fluxo de omissão solicitado.
- O template contém 24 elementos `.page`, utiliza `297 × 167 mm` e tem numeração diferente da lista da skill.
- O template contém créditos pessoais fixos, embora a skill peça confirmação do responsável.
- `.page` e `.lp-body` usam `overflow: hidden`, com risco de corte silencioso.
- O script aponta para Chrome no macOS, usa pipeline sem `pipefail` e confere existência do PDF, sem garantir um arquivo novo válido, fontes prontas ou imagens carregadas.
- Não existe `LICENSE` na árvore auditada; a API do GitHub também não identifica uma licença.

Fontes primárias: [skill](https://github.com/higormanoel/brand-manual-pdf/blob/d75bdfef26bb456a3f6e73f69bbf774ad9bc5814/SKILL.md), [template](https://github.com/higormanoel/brand-manual-pdf/blob/d75bdfef26bb456a3f6e73f69bbf774ad9bc5814/assets/template_brand_manual.html), [exportador](https://github.com/higormanoel/brand-manual-pdf/blob/d75bdfef26bb456a3f6e73f69bbf774ad9bc5814/scripts/generate_pdf.sh).

## PhotoCraft

Commit pesquisado: `4e7a17cd5d5723313f459753663d0d155f047e19`.

| Questão | Evidência no projeto | Consequência |
|---|---|---|
| Existe versão web? | Rust/egui/eframe em WASM, WebGPU e fallback WebGL2; incorporação por iframe documentada | Pode ser hospedado e incorporado; não é exclusivamente desktop |
| Licenciamento | Workspace `MIT OR Apache-2.0`, notices e termos separados para marcas | Reutilização de código exige preservar avisos aplicáveis; não reutilizar marca de terceiros como identidade do produto |
| Ferramentas | Texto, formas, camadas, transformações e grupos de pranchetas | Bom referencial para organização e interação |
| Salvamento web | Preferências em localStorage, documentos abertos por seletor e salvos por download; sem autosave/recuperação de documentos | Um produto de manuais ainda precisa implementar persistência |
| PDF comum | Uma página achatada | Não atende por si só a um manual multipágina |
| PDF de pranchetas | Exportação desktop com um JPEG por página; comando usa caminho nativo desabilitado em wasm32 | Precisa adaptação para exportar multipágina no navegador; texto/vetores ficam rasterizados |
| Integração com agente | Registro de comandos, CLI e MCP; ponte de UI desktop | Não equivale a uma API JavaScript de controle do iframe |

Fontes:

- [Licença declarada](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/Cargo.toml#L9), [avisos](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/NOTICE), [marcas](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/docs/brand/LICENSE-brand.txt).
- [Hospedagem e iframe](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/packaging/web/README.md).
- [Pranchetas e exportação](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/crates/engine/src/artboard_cmds.rs#L599), [restrição wasm32](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/crates/engine/src/file_cmds.rs#L32), [PDF](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/crates/io/src/pdf.rs).
- [MCP](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/docs/mcp.md), [shell web](https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/apps/photocraft-web/src/web.rs).

Não executei o PhotoCraft. A ausência de uma ponte pública pronta de `postMessage` é uma conclusão de inspeção do shell e documentação consultados, não uma garantia sobre toda integração externa possível.

## Fontes e referência privada

O PDF fornecido foi analisado localmente com Poppler, pdfplumber e revisão visual de contato das páginas 1–62, além da estrutura textual/tipográfica das 63 páginas. Renderizações de análise ficaram em diretório temporário fora do repositório. Nenhum asset do PDF foi adicionado à distribuição.

O `pdffonts` identificou Inter, Codec Pro, Sundry, Redonda e uma variante de teste de Saans. Isso não autoriza redistribuir os arquivos tipográficos extraídos. O editorial usa sobretudo Inter; os espécimes e peças também usam as fontes da marca apresentada.

[Inter é distribuída sob SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt). O app pode incluir a distribuição original com os avisos exigidos. Outras fontes devem ser fornecidas pelo usuário ou substituídas por uma alternativa documentada. Não considerar um arquivo trial embutido no PDF uma licença do produto.

## Distribuição nos agentes

O README atual mistura Claude Code com pasta do Codex. Consultar os caminhos de instalação de cada host ao implementar os adaptadores:

- [Claude Code: diretórios de skills](https://code.claude.com/docs/en/skills#choose-where-skills-load).
- [Codex: carregamento de skills locais](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).

A cópia legada em `~/.codex/skills` é reconhecida nesta sessão. Isso não deve virar uma promessa de compatibilidade universal entre hosts.

## Nome e lançamento

Triagem técnica dos nomes em 15/10/2026:

| Nome | Busca no GitHub | Consulta npm |
|---|---|---|
| Marquio | Correspondências parciais; nenhuma com nome exato na consulta inspecionada | Nome exato retornou 404 |
| Pranvio | Sem correspondências na consulta | Nome exato retornou 404 |
| Markitura | Sem correspondências na consulta | Nome exato retornou 404 |

Fontes: buscas de repositórios da API GitHub para [Marquio](https://api.github.com/search/repositories?q=marquio+in%3Aname&per_page=100), [Pranvio](https://api.github.com/search/repositories?q=pranvio+in%3Aname), [Markitura](https://api.github.com/search/repositories?q=markitura+in%3Aname); consultas exatas no registro npm. A triagem não verifica marcas registradas, domínios nem reserva nomes. Revalidar antes de publicar.

Para preparar o projeto para colaboração: [arquivos de comunidade no GitHub](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) e [licenciamento do repositório](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

## Estado para o próximo assistente

- O usuário pediu uma evolução real do repositório existente, com app web, edição livre do manual antes da entrega e instalação nos dois agentes.
- Não renomear nem mover o repositório remoto sem uma decisão concreta do usuário.
- Não colocar a referência privada ou seus assets no repositório público.
- Preservar os repositórios independentes do portfólio, `portfolio-site/` e `output/pokedev/`; nenhum foi alterado nesta pesquisa.
- Nesta etapa foram adicionados somente documentos de proposta. O aplicativo, os comandos e os presets ainda não foram implementados ou publicados.
- O usuário aprovou a especificação em 15/10/2026 com a resposta “Aprovar Marquio e editor próprio”. A próxima etapa é a revisão do plano de implementação, sem confundir documentos com entrega funcional.
