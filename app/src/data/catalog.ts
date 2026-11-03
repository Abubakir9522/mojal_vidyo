import { api, absoluteUrl } from '../store/api';
import { TEMPLATES, Template, CATEGORIES } from './templates';
import { EFFECTS, EffectDef, FxCat } from '../engine/effects';
import { TRANSITIONS, TransitionDef } from '../engine/transitions';
import { SCENES, SceneDef } from '../engine/scene3d';
import { DANCES, MOTIONS } from '../engine/motion';

const base = () => document.baseURI;
export const thumbUrl = (kind: 'fx' | 'tr' | 'scene' | 'tpl', id: string) => new URL(`thumbs/${kind}/${id}.webp`, base()).href;

/** Built-in templates merged with those added from the admin panel, minus what the admin has hidden. */
export function allTemplates(): Template[] {
  const c = api.catalog;
  const hidden = new Set(c.hidden.templates);
  const remote = c.templates.map(t => ({ ...t, remote: true, thumb: t.thumb ? absoluteUrl(t.thumb) : undefined }));
  const featured = new Set(c.featured);
  const list = [...remote, ...TEMPLATES].filter(t => !hidden.has(t.id));
  return c.featured.length ? list.map(t => ({ ...t, featured: featured.has(t.id) })) : list;
}
/** Templates from the admin panel may have no picture yet, so they borrow their 3D scene's or first effect's. */
export function templateThumb(t: Template) {
  if (t.thumb) return t.thumb;
  if (!t.remote) return thumbUrl('tpl', t.id);
  if (t.intro) return thumbUrl('scene', t.intro.scene);
  const fx = t.effects.flat()[0];
  return fx ? thumbUrl('fx', fx) : thumbUrl('tr', t.transitions[0] ?? 't_fade');
}
export const allEffects = (cat?: FxCat): EffectDef[] => { const h = new Set(api.catalog.hidden.effects); return EFFECTS.filter(e => !h.has(e.id) && (!cat || e.cat === cat)); };
export const allTransitions = (): TransitionDef[] => { const h = new Set(api.catalog.hidden.transitions); return TRANSITIONS.filter(e => !h.has(e.id)); };
export const allScenes = (): SceneDef[] => { const h = new Set(api.catalog.hidden.scenes); return SCENES.filter(e => !h.has(e.id)); };

/** Totals for the screens and the admin panel. Counted from the real lists, never typed by hand. */
export const COUNTS = { templates: TEMPLATES.length, effects: EFFECTS.length, transitions: TRANSITIONS.length, scenes: SCENES.length, motions: MOTIONS.length - 1, dances: DANCES.length, categories: CATEGORIES.length };
