// Writes the list of built-in content for the server, from a browser build of the real catalog.
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(process.env.BASE ?? 'http://127.0.0.1:5199/');
await p.waitForFunction(() => window.__t);
const seed = await p.evaluate(async () => {
  const { EFFECTS, TRANSITIONS, SCENES, MOTIONS, DANCES } = window.__t;
  const t = await import('/src/data/templates.ts');
  return {
    templates: t.TEMPLATES.map(x => ({ id: x.id, name: x.name, cat: x.cat, aspect: x.aspect, featured: !!x.featured })),
    categories: t.CATEGORIES,
    effects: EFFECTS.map(x => ({ id: x.id, name: x.name, cat: x.cat })),
    transitions: TRANSITIONS.map(x => ({ id: x.id, name: x.name, cat: x.cat })),
    scenes: SCENES.map(x => ({ id: x.id, name: x.name })),
    motions: MOTIONS.map(x => ({ id: x.id, name: x.name })),
    dances: DANCES.map(x => ({ id: x.id, name: x.name })),
    music: t.MUSIC_TRACKS.map(x => ({ id: x.id, name: x.name, mood: x.mood })),
  };
});
fs.writeFileSync('../server/seed/catalog.json', JSON.stringify(seed));
fs.rmSync('../server/public/thumbs', { recursive: true, force: true });
fs.cpSync('public/thumbs/tpl', '../server/public/thumbs', { recursive: true });
console.log(Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.length])));
await b.close();
