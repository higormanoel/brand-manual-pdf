# Aurora — marca fictícia

Aurora é uma torrefação e café de bairro inteiramente fictícios, criados
exclusivamente para demonstrar o Marquio. O projeto não representa uma pessoa,
cliente ou instituição real.

`project.json` contém o briefing, conteúdo aprovado das seções, dados da marca e
manifesto de assets. A lista de páginas começa vazia: a paginação é resultado da
geração editorial, e não uma quantidade de páginas imposta por esta fixture.

Os textos, símbolo de amanhecer, assinaturas, trama de horizontes e paisagem
abstrata foram criados originalmente para esta demonstração e estão sob CC0.
Os SVGs estão em `assets/`; o manifesto registra o SHA-256 de seus bytes.
A paisagem é uma ilustração, não uma fotografia de uma origem real.

A marca usa Libre Baskerville nos títulos e Inter nos textos. O TTF variável
original de Libre Baskerville acompanha o manifesto como `asset-font-display`,
com pesos 400 e 700 carregados pelo caminho normal de fontes do projeto. Inter
acompanha o aplicativo via `@fontsource/inter`, inclusive os pesos 400 e 700;
não depende de instalação no sistema. As fontes editoriais continuam
independentes e configuradas como Inter.

As duas famílias usam SIL Open Font License 1.1, não CC0. Os avisos completos
estão em `public/licenses/LibreBaskerville-OFL.txt` e
`public/licenses/Inter-OFL.txt`. A origem fixada, os hashes e o arquivo Inter
usado nas artes estão em [font-provenance.json](font-provenance.json).
O TTF de Libre Baskerville é distribuído sem modificações. Uma cópia integral
do OFL está em `assets/LibreBaskerville-OFL.txt` no manifesto, para que o ZIP
portátil leve a licença junto com a fonte.

As duas assinaturas SVG e as três artes em `public/demo-artwork/` têm o texto
convertido em contornos das mesmas fontes abertas. Imagens SVG isoladas não
herdam as fontes do documento; os contornos evitam substituições silenciosas.
A composição, posições, dimensões, cores e símbolo original são preservados.
O texto-fonte em SVG permanece no elemento `metadata`, com as famílias abertas,
para edição e reconstrução por `fixtures/aurora/outline-artwork.py`. Essa ferramenta
opcional requer Python 3.10+, `fonttools[woff]==4.63.0` e `uharfbuzz==0.52.0`,
instalados em um ambiente virtual, além de `npm ci` para obter Inter. O uso normal
do Studio/CLI não requer Python, HarfBuzz ou download de fontes.
Os textos do manual, incluindo espécimes, títulos e rodapés, continuam sendo
nós editáveis; os contornos pertencem apenas às ilustrações importadas.

Os caminhos do manifesto são relativos à pasta desta fixture. Ao importá-la, o
armazenamento deve copiar os assets para o pacote do projeto e manter os IDs.
As aprovações e as regras presentes neste exemplo são escolhas criativas da
marca fictícia. Elas não devem ser reaplicadas automaticamente a novos projetos.
