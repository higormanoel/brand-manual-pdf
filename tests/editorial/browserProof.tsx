import { createRoot } from 'react-dom/client';
import { Artboard } from '../../src/render/Artboard';
import { waitForArtboardReady } from '../../src/render/textMeasurement';
import type { BrandProject, Page } from '../../src/core/project';

/** Test-only mounting through the production renderer, without changing the
 * application entry or introducing a production proof route. */
export async function renderManualProof(project: BrandProject, pages: Page[]) {
  const target = document.createElement('div');
  target.id = 'editorial-contact-sheet';
  target.style.width = 'max-content';
  document.body.replaceChildren(target);
  Object.assign(document.body.style, { margin: '0', background: '#767676' });
  const root = createRoot(target);
  root.render(<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 480px)', gap: 16, padding: 16 }}>
    {pages.map(page => <div key={page.id} style={{ width: 480, height: 270, position: 'relative', overflow: 'hidden' }}>
      <div style={{ transform: 'scale(.25)', transformOrigin: '0 0' }}>
        <Artboard page={page} assets={project.assets} resolveAsset={asset => `/fixtures/aurora/${asset.path}`} mode="editor" />
      </div>
    </div>)}
  </div>);
  // React commits asynchronously; the sentinel belongs to the real artboard.
  while (!target.querySelector('[data-artboard-id]')) await new Promise(requestAnimationFrame);
  await waitForArtboardReady(target);
}
