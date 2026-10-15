#!/usr/bin/env python3
"""Rebuild only Aurora's five imported SVG illustrations from embedded text sources.

Optional maintenance tooling: Python 3.10+, fonttools[woff]==4.63.0,
uharfbuzz==0.52.0. Install in an isolated venv, then run from any directory.
The application, CLI and export do not run this script or require Python.
Font files are read unmodified; only glyph outlines are written to the SVGs.
"""
from io import BytesIO
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
TARGETS = [
    'fixtures/aurora/assets/logo.svg',
    'fixtures/aurora/assets/logo-reversed.svg',
    'public/demo-artwork/aurora-card.svg',
    'public/demo-artwork/aurora-poster.svg',
    'public/demo-artwork/aurora-screen.svg',
]
FONT_PATHS = {
    'Libre Baskerville': ROOT / 'fixtures/aurora/assets/LibreBaskerville-Variable.ttf',
    'Inter': ROOT / 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
}
TEXT_STYLE = {'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor'}


def load_font(path):
    font = TTFont(path)
    # HarfBuzz reads sfnt, not WOFF2. Decode only in memory, without rewriting input.
    font.flavor = None
    stream = BytesIO()
    font.save(stream)
    face = hb.Face(stream.getvalue())
    shaper = hb.Font(face)
    shaper.scale = (face.upem, face.upem)
    location = {'wght': 400} if 'fvar' in font else None
    if location:
        shaper.set_variations(location)
    return font.getGlyphSet(location=location), font.getGlyphOrder(), shaper, face.upem


def outline(text, style, fonts):
    family = style['font-family'].split(',')[0]
    glyphs, names, shaper, upem = fonts[family]
    size = float(style['font-size'])
    scale = size / upem
    spacing = float(style.get('letter-spacing', '0'))
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    # CSS letter spacing disables discretionary/common ligatures for this copy.
    hb.shape(shaper, buffer, {'liga': False, 'clig': False} if spacing else {})
    positions = buffer.glyph_positions
    infos = buffer.glyph_infos
    clusters = sorted(set(info.cluster for info in infos))
    width = sum(p.x_advance for p in positions) * scale + len(clusters) * spacing
    anchor = {'start': 0, 'middle': .5, 'end': 1}[style.get('text-anchor', 'start')]
    x = float(style['x']) - width * anchor
    y = float(style['y'])
    pen = SVGPathPen(glyphs, ntos=lambda value: f'{value:.4f}'.rstrip('0').rstrip('.') if value else '0')
    last_cluster = None
    for info, position in zip(infos, positions):
        if info.codepoint == 0:
            raise ValueError(f'Missing glyph in {family}: {text!r}')
        if last_cluster is not None and info.cluster != last_cluster:
            x += spacing
        glyphs[names[info.codepoint]].draw(TransformPen(pen, (
            scale, 0, 0, -scale,
            x + position.x_offset * scale, y - position.y_offset * scale,
        )))
        x += position.x_advance * scale
        last_cluster = info.cluster
    return pen.getCommands()


def rebuild(relative, fonts):
    path = ROOT / relative
    current = ET.fromstring(path.read_text())
    metadata = current.find(f'{{{NS}}}metadata[@id="marquio-text-source"]')
    source = json.loads(metadata.text)['sourceSvg'] if metadata is not None else path.read_text()
    # The source remains readable/editable inside metadata for future regeneration.
    source = source.replace('Georgia,serif', 'Libre Baskerville,serif').replace('Arial,sans-serif', 'Inter,sans-serif')
    svg = ET.fromstring(source)
    count = 0

    def visit(parent, inherited):
        nonlocal count
        style = {**inherited, **parent.attrib}
        for index, child in enumerate(list(parent)):
            if child.tag != f'{{{NS}}}text':
                visit(child, style)
                continue
            resolved = {**style, **child.attrib}
            text = ''.join(child.itertext())
            attrs = {key: value for key, value in child.attrib.items() if key not in TEXT_STYLE | {'x', 'y'}}
            group = ET.Element(f'{{{NS}}}g', {**attrs, 'aria-label': text})
            ET.SubElement(group, f'{{{NS}}}path', {'d': outline(text, resolved, fonts)})
            group.tail = child.tail
            parent.remove(child)
            parent.insert(index, group)
            count += 1
        for key in TEXT_STYLE:
            parent.attrib.pop(key, None)

    visit(svg, {})
    metadata = ET.Element(f'{{{NS}}}metadata', {'id': 'marquio-text-source'})
    metadata.text = json.dumps({'generator': 'fixtures/aurora/outline-artwork.py', 'sourceSvg': source}, ensure_ascii=False)
    svg.insert(0, metadata)
    path.write_text(ET.tostring(svg, encoding='unicode') + '\n')
    print(f'{relative}: {count} text runs outlined')


if __name__ == '__main__':
    fonts = {family: load_font(path) for family, path in FONT_PATHS.items()}
    for relative in TARGETS:
        rebuild(relative, fonts)
