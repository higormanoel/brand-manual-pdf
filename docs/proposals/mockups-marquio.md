# Catálogo proposto de mockups do Marquio

Estado: especificação de cenas para revisão. Os prompts abaixo ainda não constituem integração de geração nem imagens prontas.

## Contrato comum

Cada preset recebe `brandName`, `logoAsset`, `artworkAsset`, `palette`, `material`, `aspectRatio`, `sceneVariant` e, se houver, `portraitAsset`. Nunca completar nomes, números de desempenho, certificações ou depoimentos como fatos.

Cada resultado registra: preset e versão, prompt resolvido, assets utilizados, provedor/modelo quando aplicável, data, imagem base, imagem aplicada e revisão do designer. A geração usa somente os arquivos explicitamente selecionados para a cena.

Variáveis nos prompts são substituídas com dados fornecidos. Sem arte ou logo exigidos, oferecer upload, preparar rascunho autorizado ou pular a aplicação. Não enviar tokens de placeholder ao gerador como se fossem conteúdo final.

## Prompt-base de direção de arte

```text
Create an original premium brand presentation photograph for a visual identity system.
Scene: {{scene}}.
Composition: {{composition}}.
Material: {{material}}.
Camera: {{camera}}.
Lighting: controlled low-key studio photography, deep charcoal surroundings,
soft directional key light, readable material detail, restrained contrast,
natural shadows and a cinematic editorial finish.
Palette in the scene: neutral black, charcoal and restrained warm neutrals.
Required output aspect ratio: {{aspectRatio}}.
Leave the designated application surface clean and unobstructed.
No branding, no invented lettering, no watermark, no additional logos.
Produce a new scene; do not reproduce a specific person's identity or an existing photograph.
```

## Prompt-base para aplicação guiada por imagem

```text
Use the supplied scene image as the composition reference and the supplied artwork
as the exact identity to apply to {{surface}}. Preserve the artwork's proportions,
layout, spelling and colors. Integrate it with the surface perspective, material,
lighting and shadows. Do not invent another logo or rewrite the design.
Keep the remaining scene consistent. Return one finished presentation image.
```

O prompt de aplicação é uma alternativa para geradores com entrada de imagem. Não garante fidelidade geométrica ou textual. Preferir composição determinística de SVG/PNG sobre a fotografia em superfícies planas. Aplicação em tecido ou bordado depende de máscara/material específicos e revisão visual.

## Cenas fotográficas

### 01. Cartão junto ao bolso

- Referência de composição: página 44.
- `scene`: close-up of an adult hand holding a business card beside the pocket of a charcoal tailored garment.
- `composition`: crop the body at torso level; card in the upper-right middle of the frame, enough clean card area for the client artwork; no face.
- `material`: thick uncoated paper with subtle edge detail, matte dark textile.
- `camera`: close-up, shallow depth of field, three-quarter view.
- Superfície: frente do cartão; arquivo exigido: arte de cartão ou logo.
- Acabamento: projeção em quatro cantos e máscara de oclusão dos dedos.

### 02. Pasta de apresentação aberta

- Referência de composição: página 45.
- `scene`: an open premium document presentation binder on a dark wood tabletop, a clean letter sheet held by metallic rings on the right.
- `composition`: binder fills most of the frame diagonally; left inside cover visible; letter surface fully readable.
- `material`: charcoal textured cover, light paper and brushed metal rings.
- `camera`: elevated three-quarter view with a modest perspective.
- Superfícies: folha e interior opcional; arquivos exigidos: papel timbrado, logo.
- Acabamento: arte da folha aplicada sem inventar textos institucionais.

### 03. Pilha de cartões na mesa

- Referência de composição: página 46.
- `scene`: a neatly stacked set of thick business cards on a dark wooden table, with one card standing beside the stack.
- `composition`: small centered subject with generous surrounding negative space; show top card and standing card.
- `material`: dense matte paper, realistic cut edges, subtle grain.
- `camera`: low three-quarter tabletop view.
- Superfícies: frente e verso; arquivo exigido: artes do cartão ou logo para uma composição simples autorizada.

