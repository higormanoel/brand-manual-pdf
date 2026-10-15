# Registro de implementação do Marquio

A especificação e o plano foram aprovados em 15/10/2026. O produto evolui o repositório existente para um Studio web local, mantendo o modo legado. O guia de uso está no [README em português](../README.pt-BR.md).

## Contratos para continuar o projeto

O documento `BrandProject` é a fonte editável comum ao gerador, Studio, CLI e exportador. Posições são locais ao grupo, com origem no canto superior esquerdo; o padrão editorial usa 1920 × 1080 unidades. O renderer é compartilhado e converte explicitamente essa escala em pontos PDF. A identidade do cliente é separada da tipografia e das cores editoriais.

O servidor local confirma revisões por meio de `ProjectRepository`. O arquivo `project.marquio.json` é uma base imutável; leitores precisam resolver os commits posteriores. Histórico e regeneração usam comandos validados, revisão esperada e IDs de operação. Assets permanecem fora dos snapshots de histórico e acompanham o backup portátil em bytes, por caminhos relativos e hashes.

No modo navegador, publicação canônica precisa comparar a revisão e gravar documento, recibo e índice na mesma transação IndexedDB. O cache de recuperação é auxiliar; falhar depois da publicação não pode negar uma confirmação durável. URLs de assets precisam identificar o conteúdo, mantendo versões usadas pelo histórico até fechar a sessão.

Uploads, sugestões e omissões têm estados explícitos. Uma sugestão não vira um fato do cliente por ser inserida no documento. Cenas e prompts funcionam sem conta externa; o produto não vem conectado a um provedor de geração. Fontes comerciais, PSD, CMYK e PDF/X permanecem fora da distribuição inicial.

## Decisões tomadas durante a execução

Esta tabela preserva todas as decisões registradas como `Ruling:` no ledger de execução, na ordem em que ocorreram, incluindo a delimitação da revisão final. Nenhuma falha importante foi silenciosamente adiada.

| Decisão | Motivo | Custo ou consequência se estiver errada |
|---|---|---|
| Trabalhar em um worktree independente. | Preservar a skill instalada, o portfólio e os demais repositórios. | Manter outro checkout. |
| Paralelizar somente arquivos com propriedade distinta e contratos estáveis. | Ganhar tempo sem edições concorrentes nos mesmos arquivos. | Resolver explicitamente conflitos de integração. |
| Preservar os links dos documentos aprovados no checkout original e implementar no novo. | Manter os materiais revisados acessíveis. | A entrega deve apontar para o checkout real do aplicativo. |
| Usar a direção visual e a stack já aprovadas, sem reabrir entrevista de design. | O usuário já havia autorizado nome, editor e escopo. | Uma mudança posterior de direção exigirá retrabalho. |
| Desenvolver comandos e renderer em paralelo. | O renderer depende do documento, sem depender dos comandos. | Mudanças de configuração precisam de um responsável único. |
| Preparar catálogo e painel de mockups antes do shell final. | O schema e as cenas originais já estavam definidos. | Só aceitar a tarefa depois da prova no aplicativo completo. |
| Acrescentar `project.restore` validado e com revisão controlada pelo armazenamento. | Desfazer precisa sobreviver ao fechamento do aplicativo. | Exige regressão e revisão do novo comando. |
| Atribuir histórico e fila ao App, runtimes à integração e fontes/coleta ao briefing. | Estabilizar as interfaces entre tarefas. | Incompatibilidades exigem correção explícita de integração. |
| Substituir locks descartáveis por publicação exclusiva de commits imutáveis. | A recuperação de locks antigos permitia uma corrida entre escritores. | Mais uso de disco; todos os leitores devem resolver o estado pelo repositório. |
| Incluir CLI `apply` e `import-asset`. | Os agentes precisam alterar o mesmo documento sem contornar recibos e revisões. | Manter dois adaptadores finos e seus testes de integração. |
| Preparar adaptadores e documentação em paralelo à integração final. | Comandos e caminhos dos hosts já estavam estáveis. | Adiar alterações compartilhadas, exemplos finais e suíte completa até o handoff. |
| Colocar a edição de mockups já inseridos nas propriedades do Studio. | Cantos, máscara, sobreposição e imagem final também precisam continuar editáveis. | Mais testes de propriedades e histórico, preservando um único modelo de cena. |
| Acrescentar publicação e índice atômicos ao RecoveryStore para o modo navegador. | A revisão e a gravação precisam compartilhar uma transação entre abas. | Mais superfície de armazenamento para testar e revisar, mantendo as APIs anteriores. |
| Manter PSD, retoque completo, CMYK e PDF/X fora da primeira versão. | Limites já aprovados para o lançamento. | Intercâmbio PSD e conversões profissionais de impressão exigem evolução posterior. |
| Manter contas, hospedagem, cobrança, colaboração ao vivo e marketplace fora desta entrega. | Priorizar o fluxo local aprovado. | Distribuição hospedada e colaboração simultânea continuam como trabalho separado. |
| Não avaliar um provedor pago sem conexão como funcionalidade integrada. | Geração é opcional e nenhuma conexão é anunciada. | Cenas incluídas, uploads e prompts são os caminhos padrão disponíveis. |
| Não publicar, implantar, renomear o remoto nem instalar globalmente como teste. | São ações de entrega; raízes temporárias validam os launchers. | Release público e instalação global real precisam de ação deliberada própria. |
| Não acessar a referência privada, identificar sua autoria ou distribuir fontes comerciais extraídas. | Respeitar as restrições do usuário e dos materiais. | Tipografia comercial exata depende de uploads licenciados do designer. |
| Não alegar certificação universal de hardware, queda de energia ou filesystem em rede. | O contrato suportado é um filesystem local com primitivas documentadas. | Novas plataformas e armazenamentos exigem validação independente. |
| Manter deformação avançada de tecido, bordado e superfícies curvas fora das promessas iniciais. | Esses presets informam que trabalham com imagem final. | Exigem uma imagem final importada ou gerada externamente. |
| Incluir uma fonte de demonstração aberta pelo carregador normal de assets, com Inter no corpo. | O primeiro CI Linux demonstrou que a família de sistema do exemplo não estava disponível; o diagnóstico de fontes do cliente precisa continuar real. | Atualizar a identidade fictícia e regenerar os materiais públicos. |
| Converter em curvas os textos dos cinco SVGs originais do exemplo, preservando suas fontes de manutenção. | Imagens SVG isoladas não herdam as fontes carregadas no documento do Studio. | Manter um gerador opcional de contornos e a procedência das fontes; os textos do manual continuam editáveis. |

