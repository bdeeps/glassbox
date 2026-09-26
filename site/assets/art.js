// Line-art illustrations for history events, shared by every box. Each is drawn
// on a 64×64 grid with currentColor strokes and an accent (var(--c)) fill, so it
// sits in any era's colour. Add new ones here; history.json refers to them by name.
const A = {
  obscura: '<rect x="18" y="18" width="38" height="28" rx="2"/><path d="M4 16l4 8M8 24l-4 8M6 16v16" class="a"/><path d="M8 20l10 12M8 28l10-8" stroke-dasharray="2 2"/><circle cx="18" cy="32" r="1.5" class="f"/><path d="M52 24v14M48 38h8" class="a"/>',
  eclipse: '<circle cx="32" cy="20" r="10"/><circle cx="37" cy="17" r="9" class="f" opacity=".35"/><path d="M8 40h48"/><path d="M16 50a5 5 0 0 0 8 0M30 52a5 5 0 0 0 8 0M44 50a5 5 0 0 0 8 0" class="a"/>',
  candles: '<path d="M10 40V26M18 40V30M26 40V24"/><path d="M10 22c-2-3 2-5 0-8 3 2 3 6 0 8zM18 26c-2-3 2-5 0-8 3 2 3 6 0 8zM26 20c-2-3 2-5 0-8 3 2 3 6 0 8z" class="a"/><rect x="36" y="16" width="24" height="32" rx="2"/><path d="M46 38c2 3-2 5 0 8-3-2-3-6 0-8z" class="a"/><path d="M52 36c2 3-2 5 0 8-3-2-3-6 0-8z" class="a"/>',
  eye: '<path d="M6 32c8-12 44-12 52 0-8 12-44 12-52 0z"/><circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="3" class="f"/>',
  lens: '<path d="M32 10c8 8 8 36 0 44-8-8-8-36 0-44z"/><path d="M4 22l28 10M4 42l28-10M32 32l28-10M32 32l28 10" class="a" stroke-dasharray="3 2"/>',
  aperture: '<circle cx="32" cy="32" r="22"/><path d="M32 10l6 16M54 32l-16 6M32 54l-6-16M10 32l16-6M47 17l-12 12M47 47l-12-12M17 47l12-12M17 17l12 12"/><circle cx="32" cy="32" r="6" class="f"/>',
  reflex: '<rect x="8" y="24" width="48" height="26" rx="3"/><path d="M22 24l6-10h8l6 10"/><path d="M22 46l16-18" class="a"/><circle cx="32" cy="37" r="7"/>',
  flask: '<path d="M26 8h12M28 8v14L14 50a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 22V8"/><path d="M18 44h28l4 8H14z" class="f" opacity=".5"/>',
  leaf: '<path d="M14 52C12 30 26 12 52 10c2 26-16 42-38 42z"/><path d="M14 52L40 24M26 40h-8M32 34v-8M38 28h8" class="a"/>',
  plate: '<rect x="10" y="12" width="44" height="40" rx="2"/><path d="M14 44l10-12 8 8 6-6 12 10" class="a"/><circle cx="44" cy="22" r="4" class="f"/>',
  window: '<rect x="14" y="8" width="36" height="48" rx="2"/><path d="M14 24h36M14 40h36M26 8v48M38 8v48" class="a"/>',
  person: '<path d="M4 50h56M10 50V28h10v22M44 50V30h12v20"/><circle cx="32" cy="24" r="5" class="f"/><path d="M32 29v12l-5 9M32 41l5 9M26 34l6-3 6 3"/>',
  daguerreotype: '<rect x="12" y="10" width="40" height="44" rx="4"/><rect x="18" y="16" width="28" height="32" rx="12" class="a"/><circle cx="32" cy="28" r="5"/><path d="M24 44c2-6 14-6 16 0"/>',
  selfie: '<rect x="8" y="22" width="22" height="18" rx="2"/><circle cx="19" cy="31" r="5"/><circle cx="46" cy="22" r="6" class="f"/><path d="M46 28v14l-6 10M46 42l6 10M38 34h16"/><path d="M30 31h6" class="a" stroke-dasharray="2 2"/>',
  word: '<path d="M10 44l8-24 8 24M13 36h10M34 20v24M34 20h8a6 6 0 0 1 0 12h-8M48 20l6 24" /><path d="M8 52h48" class="a"/>',
  colour: '<circle cx="24" cy="26" r="13" class="f" opacity=".45"/><circle cx="40" cy="26" r="13"/><circle cx="32" cy="40" r="13" class="a"/>',
  studio: '<path d="M8 54h48M14 54l6-30 6 30M20 24h10v-6H18v6"/><circle cx="46" cy="30" r="6" class="f"/><path d="M46 36v18M40 44h12"/>',
  horse: '<rect x="4" y="16" width="16" height="32" rx="1"/><rect x="24" y="16" width="16" height="32" rx="1"/><rect x="44" y="16" width="16" height="32" rx="1"/><path d="M7 34h10l-2 6M9 34l-2 6M27 32h10l2 6M29 32l-3 6M47 36h10l3 4M49 36l-4 4" class="a"/>',
  boxcamera: '<rect x="12" y="16" width="40" height="34" rx="3"/><circle cx="32" cy="34" r="9"/><circle cx="32" cy="34" r="3" class="f"/><rect x="42" y="20" width="6" height="4" class="a"/><path d="M20 16v-4h10v4"/>',
  rangefinder: '<rect x="6" y="20" width="52" height="28" rx="4"/><circle cx="32" cy="36" r="9"/><circle cx="32" cy="36" r="4" class="f"/><rect x="10" y="24" width="8" height="5" class="a"/><rect x="46" y="24" width="8" height="5" class="a"/><path d="M14 20v-4h8v4"/>',
  flash: '<path d="M36 6L18 36h12l-4 22 20-32H34z" class="f" opacity=".6"/><path d="M36 6L18 36h12l-4 22 20-32H34z"/>',
  instant: '<rect x="14" y="8" width="36" height="46" rx="2"/><rect x="18" y="12" width="28" height="28" class="a"/><circle cx="32" cy="26" r="6" class="f"/>',
  pixels: '<path d="M10 10h44v44H10z"/><path d="M10 21h44M10 32h44M10 43h44M21 10v44M32 10v44M43 10v44" class="a"/><rect x="21" y="21" width="11" height="11" class="f"/><rect x="32" y="32" width="11" height="11" class="f"/>',
  earth: '<circle cx="32" cy="36" r="16"/><path d="M20 30c6 2 8-4 14-2s6 8 12 6M18 42c6-2 10 2 16 0" class="a"/><path d="M4 56c18-10 38-10 56 0" class="f" opacity=".3"/><path d="M4 56c18-10 38-10 56 0"/>',
  chip: '<rect x="16" y="16" width="32" height="32" rx="2"/><path d="M22 10v6M32 10v6M42 10v6M22 48v6M32 48v6M42 48v6M10 22h6M10 32h6M10 42h6M48 22h6M48 32h6M48 42h6"/><rect x="24" y="24" width="16" height="16" class="f" opacity=".6"/>',
  digital: '<rect x="8" y="18" width="48" height="30" rx="4"/><circle cx="24" cy="33" r="8"/><rect x="38" y="26" width="12" height="14" rx="1" class="f" opacity=".6"/><path d="M40 18v-4h8v4"/>',
  focus: '<path d="M10 22V10h12M42 10h12v12M54 42v12H42M22 54H10V42"/><circle cx="32" cy="32" r="8" class="a"/><circle cx="32" cy="32" r="2" class="f"/>',
  phone: '<rect x="18" y="6" width="28" height="52" rx="5"/><circle cx="26" cy="14" r="3" class="f"/><path d="M24 50h16" class="a"/>',
  film: '<rect x="8" y="16" width="48" height="32" rx="1"/><path d="M8 22h48M8 42h48" class="a"/><path d="M12 18v2M18 18v2M24 18v2M30 18v2M36 18v2M42 18v2M48 18v2M12 44v2M18 44v2M24 44v2M30 44v2M36 44v2M42 44v2M48 44v2"/><path d="M26 22v20M40 22v20"/>',
  night: '<path d="M40 10a18 18 0 1 0 14 30A16 16 0 0 1 40 10z" class="f" opacity=".5"/><path d="M40 10a18 18 0 1 0 14 30A16 16 0 0 1 40 10z"/><path d="M12 12v4M10 14h4M50 52v4M48 54h4" class="a"/>',
  blackhole: '<ellipse cx="32" cy="32" rx="26" ry="10" class="a"/><circle cx="32" cy="32" r="12" class="f" opacity=".25"/><circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="6" fill="#000"/>',
  telescope: '<path d="M8 38l34-18 6 10-34 18z"/><path d="M42 20l6-3 6 10-6 3" class="a"/><path d="M24 44l-8 14M28 42l8 16"/><circle cx="52" cy="10" r="2" class="f"/>',
};

export const ART_NAMES = Object.keys(A);

export function art(name, size = 64, cls = 'art-svg') {
  const body = A[name] || A.obscura;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// A standalone SVG (colours resolved, no CSS needed) for drawing onto a canvas.
export function artSvg(name, { ink = '#eef0f6', accent = '#8ef0ff', size = 512, width = 2 } = {}) {
  const body = (A[name] || A.obscura)
    .replace(/class="a"/g, `stroke="${accent}"`)
    .replace(/class="f"/g, `fill="${accent}" stroke="${accent}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