### 04. Caixa de apresentação nas mãos

- Referência de composição: página 47.
- `scene`: an adult wearing a dark jacket holding a premium rigid rectangular presentation box in both hands.
- `composition`: cropped torso and hands, no face; the lid is the main readable surface; subject against a dark studio background.
- `material`: matte wrapped rigid board with subtle embossed texture.
- `camera`: close three-quarter view.
- Superfície: tampa; arquivos exigidos: logo e arte/padrão opcional.
- Acabamento: manter tampa e laterais em planos separados.

### 05. Camiseta com jaqueta

- Referência de composição: página 48.
- `scene`: an adult model wearing a neutral light t-shirt under an open charcoal jacket.
- `composition`: crop above the mouth and below the waist, emphasize the chest print area; relaxed pose with one hand holding the jacket.
- `material`: premium cotton jersey, matte dark outerwear.
- `camera`: portrait-oriented medium torso view composed inside a landscape image.
- Superfície: peito; arquivo exigido: logo ou arte de estampa.
- Acabamento: preservar dobras e tecido; aplicação fotográfica requer deformação, máscara e revisão. Não usar rosto real da referência.

### 06. Boné bordado

- Referência de composição: página 49.
- `scene`: an adult wearing a dark baseball cap with head tilted downward, front panel visible and clean.
- `composition`: upper torso only; face mostly obscured by the visor; cap is the focal point.
- `material`: black cotton twill, visible seam construction, blank embroidery area.
- `camera`: close portrait crop with soft overhead side light.
- Superfície: painel frontal; arquivo exigido: logo adequado a bordado.
- Acabamento: não apresentar uma simples imagem colada como simulação real de bordado.

### 07. Celular erguido com ícone

- Referência de composição: página 50.
- `scene`: a hand holding a smartphone upright against a dark studio background, screen facing the viewer.
- `composition`: forearm enters from bottom-left; phone centered slightly right; no face.
- `material`: glass screen with restrained reflections, neutral metal frame.
- `camera`: close-up with near-front screen perspective.
- Superfície: tela; arquivo exigido: logo, ícone ou layout de aplicativo.
- Acabamento: tela separada da moldura; preservar proporções de tela e área de segurança.

### 08. Retrato com crachá

- Referência de composição: páginas 51–52.
- `scene`: an adult brand representative holding a vertical identification badge at chest level against a deep charcoal background.
- `composition`: upper-body portrait, badge clearly visible; professional and approachable expression.
- `material`: matte badge holder, realistic lanyard and neutral clothing.
- `camera`: studio medium portrait.
- Superfícies: crachá e lanyard opcional; arquivos exigidos: arte do crachá e, se desejado, retrato autorizado.
- Sem retrato: oferecer pessoa sintética genérica ou omitir. Não reaproveitar identidades do PDF. Nomes/cargos só entram quando fornecidos.

### 09. Celular ao lado do corpo

- Referência de composição: página 53.
- `scene`: a cropped adult hand holding a smartphone down beside a dark-clothed leg.
- `composition`: torso outside the frame; screen angled toward the camera; strong negative space on the left.
- `material`: glass and dark fabric with realistic creases.
- `camera`: close-up, three-quarter phone view.
- Superfície: tela; arquivo exigido: peça de comunicação do cliente.

### 10. Tablet em uso

- Referência de composição: página 60.
- `scene`: an adult using a landscape tablet with keyboard and stylus in a dark studio setting.
- `composition`: tablet occupies most of the frame diagonally; hand with stylus enters from right, avoid covering the key screen content.
- `material`: dark metal device, glass screen, minimal reflections.
- `camera`: close elevated three-quarter view.
- Superfície: tela; arquivo exigido: layout, apresentação ou composição editorial do cliente.

### 11. Notebook na mesa

- Referência de composição: página 61.
- `scene`: an open premium laptop on a dark wood table, screen facing the camera with a clean display area.
- `composition`: laptop centered diagonally, keyboard visible, ample shadow around the device.
- `material`: dark metal, glass and subtle wood texture.
- `camera`: close elevated three-quarter view.
- Superfície: tela; arquivo exigido: website, banner ou peça real do cliente.

