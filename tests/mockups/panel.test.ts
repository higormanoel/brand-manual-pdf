import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { createProject } from '../../src/core/project';
import { MockupsPanel } from '../../src/studio/panels/MockupsPanel';

const props = { project: createProject('Projeto sem imagens'), resolveAsset: () => undefined, onInsert: () => {}, onImportAsset: async () => { throw new Error('Not invoked during render'); } };

it('renders provider-free prompt preparation with every preset and explicit missing upload actions', () => {
  const html = renderToStaticMarkup(createElement(MockupsPanel, props));
  expect(html).toContain('Pilha de cartões na mesa');
  expect(html).toContain('Retrato com crachá');
  expect(html).toContain('Boné bordado');
  expect(html).toContain('Nenhum provedor configurado');
  expect(html).toContain('Usar cena incluída');
  expect(html).toContain('Arte completa da aplicação');
  expect(html).toContain('Envie ou selecione a cena base');
  expect(html).not.toContain('Imagem gerada com sucesso');
});

it('renders a ready blank-scene prompt without requiring an identity or an account', () => {
  const html = renderToStaticMarkup(createElement(MockupsPanel, { ...props, initialMode: 'scene' }));
  expect(html).toContain('Prompt preparado');
  expect(html).toContain('Copiar prompt');
  expect(html).toContain('Baixar pedido');
  expect(html).toContain('No branding, no invented lettering');
});

it('renders cloth as a finished image workflow with no planar application approval control', () => {
  const html = renderToStaticMarkup(createElement(MockupsPanel, { ...props, initialPresetId: 'embroidered-cap' }));
  expect(html).toContain('Importar imagem final');
  expect(html).toContain('sem aplicação planar');
  expect(html).not.toContain('Aprovar e inserir aplicação');
});
