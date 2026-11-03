// Converts the bundled TTF to the JSON outline format the 3D text uses, once at build time, so the app needs no network at runtime.
import opentype from 'opentype.js';
import fs from 'node:fs';
const src = 'node_modules/@expo-google-fonts/montserrat/900Black/Montserrat_900Black.ttf';
const buf = fs.readFileSync(src);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
const r = Math.round;
const keep = cp => (cp >= 0x20 && cp <= 0x24f) || (cp >= 0x2b0 && cp <= 0x2ff) || (cp >= 0x400 && cp <= 0x4ff) || (cp >= 0x2010 && cp <= 0x2044) || cp === 0x20ac;
const glyphs = {};
for (const key of Object.keys(font.encoding.cmap.glyphIndexMap)) {
  const cp = +key;
  if (!keep(cp)) continue;
  const g = font.glyphs.get(font.encoding.cmap.glyphIndexMap[key]);
  let o = '';
  for (const c of g.path.commands) {
    const t = c.type.toLowerCase() === 'c' ? 'b' : c.type.toLowerCase();
    o += t + ' ';
    if (c.x !== undefined) o += r(c.x * scale) + ' ' + r(c.y * scale) + ' ';
    if (c.x1 !== undefined) o += r(c.x1 * scale) + ' ' + r(c.y1 * scale) + ' ';
    if (c.x2 !== undefined) o += r(c.x2 * scale) + ' ' + r(c.y2 * scale) + ' ';
  }
  glyphs[String.fromCodePoint(cp)] = { ha: r(g.advanceWidth * scale), x_min: r((g.xMin ?? 0) * scale), x_max: r((g.xMax ?? 0) * scale), o };
}
const json = { glyphs, familyName: 'Montserrat Black', ascender: r(font.ascender * scale), descender: r(font.descender * scale), underlinePosition: font.tables.post.underlinePosition, underlineThickness: font.tables.post.underlineThickness, boundingBox: { xMin: font.tables.head.xMin, xMax: font.tables.head.xMax, yMin: font.tables.head.yMin, yMax: font.tables.head.yMax }, resolution: 1000 };
fs.writeFileSync('public/fonts/montserrat-black.typeface.json', JSON.stringify(json));
console.log('glyphs', Object.keys(glyphs).length, 'bytes', fs.statSync('public/fonts/montserrat-black.typeface.json').size);