### 12. Pôster em moldura

- Referência de composição: páginas 42 e 62.
- `scene`: a tall framed poster mounted on a charcoal wall in a dim interior.
- `composition`: frame fills most of the height, near-frontal perspective; spotlight creates a soft gradient across the wall.
- `material`: matte black frame, paper behind low-reflection glass.
- `camera`: eye-level, slight three-quarter angle, no distracting room objects.
- Superfície: pôster; arquivo exigido: arte vertical do cliente.
- Acabamento: arte aplicada em plano próprio; luz e moldura em camadas separadas.

## Suporte proposto na primeira versão

O catálogo descreve o resultado desejado e não significa que já existam fotografias-base distribuíveis. Toda cena depende de uma base própria/licenciada enviada pelo designer ou produzida por um gerador disponível. A interface mostra essa dependência antes de iniciar.

| Cenas | Aplicação prevista na primeira versão | O que permanece editável |
|---|---|---|
| 01 Cartão junto ao bolso | Composição planar; exige máscara quando dedos cobrem a área impressa | Arte, quatro cantos, recorte e máscara, além da posição da imagem no manual |
| 02 Pasta, 03 cartões, 04 caixa | Composição planar, uma superfície por aplicação | Arte, perspectiva e máscara por plano |
| 05 Camiseta, 06 boné | Prompt pronto e geração/importação de imagem final; sem renderizador paramétrico de tecido ou bordado | Imagem final substituível, recorte, tamanho, posição e camadas do manual |
| 07 Celular, 09 celular, 10 tablet, 11 notebook | Composição planar da tela | Layout da tela, perspectiva, recorte e máscara |
| 08 Crachá | Composição planar do crachá sobre retrato próprio ou sintético; exige máscara se houver oclusão | Arte do crachá e aplicação; retrato é uma imagem substituível |
| 12 Pôster | Composição planar da arte | Arte, perspectiva e camada de luz/moldura quando fornecida separadamente |

Nas composições planares, permitir marcar quatro cantos manualmente quando a cena importada não tiver metadados de superfície. Não prometer decompor uma fotografia ou imagem gerada automaticamente em camadas de luz, tecido e máscara.

## Composições gráficas editáveis

Essas aplicações não precisam de geração fotográfica. Usar objetos do editor, layouts próprios e peças enviadas pelo designer.

| Preset | Referência de composição | Dados necessários | Resultado |
|---|---|---|---|
| Feed com seis peças | 36, 54–56 | Seis peças ou peças repetíveis aprovadas | Grade 3 × 2, espaçamento e raio editáveis |
| Stories | 37, 57 | Quatro ou seis peças verticais | Colunas com recorte e ordem editáveis |
| Perfil social | 38, 58 | Avatar, capa, nome e bio opcionais | Cartões de apresentação social genéricos, sem métricas falsas |
| Ícone de aplicativo | 23, 59 | Símbolo/logo e fundo | Ícone, variantes e visualização em interface genérica |
| Banner tipográfico | 39–41 | Mensagem aprovada, fontes e grafismos | Texto e elementos vivos no editor |
| Variações de logo | 15–20 | Logos fornecidos e paleta | Fundos e tamanhos editáveis, contraste verificável |

Não reproduzir interfaces de terceiros como prova de uma publicação real, nem preencher automaticamente avaliações, seguidores ou notas de aplicativo. Se uma interface demonstrativa exigir números, tratá-los como exemplo fictício explícito ou removê-los.

## Aceitação de cada cena

- O objeto e o enquadramento correspondem ao preset escolhido.
- O logo mantém proporção, grafia, cores e área de segurança.
- A arte está legível e segue perspectiva e oclusões da superfície.
- Não aparecem marcas concorrentes, letras inventadas ou pessoas extraídas da referência.
- A imagem tem resolução adequada ao tamanho de uso, sem ampliação silenciosa.
- O designer consegue substituir a cena, trocar a arte e ajustar a aplicação nas superfícies suportadas.
- O arquivo do projeto guarda assets e parâmetros suficientes para reabrir o resultado.
