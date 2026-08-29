/**
 * Render pipeline.
 *
 * Satori turns the element tree into SVG. Resvg turns the SVG into PNG. Both
 * run on WebAssembly, so both need a one time init that we memoise at module
 * scope. On Workers that init survives for the life of the isolate, which
 * means only the first request on a cold isolate pays for it.
 */

import satori, { init as initSatori } from 'satori/wasm';
import initYoga from 'yoga-wasm-web';
import { Resvg, initWasm as initResvg } from '@resvg/resvg-wasm';

import { buildTree } from './templates.js';

let runtime = null;

/**
 * @param {object} assets
 * @param {WebAssembly.Module|BufferSource} assets.yogaWasm
 * @param {WebAssembly.Module|BufferSource} assets.resvgWasm
 * @param {Array<{name: string, data: ArrayBuffer, weight: number, style: string}>} assets.fonts
 */
export function initRuntime(assets) {
  if (runtime) return runtime;
  runtime = (async () => {
    const yoga = await initYoga(assets.yogaWasm);
    initSatori(yoga);
    await initResvg(assets.resvgWasm);
    return { fonts: assets.fonts };
  })().catch((err) => {
    // A failed init must not poison every later request.
    runtime = null;
    throw err;
  });
  return runtime;
}

export async function renderSvg(spec) {
  if (!runtime) throw new Error('render runtime not initialised');
  const { fonts } = await runtime;
  return satori(buildTree(spec), {
    width: spec.width,
    height: spec.height,
    fonts,
  });
}

/**
 * Natural height of a card's content, ignoring the fixed canvas height.
 *
 * Used by the tests to prove no template overflows its own card. A clipped
 * footer is invisible to a size floor check but obvious to a reader, so this
 * is the gate that catches it.
 */
export async function measureHeight(spec) {
  if (!runtime) throw new Error('render runtime not initialised');
  const { fonts } = await runtime;
  const svg = await satori(buildTree({ ...spec, measure: true }), {
    width: spec.width,
    fonts,
  });
  const m = svg.match(/height="([\d.]+)"/);
  return m ? parseFloat(m[1]) : null;
}

export async function renderPng(spec) {
  const svg = await renderSvg(spec);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: spec.width * spec.scale },
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

export async function render(spec) {
  if (spec.format === 'svg') {
    const svg = await renderSvg(spec);
    return { body: svg, contentType: 'image/svg+xml; charset=utf-8' };
  }
  const png = await renderPng(spec);
  return { body: png, contentType: 'image/png' };
}
