import type { MockupNode } from '../core/project';

export interface MockupPreset {
  id: string;
  version: 1;
  name: string;
  scene: string;
  composition: string;
  material: string;
  camera: string;
  surface: string;
  template: MockupNode['template'];
  identity: 'artwork-or-logo' | 'artwork-and-logo' | 'logo' | 'artwork';
  application: 'planar' | 'finished-image';
  guidance: string;
  builtinSceneId?: string;
}

/** The twelve approved photographic directions in docs/proposals/mockups-marquio.md. */
export const MOCKUP_PRESETS: readonly MockupPreset[] = [
  {
    id: 'pocket-card', version: 1, name: 'Cartão junto ao bolso', template: 'card', identity: 'artwork-or-logo', application: 'planar',
    scene: 'close-up of an adult hand holding a business card beside the pocket of a charcoal tailored garment',
    composition: 'crop the body at torso level; card in the upper-right middle of the frame, enough clean card area for the client artwork; no face',
    material: 'thick uncoated paper with subtle edge detail, matte dark textile',
    camera: 'close-up, shallow depth of field, three-quarter view', surface: 'the front of the business card',
    guidance: 'Exige máscara de oclusão se os dedos cobrirem a área impressa.',
  },
  {
    id: 'open-binder', version: 1, name: 'Pasta de apresentação aberta', template: 'stationery', identity: 'artwork-and-logo', application: 'planar',
    scene: 'an open premium document presentation binder on a dark wood tabletop, a clean letter sheet held by metallic rings on the right',
    composition: 'binder fills most of the frame diagonally; left inside cover visible; letter surface fully readable',
    material: 'charcoal textured cover, light paper and brushed metal rings',
    camera: 'elevated three-quarter view with a modest perspective', surface: 'the letter sheet',
    guidance: 'Envie papel timbrado e logo. Uma superfície por aplicação; não inventar textos institucionais.',
  },
  {
    id: 'card-stack', version: 1, name: 'Pilha de cartões na mesa', template: 'card', identity: 'artwork-or-logo', application: 'planar', builtinSceneId: 'card-stack-photo',
    scene: 'a neatly stacked set of thick business cards on a dark wooden table, with one card standing beside the stack',
    composition: 'small centered subject with generous surrounding negative space; show top card and standing card',
    material: 'dense matte paper, realistic cut edges, subtle grain', camera: 'low three-quarter tabletop view', surface: 'one selected business-card face',
    guidance: 'Escolha frente ou verso. Cada plano recebe sua própria arte e quatro cantos.',
  },
  {
    id: 'presentation-box', version: 1, name: 'Caixa de apresentação nas mãos', template: 'packaging', identity: 'logo', application: 'planar',
    scene: 'an adult wearing a dark jacket holding a premium rigid rectangular presentation box in both hands',
    composition: 'cropped torso and hands, no face; the lid is the main readable surface; subject against a dark studio background',
    material: 'matte wrapped rigid board with subtle embossed texture', camera: 'close three-quarter view', surface: 'the box lid',
    guidance: 'Envie o logo. Tampa e laterais permanecem em planos separados; padrão é opcional.',
  },
  {
    id: 'tshirt-jacket', version: 1, name: 'Camiseta com jaqueta', template: 'custom', identity: 'artwork-or-logo', application: 'finished-image',
    scene: 'an adult model wearing a neutral light t-shirt under an open charcoal jacket',
    composition: 'crop above the mouth and below the waist, emphasize the chest print area; relaxed pose with one hand holding the jacket',
    material: 'premium cotton jersey, matte dark outerwear', camera: 'portrait-oriented medium torso view composed inside a landscape image', surface: 'the t-shirt chest print area',
    guidance: 'Prompt e imagem final. Dobras e tecido exigem geração ou edição e revisão; sem deformação paramétrica.',
  },
  {
    id: 'embroidered-cap', version: 1, name: 'Boné bordado', template: 'custom', identity: 'logo', application: 'finished-image',
    scene: 'an adult wearing a dark baseball cap with head tilted downward, front panel visible and clean',
    composition: 'upper torso only; face mostly obscured by the visor; cap is the focal point',
    material: 'black cotton twill, visible seam construction, blank embroidery area', camera: 'close portrait crop with soft overhead side light', surface: 'the cap front panel embroidery area',
    guidance: 'Prompt e imagem final. Uma imagem colada não simula bordado; revise textura, relevo e costuras.',
  },
  {
    id: 'raised-phone', version: 1, name: 'Celular erguido com ícone', template: 'screen', identity: 'artwork-or-logo', application: 'planar',
    scene: 'a hand holding a smartphone upright against a dark studio background, screen facing the viewer',
    composition: 'forearm enters from bottom-left; phone centered slightly right; no face',
    material: 'glass screen with restrained reflections, neutral metal frame', camera: 'close-up with near-front screen perspective', surface: 'the smartphone screen',
    guidance: 'Tela separada da moldura; preserve proporções e área de segurança do ícone ou layout.',
  },
  {
    id: 'portrait-badge', version: 1, name: 'Retrato com crachá', template: 'custom', identity: 'artwork', application: 'planar',
    scene: 'an adult brand representative holding a vertical identification badge at chest level against a deep charcoal background',
    composition: 'upper-body portrait, badge clearly visible; professional and approachable expression',
    material: 'matte badge holder, realistic lanyard and neutral clothing', camera: 'studio medium portrait', surface: 'the vertical identification badge',
    guidance: 'Envie arte do crachá. Retrato autorizado é opcional; sem ele, use pessoa sintética genérica. Nomes e cargos só quando fornecidos.',
  },
  {
    id: 'side-phone', version: 1, name: 'Celular ao lado do corpo', template: 'screen', identity: 'artwork', application: 'planar',
    scene: 'a cropped adult hand holding a smartphone down beside a dark-clothed leg',
    composition: 'torso outside the frame; screen angled toward the camera; strong negative space on the left',
    material: 'glass and dark fabric with realistic creases', camera: 'close-up, three-quarter phone view', surface: 'the smartphone screen',
    guidance: 'Envie uma peça real de comunicação do cliente.',
  },
  {
    id: 'tablet', version: 1, name: 'Tablet em uso', template: 'screen', identity: 'artwork', application: 'planar',
    scene: 'an adult using a landscape tablet with keyboard and stylus in a dark studio setting',
    composition: 'tablet occupies most of the frame diagonally; hand with stylus enters from right, avoid covering the key screen content',
    material: 'dark metal device, glass screen, minimal reflections', camera: 'close elevated three-quarter view', surface: 'the tablet screen',
    guidance: 'Envie layout, apresentação ou composição editorial aprovada.',
  },
  {
    id: 'laptop', version: 1, name: 'Notebook na mesa', template: 'screen', identity: 'artwork', application: 'planar', builtinSceneId: 'laptop-photo',
    scene: 'an open premium laptop on a dark wood table, screen facing the camera with a clean display area',
    composition: 'laptop centered diagonally, keyboard visible, ample shadow around the device',
    material: 'dark metal, glass and subtle wood texture', camera: 'close elevated three-quarter view', surface: 'the laptop display',
    guidance: 'Envie website, banner ou peça real do cliente.',
  },
  {
    id: 'framed-poster', version: 1, name: 'Pôster em moldura', template: 'poster', identity: 'artwork', application: 'planar', builtinSceneId: 'poster-photo',
    scene: 'a tall framed poster mounted on a charcoal wall in a dim interior',
    composition: 'frame fills most of the height, near-frontal perspective; spotlight creates a soft gradient across the wall',
    material: 'matte black frame, paper behind low-reflection glass', camera: 'eye-level, slight three-quarter angle, no distracting room objects', surface: 'the framed poster paper',
    guidance: 'Envie arte vertical. Luz e moldura só são camadas separadas quando houver assets próprios.',
  },
];

export function getMockupPreset(id: string): MockupPreset {
  const preset = MOCKUP_PRESETS.find(item => item.id === id);
  if (!preset) throw new Error(`Preset de mockup não encontrado: ${id}`);
  return preset;
}