## Evidência e limites

Cada tarefa teve revisão de especificação e qualidade; problemas encontrados receberam correções e nova revisão. A prova de mockups inclui fontes SVG e PNG com proporções distintas, comparação de bordas e cantos em navegador, renderização no servidor e PDF. O exemplo público contém texto pesquisável, três aplicações fotográficas e um projeto portátil com os assets e a licença da fonte de demonstração. As quantidades medidas da versão corrente estão no [guia do exemplo](../examples/README.md); o número de páginas decorre do conteúdo.

O exemplo é fictício. Não foram distribuídos o documento privado de referência, imagens extraídas, fontes comerciais extraídas ou dados de clientes. A integração usa arquivos e perfis temporários de teste, sem instalar skills globalmente nem publicar pacotes como efeito de verificação.

A aceitação final combina typecheck, build, testes de unidade/integração, Chromium real, instalação dos dois launchers, inspeção do PDF e auditoria do pacote. O histórico Git preserva a implementação e suas correções; o ledger temporário de execução é removido somente depois da revisão final.

## Validação da entrega em 15/10/2026

Código verificado: `43d0618`. A revisão final e a revisão focada das correções terminaram sem achados abertos. O registro abaixo descreve execuções observadas, sem atribuir a um revisor testes que ele não executou.

| Verificação | Resultado |
|---|---|
| Instalação limpa `npm ci` | Aprovada antes da rodada final; dependências permaneceram iguais. |
| `npm run typecheck` e `npm run build` | Aprovados para o build web e a CLI Node. |
| `npm test` | 198 testes em 29 arquivos aprovados. |
| `CI=1 DEBUG=vite:deps npm run test:e2e` | 62 casos reais de Chrome aprovados em 57,4 segundos, com cache Vite ausente, servidor novo e sem retentativas. |
| `npm pack --dry-run --json` | 664 arquivos; recursos necessários presentes e sem caminhos privados. |
| Instalação dos dois agentes | Launchers reais em raízes temporárias, com espaços e diretório de execução externo; revisão canônica compartilhada e limite de symlinks conferidos. |
| Materiais públicos | Zero ocorrência do nome excluído; 11 hashes de assets corretos no portátil; PDF pesquisável de 46 páginas, todas com 1920 × 1080 pontos. |
| Inspeção visual | Todas as páginas renderizadas, aplicações ampliadas e visualizador PDF nativo do Chrome conferidos no aplicativo real. |

A primeira rodada completa encontrou duas falhas de teste e a revisão demonstrou uma inconsistência de asset local. Foram corrigidas sem alterar a geometria do renderer ou os materiais de exemplo: URLs locais passaram a selecionar snapshots imutáveis, a prova de aplicação passou a conferir a superfície SVG visível e a dependência do harness passou a ser preparada antes da navegação. Regressões em produção conferem pixels, bytes confirmados, portátil e identidades históricas. O guia de contribuição recebeu o procedimento de criação de cenas e presets.

Ambiente observado: macOS, Node 26.7.0, npm 11.19.0 e Chrome 154. Node 22 é o mínimo declarado e alvo do CI; esta rodada local não certifica uma execução em Node 22, Linux ou Windows. Não houve publicação npm, implantação, instalação global ou alteração de autenticação como teste.

## Correção de portabilidade após o primeiro CI

O primeiro CI em Ubuntu e Node 22 aprovou instalação, typecheck, build e os 198 testes unitários. Dois dos 62 casos de navegador falharam porque o exemplo fictício solicitava uma fonte de sistema ausente. O preflight identificou corretamente o problema. A correção `4619c68` inclui Libre Baskerville pelo caminho normal de assets e usa Inter no corpo, sem alterar o schema, a geometria, o histórico ou a detecção de fontes ausentes do cliente.

O arquivo da fonte e sua licença completa acompanham o projeto portátil, com origem oficial e hashes em `fixtures/aurora/font-provenance.json`. Os cinco SVGs do exemplo usam contornos reproduzíveis a partir das fontes abertas; o gerador Python é uma ferramenta opcional de manutenção, sem dependência no aplicativo. Títulos, rodapés e demais textos do manual permanecem nós editáveis.

O candidato corrigido passou localmente em typecheck, build, 198 testes unitários e 68 casos Chromium. As regressões conferem as faces carregadas em 400/700 antes da medição, os bytes da fonte e da licença depois de reabrir o ZIP e a independência tipográfica das cinco imagens SVG. O resultado Linux da versão final é registrado no CI do PR, sem inferi-lo da execução macOS.
