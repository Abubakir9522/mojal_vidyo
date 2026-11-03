import type { AspectId, Clip, Project, TextClip, TextAnim, TextLoop, AudioClip, MediaAsset } from '../engine/types';
import { newClip, newProject, newText, uid } from '../engine/types';

export const CATEGORIES = [
  { id: 'savdo', name: 'Savdo va reklama' }, { id: 'tugilgan', name: "Tug'ilgan kun" }, { id: 'toy', name: "To'y va oila" },
  { id: 'bayram', name: 'Bayramlar' }, { id: 'sayohat', name: 'Sayohat' }, { id: 'sport', name: 'Sport' },
  { id: 'vlog', name: 'Vlog va kundalik' }, { id: 'kino', name: 'Kino uslubi' }, { id: 'ritm', name: 'Ritmli montaj' },
  { id: 'raqs', name: "Musiqaga o'ynash" }, { id: 'slayd', name: 'Rasmlar slaydi' }, { id: 'neon', name: 'Neon va glitch' }, { id: 'intro', name: '3D intro va logotip' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface TplText { text: string; at?: number; dur?: number; y?: number; size?: number; font?: string; color?: string; gradient?: string[]; stroke?: string; strokeWidth?: number; bg?: string; anim?: TextAnim; out?: TextAnim; loop?: TextLoop; weight?: number; x?: number }

export interface Template {
  id: string; name: string; cat: CategoryId | string;
  aspect: AspectId; slots: number;
  /** Seconds each media slot stays on screen; the pattern repeats. */
  rhythm: number[];
  effects: string[][];
  transitions: string[];
  motions: string[];
  transitionLen?: number;
  intro?: { scene: string; text?: string; sub?: string; colors?: string[]; dur?: number };
  outro?: { scene: string; text?: string; sub?: string; colors?: string[]; dur?: number };
  texts: TplText[];
  /** Text repeated once per slot, for captions that follow the cuts. */
  captions?: string[];
  captionStyle?: Partial<TplText>;
  music?: string;
  background?: string;
  /** Marks a template that came from the admin panel. */
  remote?: boolean;
  /** Pictures move to the song's beats, and cuts land on them. */
  dance?: { style: string; step: number; amount?: number; flash?: boolean; viz?: 'bars' | 'mirror' | 'circle' | 'line' | 'dots' };
  thumb?: string;
  featured?: boolean;
}

const white = '#ffffff', gold = '#ffc53d', pink = '#ff5fa2', teal = '#39d6c6', violet = '#8a6cff', red = '#ff3b4e', orange = '#ff7a1a', ink = '#14122b';

type Row = Omit<Template, 'cat' | 'aspect' | 'transitions' | 'motions' | 'effects' | 'texts'> & { aspect?: AspectId; fx?: string[][]; tr?: string[]; mo?: string[]; texts?: TplText[] };

const R = (cat: CategoryId, defaults: Partial<Row>, rows: Row[]): Template[] => rows.map(r => ({
  ...r, cat, aspect: r.aspect ?? defaults.aspect ?? '9:16',
  effects: r.fx ?? defaults.fx ?? [[]], transitions: r.tr ?? defaults.tr ?? ['t_fade'], motions: r.mo ?? defaults.mo ?? ['zoomIn', 'zoomOut'],
  texts: r.texts ?? [], music: r.music ?? defaults.music, transitionLen: r.transitionLen ?? defaults.transitionLen,
} as Template));

const title = (text: string, o: Partial<TplText> = {}): TplText => ({ text, at: 0.2, dur: 2.6, y: 0.5, size: 8, anim: 'pop', ...o });
const low = (text: string, o: Partial<TplText> = {}): TplText => ({ text, at: 0.3, y: 0.85, size: 4.4, anim: 'slideUp', ...o });

const SAVDO = R('savdo', { music: 'kuch', tr: ['t_slideL', 't_whipL', 't_zoomIn'], mo: ['zoomIn', 'panLeft', 'zoomInFast'], transitionLen: 0.35 }, [
  { id: 'sv_chegirma', name: 'Katta chegirma', slots: 4, rhythm: [1.6], intro: { scene: 'coins', text: 'CHEGIRMA', sub: '50% gacha' }, fx: [['f_vivid']], texts: [low("Faqat shu hafta!", { bg: red })], outro: { scene: 'logoSpin', text: "DO'KONGA KELING", sub: 'Manzil va telefon' }, featured: true },
  { id: 'sv_yangi', name: 'Yangi mahsulot', slots: 3, rhythm: [2.2], intro: { scene: 'podium', text: 'YANGI MAHSULOT', sub: 'Faqat bizda' }, fx: [['f_clean']], tr: ['t_flipY', 't_cubeL'], captions: ['Sifatli', 'Hamyonbop', 'Kafolatli'], captionStyle: { y: 0.82, font: 'Russo One', color: gold } },
  { id: 'sv_raqam', name: 'Chiroyli raqamlar', slots: 3, rhythm: [2], intro: { scene: 'phone', text: 'CHIROYLI RAQAMLAR', sub: "Mo'jal do'konida" }, fx: [['f_cyber']], captions: ['90 000 XX XX', '91 777 XX XX', '99 555 XX XX'], captionStyle: { y: 0.5, size: 8, font: 'Oswald', color: white, bg: '#111a3acc' }, outro: { scene: 'textFly', text: "DO'KONIMIZ", sub: 'Ishonchli xizmat' }, featured: true },
  { id: 'sv_tarif', name: 'Yangi tarif', slots: 3, rhythm: [2.4], fx: [['f_rishton']], tr: ['t_diag', 't_doors'], texts: [title('YANGI TARIF', { color: teal, font: 'Oswald' }), low("Ko'proq internet, kamroq to'lov", { at: 2.6, dur: 4 })] },
  { id: 'sv_aksiya', name: 'Aksiya 1+1', slots: 4, rhythm: [1.2, 1.2, 1.8], fx: [['l_flare'], ['f_pop']], tr: ['t_flash', 't_glitch'], texts: [title('1 + 1', { size: 16, font: 'Russo One', color: gold, loop: 'pulse', dur: 4 }), low('Bittasini olsangiz, ikkinchisi sovg\'a', { at: 2 })] },
  { id: 'sv_ochilish', name: "Do'kon ochilishi", slots: 4, rhythm: [2], intro: { scene: 'confetti', text: 'OCHILDIK!', sub: 'Yangi manzilda' }, fx: [['f_summer']], tr: ['t_circle', 't_star'], texts: [low('Barchani kutib qolamiz', { bg: ink, at: 1 })] },
  { id: 'sv_narx', name: 'Narx tushdi', slots: 2, rhythm: [3], fx: [['f_vivid']], tr: ['t_whipU'], texts: [title('NARX TUSHDI', { color: red, stroke: white, strokeWidth: 0.06, font: 'Russo One', anim: 'bounce' }), low('Shoshiling, soni cheklangan!', { at: 3, dur: 2.5 })] },
  { id: 'sv_taom', name: 'Oshxona reklamasi', slots: 4, rhythm: [1.8], fx: [['f_food']], mo: ['zoomIn', 'panRight'], tr: ['t_fade', 't_wipeL'], captions: ['Mazali', 'Issiq', 'Arzon', 'Tez yetkazamiz'], captionStyle: { font: 'Lobster', size: 7, y: 0.8 } },
  { id: 'sv_kiyim', name: 'Kiyim kolleksiyasi', slots: 5, rhythm: [1.4], fx: [['f_portrait']], tr: ['t_slideU', 't_stack'], texts: [title('YANGI KOLLEKSIYA', { font: 'Playfair Display', size: 6, y: 0.12, dur: 6, anim: 'fade' })] },
  { id: 'sv_xizmat', name: 'Xizmat reklamasi', slots: 3, rhythm: [2.6], fx: [['f_clean']], tr: ['t_wipeR'], intro: { scene: 'shapes', text: 'XIZMATLAR', sub: 'Tez va sifatli' }, captions: ['Tajribali ustalar', 'Kafolat', 'Bepul maslahat'], captionStyle: { y: 0.85, bg: '#000000aa', size: 4.6 } },
  { id: 'sv_premium', name: 'Premium brend', slots: 3, rhythm: [2.8], intro: { scene: 'crystal', text: 'PREMIUM', sub: 'Sifat kafolati' }, fx: [['f_silver']], tr: ['t_fade'], mo: ['tiltLeft', 'tiltRight'] },
  { id: 'sv_hikoya', name: 'Mijoz fikri', slots: 3, rhythm: [3], aspect: '4:5', fx: [['f_portrait']], tr: ['t_cloud'], texts: [{ text: '"Eng yaxshi xizmat!"', at: 0.5, dur: 5, y: 0.82, font: 'Playfair Display', size: 5, anim: 'type' }] },
  { id: 'sv_16x9', name: 'YouTube reklama', slots: 4, rhythm: [2.5], aspect: '16:9', intro: { scene: 'textFly', text: 'REKLAMA', sub: 'Bizni tanlang' }, fx: [['f_teal']], tr: ['t_slideL'] },
  { id: 'sv_kv', name: 'Instagram post', slots: 3, rhythm: [2], aspect: '1:1', fx: [['f_clean']], tr: ['t_tiles'], texts: [title('BUGUN', { color: gold, size: 12, y: 0.3 }), low('Maxsus taklif', { y: 0.7, size: 6, at: 0.8 })] },
]);

const TUGILGAN = R('tugilgan', { music: 'quvnoq', tr: ['t_star', 't_heart', 't_circle'], mo: ['zoomIn', 'pulse', 'rotateIn'] }, [
  { id: 'tk_tabrik', name: 'Tabriklaymiz', slots: 4, rhythm: [2], intro: { scene: 'confetti' }, fx: [['n_confetti']], texts: [low("Baxtli bo'ling!", { font: 'Pacifico', size: 6 })], featured: true },
  { id: 'tk_sharlar', name: 'Sharlar bayrami', slots: 4, rhythm: [2], intro: { scene: 'balloons', text: "TUG'ILGAN KUN", sub: 'Muborak bo\'lsin' }, fx: [['l_bokeh']] },
  { id: 'tk_bolalar', name: 'Bolalar bayrami', slots: 5, rhythm: [1.6], fx: [['f_spring'], ['l_sparkle']], tr: ['t_heart', 't_star'], texts: [title("Kichkintoyimiz 5 yoshda!", { font: 'Comfortaa', color: gold, y: 0.15, size: 6, dur: 5 })] },
  { id: 'tk_ona', name: 'Onamga tabrik', slots: 4, rhythm: [2.4], fx: [['f_rose'], ['n_petals']], tr: ['t_fade'], mo: ['zoomIn'], texts: [{ text: 'Azizam onajonim', at: 0.3, dur: 4, y: 0.82, font: 'Pacifico', size: 6, anim: 'fade' }] },
  { id: 'tk_dada', name: 'Dadamga tabrik', slots: 3, rhythm: [2.6], fx: [['f_film']], tr: ['t_cloud'], texts: [{ text: 'Eng kuchli dadam', at: 0.3, dur: 4, y: 0.85, font: 'Oswald', size: 6, anim: 'slideUp' }] },
  { id: 'tk_dost', name: "Do'stimga", slots: 5, rhythm: [1.2], fx: [['f_pop'], ['m_beat']], tr: ['t_glitch', 't_zoomIn'], texts: [title("TABRIK, DO'STIM!", { font: 'Russo One', color: teal, loop: 'shake', dur: 3 })] },
  { id: 'tk_sevgi', name: 'Sevimli insonim', slots: 4, rhythm: [2.2], fx: [['f_rose']], tr: ['t_heart'], mo: ['zoomOut'], texts: [{ text: "Seni sevaman", at: 0.5, dur: 4, y: 0.5, font: 'Lobster', size: 9, color: pink, anim: 'zoom', loop: 'pulse' }] },
  { id: 'tk_xotira', name: 'Yillar xotirasi', slots: 6, rhythm: [1.5], intro: { scene: 'cubePhotos' }, fx: [['r_polaroid']], tr: ['t_page'], mo: ['slowRotate'] },
  { id: 'tk_kv', name: 'Tabrik post', slots: 3, rhythm: [2], aspect: '1:1', fx: [['l_sparkle']], tr: ['t_diamond'], texts: [title('MUBORAK!', { color: gold, font: 'Lobster', size: 14 })] },
]);

const TOY = R('toy', { music: 'sokin', tr: ['t_fade', 't_cloud', 't_light'], mo: ['zoomIn', 'zoomOut', 'panLeft'], transitionLen: 0.9 }, [
  { id: 'ty_nikoh', name: "Nikoh to'yi", slots: 6, rhythm: [3], intro: { scene: 'logoSpin', text: "TO'Y OQSHOMI", sub: 'Baxtli kun', colors: ['#1a0d1f', '#ffc53d', '#ff5fa2'] }, fx: [['f_film'], ['l_leak']], featured: true },
  { id: 'ty_kelin', name: 'Kelin kuyov', slots: 5, rhythm: [2.8], fx: [['f_skin'], ['l_bokeh']], tr: ['t_heart', 't_fade'], texts: [{ text: 'Baxtli bo\'linglar', at: 0.6, dur: 5, y: 0.82, font: 'Pacifico', size: 6.4, color: gold, anim: 'fade' }] },
  { id: 'ty_taklif', name: "To'yga taklifnoma", slots: 3, rhythm: [3], fx: [['f_gold']], tr: ['t_page'], texts: [{ text: 'Sizni aziz mehmon\nsifatida kutamiz', at: 0.5, dur: 6, y: 0.5, font: 'Playfair Display', size: 5.4, color: white, bg: '#00000088', anim: 'fade' }] },
  { id: 'ty_fotiha', name: 'Fotiha oqshomi', slots: 4, rhythm: [3], fx: [['f_rose']], texts: [low('Fotiha muborak', { font: 'Lobster', size: 6.4, anim: 'fade' })] },
  { id: 'ty_oila', name: 'Oilaviy xotira', slots: 6, rhythm: [2.4], fx: [['f_film'], ['r_grain']], mo: ['slowRotate', 'zoomOut'], intro: { scene: 'carousel', text: 'Oilam' } },
  { id: 'ty_chaqaloq', name: 'Chaqaloq xotirasi', slots: 5, rhythm: [2.4], fx: [['f_mint'], ['n_bubbles']], tr: ['t_circle'], texts: [{ text: 'Bizning quvonchimiz', at: 0.4, dur: 5, y: 0.14, font: 'Comfortaa', size: 4.6, anim: 'fade' }] },
  { id: 'ty_romantik', name: 'Romantik kecha', slots: 4, rhythm: [3], fx: [['f_shom'], ['l_leak']], mo: ['zoomIn'], texts: [{ text: 'Abadiy muhabbat', at: 1, dur: 5, y: 0.8, font: 'Playfair Display', size: 5.4, anim: 'letters' }] },
  { id: 'ty_keng', name: "To'y kinosi", slots: 5, rhythm: [3.2], aspect: '16:9', intro: { scene: 'galleryWall' }, fx: [['f_teal']] },
  { id: 'ty_yubiley', name: 'Yubiley', slots: 6, rhythm: [2.2], fx: [['f_gold']], intro: { scene: 'stackCards' }, texts: [low('Yillar davomida birga', { font: 'Playfair Display', at: 0.5, dur: 5 })] },
]);

const BAYRAM = R('bayram', { music: 'bayram', tr: ['t_fade', 't_ikat', 't_diamond'], mo: ['zoomIn', 'panUp'] }, [
  { id: 'by_navruz', name: "Navro'z", slots: 4, rhythm: [2.4], fx: [['f_spring'], ['n_petals']], intro: { scene: 'shapes', text: "NAVRO'Z", sub: 'Muborak bo\'lsin', colors: ['#0e2a1a', '#7ee081', '#ffc53d'] }, featured: true },
  { id: 'by_mustaqillik', name: 'Mustaqillik kuni', slots: 4, rhythm: [2.4], fx: [['f_vivid']], intro: { scene: 'textFly', text: "O'ZBEKISTON", sub: 'Mustaqillik kuni muborak', colors: ['#06233f', '#1fb5e8', '#7ee081'] }, tr: ['t_slideL'] },
  { id: 'by_ramazon', name: 'Ramazon hayiti', slots: 4, rhythm: [2.6], fx: [['f_gold'], ['l_sparkle']], intro: { scene: 'logoSpin', text: 'HAYIT MUBORAK', sub: 'Ramazon hayiti', colors: ['#071f24', '#ffc53d', '#39d6c6'] } },
  { id: 'by_qurbon', name: 'Qurbon hayiti', slots: 4, rhythm: [2.6], fx: [['f_registon']], texts: [{ text: 'Qurbon hayiti muborak', at: 0.4, dur: 5, y: 0.82, font: 'Playfair Display', size: 5, anim: 'fade', color: gold }] },
  { id: 'by_yangiyil', name: 'Yangi yil', slots: 4, rhythm: [2.2], fx: [['f_winter'], ['n_snow']], tr: ['t_star'], intro: { scene: 'galaxy', text: 'YANGI YIL', colors: ['#03081f', '#ffffff', '#6fc8ff'] } },
  { id: 'by_8mart', name: '8-mart', slots: 4, rhythm: [2.2], fx: [['f_rose'], ['n_petals']], tr: ['t_heart'], texts: [{ text: '8-mart muborak!', at: 0.4, dur: 5, y: 0.84, font: 'Lobster', size: 7, color: pink, anim: 'pop' }] },
  { id: 'by_ustozlar', name: "O'qituvchilar kuni", slots: 3, rhythm: [2.8], fx: [['f_clean']], texts: [{ text: 'Rahmat, ustozlar!', at: 0.4, dur: 4, y: 0.84, font: 'Oswald', size: 6.4, anim: 'slideUp' }] },
  { id: 'by_xotira', name: '9-may Xotira kuni', slots: 4, rhythm: [3], fx: [['f_bwsoft']], tr: ['t_cloud'], texts: [{ text: 'Xotira va qadrlash kuni', at: 0.6, dur: 6, y: 0.82, font: 'Playfair Display', size: 4.8, anim: 'fade' }] },
  { id: 'by_bolalar', name: 'Bolalar kuni', slots: 5, rhythm: [1.6], fx: [['f_pop'], ['n_confetti']], tr: ['t_circle', 't_star'], intro: { scene: 'balloons', text: '1-IYUN', sub: 'Bolalar kuni' } },
  { id: 'by_bitiruv', name: 'Bitiruv kechasi', slots: 5, rhythm: [2], fx: [['f_film']], intro: { scene: 'stackCards' }, texts: [low("So'nggi qo'ng'iroq", { font: 'Lobster', size: 6, at: 0.5, dur: 4 })] },
]);

const SAYOHAT = R('sayohat', { music: 'ufq', tr: ['t_slideL', 't_whipL', 't_light'], mo: ['panLeft', 'panRight', 'zoomIn', 'diagonal'] }, [
  { id: 'sa_toglar', name: 'Tog\' sayohati', slots: 5, rhythm: [2.2], intro: { scene: 'waves', text: 'SAYOHAT', sub: 'Chimyon' }, fx: [['f_chimyon']], featured: true },
  { id: 'sa_samarqand', name: 'Samarqand', slots: 5, rhythm: [2.4], fx: [['f_registon'], ['l_rays']], texts: [{ text: 'SAMARQAND', at: 0.3, dur: 4, y: 0.5, font: 'Russo One', size: 9, color: gold, anim: 'zoom' }] },
  { id: 'sa_buxoro', name: 'Buxoro', slots: 5, rhythm: [2.4], fx: [['f_buxoro']], texts: [{ text: 'Buxoroyi sharif', at: 0.3, dur: 4, y: 0.84, font: 'Playfair Display', size: 6, anim: 'slideUp' }] },
  { id: 'sa_xiva', name: 'Xiva', slots: 5, rhythm: [2.4], fx: [['f_xiva']], tr: ['t_doors'], texts: [{ text: 'Ichan Qal\'a', at: 0.3, dur: 4, y: 0.84, font: 'Oswald', size: 6, anim: 'fade' }] },
  { id: 'sa_vodiy', name: "Farg'ona vodiysi", slots: 5, rhythm: [2.2], fx: [['f_margilon']], tr: ['t_ikat'], texts: [{ text: "Farg'ona vodiysi", at: 0.3, dur: 4, y: 0.14, font: 'Lobster', size: 7, anim: 'slideDown', color: white }], featured: true },
  { id: 'sa_dengiz', name: "Dengiz bo'yi", slots: 4, rhythm: [2.6], fx: [['f_summer'], ['l_leak']], intro: { scene: 'waves', text: 'DENGIZ', sub: 'Dam olish vaqti' } },
  { id: 'sa_yol', name: "Yo'l hikoyasi", slots: 6, rhythm: [1.6], fx: [['f_film']], tr: ['t_whipL', 't_whipU'], texts: [low('1000 km ortda', { font: 'Oswald', at: 0.5, dur: 3 })] },
  { id: 'sa_keng', name: 'Keng kadrlar', slots: 5, rhythm: [3], aspect: '16:9', fx: [['f_teal']], tr: ['t_fade'], mo: ['panRight'], intro: { scene: 'globe', text: 'DUNYO BO\'YLAB', sub: '' } },
  { id: 'sa_dron', name: 'Dron kadrlar', slots: 4, rhythm: [3], fx: [['f_chorvoq']], mo: ['tiltUp', 'zoomOut'], tr: ['t_zoomIn'] },
  { id: 'sa_kuz', name: 'Kuzgi yo\'l', slots: 4, rhythm: [2.4], fx: [['f_autumn'], ['l_rays']], tr: ['t_wind'] },
]);

const SPORT = R('sport', { music: 'kuch', tr: ['t_zoomIn', 't_whipL', 't_glitch', 't_shake'], mo: ['zoomInFast', 'drop', 'handheld'], transitionLen: 0.25 }, [
  { id: 'sp_futbol', name: 'Futbol lahzalari', slots: 6, rhythm: [1.0, 1.0, 1.6], fx: [['f_teal'], ['m_zoomblur']], intro: { scene: 'textFly', text: 'GOL!', sub: 'Eng yaxshi lahzalar' }, featured: true },
  { id: 'sp_mashq', name: 'Mashg\'ulot', slots: 6, rhythm: [0.9], fx: [['f_noir'], ['m_beat']], texts: [title("TO'XTAMA", { font: 'Russo One', size: 11, dur: 2 })] },
  { id: 'sp_kurash', name: 'Kurash', slots: 5, rhythm: [1.2], fx: [['f_xiva'], ['g_rgb']], texts: [title('KURASH', { font: 'Russo One', color: gold, size: 12, dur: 2 })] },
  { id: 'sp_boks', name: 'Boks', slots: 6, rhythm: [0.8], fx: [['m_shake'], ['f_noir']], tr: ['t_flash'], texts: [title('NOKAUT', { font: 'Russo One', color: red, size: 13, anim: 'zoom', dur: 1.6 })] },
  { id: 'sp_avto', name: 'Avto poyga', slots: 6, rhythm: [1], fx: [['f_cyber'], ['m_hblur']], tr: ['t_whipL'], intro: { scene: 'ringTunnel', text: 'TEZLIK', colors: ['#050510', '#ff7a1a', '#ffc53d'] } },
  { id: 'sp_yugurish', name: 'Yugurish', slots: 5, rhythm: [1.1], fx: [['f_orange']], tr: ['t_wipeL'], captions: ['Birinchi qadam', 'Davom et', 'Marra yaqin'], captionStyle: { font: 'Oswald', y: 0.84 } },
  { id: 'sp_jamoa', name: 'Jamoa ruhi', slots: 6, rhythm: [1.3], fx: [['f_vivid'], ['l_flare']], texts: [title('BIZ BIRGAMIZ', { color: teal, font: 'Russo One', size: 8 })] },
  { id: 'sp_keng', name: 'Sport obzor', slots: 6, rhythm: [1.4], aspect: '16:9', fx: [['f_teal']], tr: ['t_slideL', 't_zoomIn'], intro: { scene: 'pillars', text: 'OBZOR' } },
]);

const VLOG = R('vlog', { music: 'yengil', tr: ['t_fade', 't_slideL'], mo: ['handheld', 'zoomIn'] }, [
  { id: 'vl_kun', name: 'Bir kunim', slots: 6, rhythm: [1.8], fx: [['f_clean']], texts: [title('Bir kunim', { font: 'Caveat', size: 12, y: 0.15, dur: 3 })], featured: true },
  { id: 'vl_ertalab', name: 'Ertalab', slots: 4, rhythm: [2.2], fx: [['f_tong'], ['l_leak']], captions: ['07:00', 'Nonushta', 'Ishga', 'Boshladik'], captionStyle: { font: 'Caveat', size: 8, y: 0.85 } },
  { id: 'vl_oshpaz', name: 'Oshpazlik', slots: 5, rhythm: [1.8], fx: [['f_food']], captions: ['Masalliq', 'Tayyorlash', 'Pishirish', 'Bezash', 'Yoqimli ishtaha!'], captionStyle: { font: 'Comfortaa', size: 4.6, y: 0.86, bg: '#00000099' } },
  { id: 'vl_ish', name: 'Ish jarayoni', slots: 5, rhythm: [1.6], fx: [['f_film']], tr: ['t_slideU'], texts: [low('Sahna ortida', { font: 'Oswald', dur: 3 })] },
  { id: 'vl_uy', name: 'Uy bezagi', slots: 4, rhythm: [2.4], fx: [['f_matte']], mo: ['panRight'], tr: ['t_wipeL'], captions: ['Oldin', 'Keyin'], captionStyle: { y: 0.1, font: 'Oswald', size: 5 } },
  { id: 'vl_motivatsiya', name: 'Motivatsiya', slots: 3, rhythm: [3], fx: [['f_noir'], ['r_grain']], tr: ['t_black'], captions: ['Har kuni', 'bir qadam', 'oldinga'], captionStyle: { font: 'Russo One', size: 8, y: 0.5, anim: 'zoom' } },
  { id: 'vl_savol', name: 'Savol javob', slots: 4, rhythm: [2.2], fx: [['f_portrait']], captions: ['Savol 1', 'Savol 2', 'Savol 3', 'Obuna bo\'ling!'], captionStyle: { y: 0.14, bg: teal, color: ink, size: 4.4 } },
  { id: 'vl_youtube', name: 'YouTube vlog', slots: 5, rhythm: [2.6], aspect: '16:9', fx: [['f_clean']], intro: { scene: 'shapes', text: 'VLOG', sub: 'Yangi qism' } },
  { id: 'vl_vaqt', name: 'Tez vaqt', slots: 6, rhythm: [1], fx: [['f_pop']], tr: ['t_slideL'], texts: [low('Bir daqiqada', { font: 'Oswald' })] },
]);

const KINO = R('kino', { music: 'kino', tr: ['t_black', 't_fade', 't_cloud'], mo: ['zoomIn', 'slowRotate', 'panLeft'], transitionLen: 0.8 }, [
  { id: 'kn_treyler', name: 'Film treyleri', slots: 5, rhythm: [2.6], aspect: '16:9', fx: [['f_teal'], ['l_vignette']], intro: { scene: 'ringTunnel', text: 'TEZ KUNDA', colors: ['#020208', '#ffc53d', '#ff7a1a'] }, captions: ['Bu hikoya', 'hech qachon', 'aytilmagan'], captionStyle: { font: 'Playfair Display', size: 7, y: 0.5, anim: 'fade' }, featured: true },
  { id: 'kn_noir', name: 'Qora kino', slots: 4, rhythm: [3], fx: [['f_noir'], ['r_grain']], texts: [{ text: 'Bir bor ekan...', at: 0.5, dur: 4, y: 0.84, font: 'Playfair Display', size: 5.4, anim: 'type' }] },
  { id: 'kn_retro', name: 'Eski kino', slots: 4, rhythm: [2.6], fx: [['r_film'], ['r_filmstrip']], tr: ['t_filmroll'] },
  { id: 'kn_8mm', name: '8 mm oilaviy', slots: 5, rhythm: [2.2], fx: [['r_8mm']], mo: ['handheld'], texts: [{ text: '1995', at: 0.3, dur: 3, y: 0.1, x: 0.85, font: 'Caveat', size: 6, anim: 'fade', color: gold }] },
  { id: 'kn_keng', name: 'Keng ekran', slots: 4, rhythm: [3.2], aspect: '16:9', fx: [['f_shom'], ['l_vignette']], tr: ['t_fade'] },
  { id: 'kn_jim', name: "Jim hikoya", slots: 3, rhythm: [3.6], fx: [['f_faded']], captions: ['Sukunat', 'Xotira', 'Umid'], captionStyle: { font: 'Playfair Display', size: 5, y: 0.5, anim: 'blur', color: white } },
  { id: 'kn_detektiv', name: 'Detektiv', slots: 4, rhythm: [2.6], fx: [['f_tun'], ['l_spot']], tr: ['t_circleOut'] },
  { id: 'kn_qora', name: 'Sarguzasht', slots: 5, rhythm: [2.2], fx: [['f_cross']], tr: ['t_whipU', 't_black'], intro: { scene: 'galaxy', text: 'SARGUZASHT' } },
]);

const RITM = R('ritm', { music: 'ritm', tr: ['t_flash', 't_zoomIn', 't_glitch', 't_rgb'], mo: ['pulse', 'zoomInFast', 'drop'], transitionLen: 0.15 }, [
  { id: 'rt_tez', name: 'Tez kesish', slots: 8, rhythm: [0.5], fx: [['m_beat']], featured: true },
  { id: 'rt_ikki', name: 'Ikki zarba', slots: 8, rhythm: [0.5, 0.5, 1], fx: [['f_pop']] },
  { id: 'rt_flash', name: 'Chaqnoq ritm', slots: 8, rhythm: [0.75], fx: [['l_flash']], tr: ['t_flash'] },
  { id: 'rt_bw', name: 'Oq qora ritm', slots: 8, rhythm: [0.5], fx: [['f_bw'], ['f_vivid']], tr: ['t_white'] },
  { id: 'rt_zoom', name: 'Zum ritm', slots: 8, rhythm: [0.6], fx: [['m_zoompulse']], tr: ['t_zoomIn', 't_zoomOut'] },
  { id: 'rt_split', name: 'Bo\'lingan ekran', slots: 8, rhythm: [0.75], fx: [['d_split4'], ['d_split9'], ['d_split2'], []], tr: ['t_flash'] },
  { id: 'rt_mirror', name: 'Oyna ritm', slots: 8, rhythm: [0.75], fx: [['d_mirrorh'], ['d_mirror4'], ['d_mirrorv'], ['d_kaleido']] },
  { id: 'rt_rang', name: 'Rang ritm', slots: 8, rhythm: [0.6], fx: [['m_strobe'], ['s_duotone'], ['s_duotone2'], ['f_pop']] },
  { id: 'rt_shake', name: 'Silkinish ritm', slots: 8, rhythm: [0.5, 1], fx: [['m_shake']], tr: ['t_shake'] },
]);

const SLAYD = R('slayd', { music: 'sokin', tr: ['t_fade', 't_slideL', 't_page'], mo: ['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'diagonal'], transitionLen: 0.7 }, [
  { id: 'sl_oddiy', name: 'Oddiy slayd', slots: 8, rhythm: [3], fx: [[]], featured: true },
  { id: 'sl_3d', name: '3D slayd', slots: 8, rhythm: [2.8], fx: [[]], mo: ['tiltLeft', 'tiltRight', 'fly3d', 'orbit3d'], tr: ['t_cubeL', 't_flipY', 't_door3d'], featured: true },
  { id: 'sl_kub', name: 'Kub slayd', slots: 6, rhythm: [2.4], fx: [[]], tr: ['t_cubeL', 't_cubeU'], mo: ['none'] },
  { id: 'sl_kitob', name: 'Fotoalbom', slots: 8, rhythm: [2.6], fx: [['r_polaroid']], tr: ['t_page'], mo: ['slowRotate'] },
  { id: 'sl_karusel', name: 'Aylanma album', slots: 8, rhythm: [2.2], intro: { scene: 'carousel', text: 'Albom', dur: 5 }, fx: [[]], tr: ['t_orbit'] },
  { id: 'sl_devor', name: 'Galereya', slots: 8, rhythm: [2.2], intro: { scene: 'galleryWall', dur: 5 }, fx: [[]], aspect: '16:9' },
  { id: 'sl_eski', name: 'Eski rasmlar', slots: 8, rhythm: [2.8], fx: [['f_sepia'], ['r_dust']], tr: ['t_cloud'] },
  { id: 'sl_akvarel', name: 'Akvarel', slots: 6, rhythm: [3], fx: [['s_watercolor']], tr: ['t_cloud'] },
  { id: 'sl_kartalar', name: 'Kartalar', slots: 6, rhythm: [2.4], intro: { scene: 'flipGrid', dur: 3.5 }, fx: [[]], tr: ['t_cards'] },
  { id: 'sl_kvadrat', name: 'Kvadrat slayd', slots: 6, rhythm: [2.4], aspect: '1:1', fx: [[]], tr: ['t_tiles', 't_blindsH'] },
]);

const NEON = R('neon', { music: 'ritm', tr: ['t_glitch', 't_rgb', 't_pixel'], mo: ['pulse', 'handheld'], transitionLen: 0.3 }, [
  { id: 'ne_kiber', name: 'Kiberpank', slots: 5, rhythm: [1.4], fx: [['g_cyber'], ['f_cyber']], texts: [title('KIBER', { font: 'Russo One', color: pink, loop: 'glow', size: 13, dur: 3 })], featured: true },
  { id: 'ne_vhs', name: 'VHS kasseta', slots: 5, rhythm: [1.8], fx: [['r_vhs']], tr: ['t_black'], texts: [{ text: 'PLAY', at: 0, dur: 3, y: 0.08, x: 0.2, font: 'Roboto Condensed', size: 4.4, anim: 'none', out: 'none' }] },
  { id: 'ne_neon', name: 'Neon chiziq', slots: 5, rhythm: [1.4], fx: [['l_neon']], tr: ['t_rgb'] },
  { id: 'ne_ufq', name: 'Neon ufq', slots: 4, rhythm: [1.8], intro: { scene: 'synthwave' }, fx: [['s_duotone2']] },
  { id: 'ne_glitch', name: 'Kuchli glitch', slots: 6, rhythm: [1], fx: [['g_block'], ['g_slice'], ['g_digital']] },
  { id: 'ne_data', name: 'Datamosh', slots: 5, rhythm: [1.4], fx: [['g_datamosh'], ['g_rgb']] },
  { id: 'ne_arcade', name: 'Oyin zali', slots: 5, rhythm: [1.2], fx: [['r_gb']], tr: ['t_pixel'], texts: [{ text: 'LEVEL UP', at: 0.2, dur: 2, y: 0.5, font: 'Russo One', size: 10, color: '#d3f26b', anim: 'bounce' }] },
  { id: 'ne_golo', name: 'Gologramma', slots: 4, rhythm: [1.8], fx: [['x_hologram']], tr: ['t_rgb'] },
  { id: 'ne_issiq', name: 'Issiqlik kamerasi', slots: 4, rhythm: [1.6], fx: [['s_thermal'], ['s_nightvis']] },
]);

const INTRO = R('intro', { music: 'kino', tr: ['t_fade'], mo: ['none'] }, [
  { id: 'in_oltin', name: 'Oltin logotip', slots: 1, rhythm: [3], intro: { scene: 'logoSpin', dur: 5 }, fx: [[]], featured: true },
  { id: 'in_harflar', name: 'Uchuvchi harflar', slots: 1, rhythm: [3], intro: { scene: 'textFly', dur: 4 }, fx: [[]] },
  { id: 'in_galaktika', name: 'Galaktika intro', slots: 1, rhythm: [3], intro: { scene: 'galaxy', dur: 5 }, fx: [[]] },
  { id: 'in_tunnel', name: 'Nurli tunnel', slots: 1, rhythm: [3], intro: { scene: 'ringTunnel', dur: 4 }, fx: [[]] },
  { id: 'in_shar', name: 'Yer shari', slots: 1, rhythm: [3], intro: { scene: 'globe', dur: 5 }, fx: [[]] },
  { id: 'in_billur', name: 'Billur intro', slots: 1, rhythm: [3], intro: { scene: 'crystal', dur: 4 }, fx: [[]] },
  { id: 'in_ustun', name: 'Musiqa intro', slots: 1, rhythm: [3], intro: { scene: 'pillars', dur: 4 }, fx: [[]] },
  { id: 'in_keng', name: 'YouTube kanal', slots: 1, rhythm: [3], aspect: '16:9', intro: { scene: 'logoSpin', text: 'KANALIM', sub: 'Obuna bo\'ling', dur: 4, colors: ['#0b1730', '#39d6c6', '#ffc53d'] }, fx: [[]] },
  { id: 'in_retro', name: 'Retro logotip', slots: 1, rhythm: [3], aspect: '16:9', intro: { scene: 'synthwave', dur: 4 }, fx: [[]] },
  { id: 'in_kub', name: 'Rasmli kub', slots: 6, rhythm: [1.2], intro: { scene: 'cubePhotos', dur: 4 }, fx: [[]], tr: ['t_cubeL'] },
  { id: 'in_telefon', name: 'Ilova reklamasi', slots: 3, rhythm: [1.8], intro: { scene: 'phone', text: 'ILOVAMIZ', sub: 'Yuklab oling', dur: 4 }, fx: [['f_clean']], tr: ['t_slideL'] },
  { id: 'in_podium', name: 'Mahsulot sahnasi', slots: 1, rhythm: [2.4], intro: { scene: 'podium', dur: 5 }, fx: [[]] },
]);

const RAQS = R('raqs', { music: 'kuch', tr: ['t_flash'], mo: ['none'], transitionLen: 0.05 }, [
  { id: 'rq_zarba', name: 'Zarbali rasmlar', slots: 8, rhythm: [0.94], dance: { style: 'sakrash', step: 2, flash: true }, featured: true },
  { id: 'rq_yurak', name: 'Yurak urishi', slots: 8, rhythm: [1.02], music: 'quvnoq', dance: { style: 'yurak', step: 2 }, fx: [['f_rose']] },
  { id: 'rq_chayqalish', name: 'Chayqaluvchi rasmlar', slots: 8, rhythm: [1.09], music: 'bayram', dance: { style: 'chayqalish', step: 2 }, fx: [['f_summer']], featured: true },
  { id: 'rq_sakrash', name: 'Sakrovchi rasmlar', slots: 8, rhythm: [1.02], music: 'quvnoq', dance: { style: 'sakrab', step: 2 }, fx: [['f_pop']] },
  { id: 'rq_3d', name: '3D raqs', slots: 8, rhythm: [0.86], music: 'ritm', dance: { style: 'burilish3d', step: 2, flash: true }, fx: [['f_cyber']], featured: true },
  { id: 'rq_3duchish', name: '3D uchish', slots: 8, rhythm: [1.88], music: 'kuch', dance: { style: 'kamera3d', step: 4, flash: true }, fx: [['l_flare']] },
  { id: 'rq_egilish', name: '3D egilish', slots: 8, rhythm: [1.25], music: 'ufq', dance: { style: 'qiyalik3d', step: 2 }, fx: [['f_chimyon']] },
  { id: 'rq_silkinish', name: 'Kuchli silkinish', slots: 8, rhythm: [0.43], music: 'ritm', dance: { style: 'silkinish', step: 1, flash: true }, fx: [['g_rgb']] },
  { id: 'rq_robot', name: 'Robot raqsi', slots: 8, rhythm: [0.86], music: 'ritm', dance: { style: 'robot', step: 2 }, fx: [['s_posterize']] },
  { id: 'rq_kozgu', name: "Ko'zgu raqsi", slots: 8, rhythm: [0.94], dance: { style: 'oyna', step: 2, flash: true }, fx: [['d_mirrorh']] },
  { id: 'rq_aylanish', name: 'Aylanuvchi rasmlar', slots: 8, rhythm: [1.88], dance: { style: 'aylanish', step: 4 }, fx: [['d_kaleido'], []] },
  { id: 'rq_zina', name: 'Yaqinlashuvchi zarba', slots: 6, rhythm: [1.88], dance: { style: 'zina', step: 4 }, fx: [['f_vivid']] },
  { id: 'rq_toy', name: "To'y raqsi", slots: 8, rhythm: [1.09], music: 'bayram', dance: { style: 'suzish', step: 2, amount: 0.7 }, fx: [['f_gold'], ['l_sparkle']] },
  { id: 'rq_bolalar', name: 'Quvnoq bolalar', slots: 8, rhythm: [1.02], music: 'quvnoq', dance: { style: 'sakrab', step: 2 }, fx: [['n_confetti']] },
  { id: 'rq_ekvalayzer', name: 'Ekvalayzerli rasmlar', slots: 8, rhythm: [0.94], dance: { style: 'sakrash', step: 2, viz: 'bars' }, fx: [['f_teal']], featured: true },
  { id: 'rq_doira', name: 'Doira ekvalayzer', slots: 6, rhythm: [1.88], music: 'ritm', dance: { style: 'bosish', step: 4, viz: 'circle' }, fx: [['l_vignette']] },
  { id: 'rq_tolqin', name: "To'lqinli musiqa", slots: 6, rhythm: [1.88], music: 'ufq', dance: { style: 'suzish', step: 4, viz: 'line' }, fx: [['f_film']] },
  { id: 'rq_nuqta', name: 'Nuqtali ekvalayzer', slots: 8, rhythm: [1.02], music: 'yengil', dance: { style: 'chayqalish', step: 2, amount: 0.7, viz: 'dots' }, fx: [['f_matte']] },
  { id: 'rq_aralash', name: 'Aralash raqs', slots: 8, rhythm: [0.94], dance: { style: 'aralash', step: 2, flash: true }, fx: [['f_vivid']], featured: true },
  { id: 'rq_keng', name: 'Keng ekran raqsi', slots: 8, rhythm: [0.94], aspect: '16:9', dance: { style: 'sakrash', step: 2, viz: 'mirror' }, fx: [['f_teal']] },
]);

export const TEMPLATES: Template[] = [...SAVDO, ...RAQS, ...TUGILGAN, ...TOY, ...BAYRAM, ...SAYOHAT, ...SPORT, ...VLOG, ...KINO, ...RITM, ...SLAYD, ...NEON, ...INTRO];

export const MUSIC_TRACKS = [
  { id: 'kuch', name: 'Kuch', mood: 'Baquvvat' }, { id: 'quvnoq', name: 'Quvnoq', mood: 'Bayramona' }, { id: 'sokin', name: 'Sokin', mood: 'Romantik' },
  { id: 'bayram', name: 'Bayram', mood: 'Tantanali' }, { id: 'ufq', name: 'Ufq', mood: 'Sayohat' }, { id: 'yengil', name: 'Yengil', mood: 'Kundalik' },
  { id: 'kino', name: 'Kino', mood: 'Dramatik' }, { id: 'ritm', name: 'Ritm', mood: 'Raqs' },
] as const;

function toTextClip(t: TplText, fallbackStart: number, fallbackDur: number): TextClip {
  return newText({
    text: t.text, start: t.at ?? fallbackStart, duration: t.dur ?? fallbackDur, y: t.y ?? 0.5, x: t.x ?? 0.5, size: t.size ?? 7,
    font: t.font ?? 'Montserrat', weight: t.weight ?? (t.font && t.font !== 'Montserrat' ? (['Oswald', 'Playfair Display', 'Comfortaa', 'Roboto Condensed', 'Caveat'].includes(t.font) ? 700 : 400) : 800),
    color: t.color ?? '#ffffff', gradient: t.gradient, stroke: t.stroke ?? '#000000', strokeWidth: t.strokeWidth ?? 0, bg: t.bg ?? '',
    animIn: t.anim ?? 'pop', animOut: t.out ?? 'fade', loop: t.loop ?? 'none',
  });
}

/**
 * Fills a template with the user's files. With fewer files than slots they repeat.
 * With no files at all it uses colour cards, so the template still previews.
 */
export function applyTemplate(tpl: Template, media: MediaAsset[], musicAssetId?: string): Project {
  const p = newProject(tpl.aspect, tpl.name);
  p.templateId = tpl.id;
  if (tpl.background) p.background = tpl.background;
  const visual = media.filter(m => m.kind !== 'audio');
  const clips: Clip[] = [];
  const tLen = tpl.transitionLen ?? 0.5;
  const imgIds = visual.filter(m => m.kind === 'image').map(m => m.id);

  const sceneClip = (s: NonNullable<Template['intro']>) => newClip({
    kind: 'scene3d', scene: s.scene, duration: s.dur ?? 3, motion: 'none',
    sceneParams: { ...(s.text !== undefined ? { text: s.text } : {}), ...(s.sub !== undefined ? { sub: s.sub } : {}), ...(s.colors ? { colors: s.colors } : {}), mediaIds: imgIds },
  });
  if (tpl.intro) clips.push(sceneClip(tpl.intro));

  const palette = ['#7b5cff', '#ff5fa2', '#39d6c6', '#ffc53d', '#ff7a1a', '#2d8cff'];
  // A 3D intro with no other slots stands alone unless the user brought files for it.
  const slots = tpl.slots;
  const useSlots = !(tpl.intro && slots === 1 && visual.length === 0);
  if (useSlots) for (let i = 0; i < slots; i++) {
    const dur = tpl.rhythm[i % tpl.rhythm.length];
    const fx = (tpl.effects[i % tpl.effects.length] ?? []).map(id => ({ id, amount: id.startsWith('f_') ? 1 : 0.75 }));
    const motion = tpl.motions[i % tpl.motions.length] ?? 'none';
    const m = visual.length ? visual[i % visual.length] : null;
    if (m?.kind === 'video') {
      // Later slots start further into a clip when it repeats, so a short list of clips does not look looped.
      const uses = Math.ceil(slots / visual.length);
      const pass = Math.floor(i / visual.length);
      const span = Math.max(0.01, m.duration - dur);
      const from = uses > 1 ? (span * pass) / Math.max(1, uses - 1) : 0;
      clips.push(newClip({ kind: 'video', mediaId: m.id, in: from, out: Math.min(m.duration, from + dur), effects: fx, motion: motion === 'zoomInFast' ? 'zoomIn' : motion, muted: !!tpl.music }));
    } else if (m) {
      clips.push(newClip({ kind: 'image', mediaId: m.id, duration: dur, effects: fx, motion }));
    } else {
      clips.push(newClip({ kind: 'color', color: palette[i % palette.length], duration: dur, effects: fx, motion }));
    }
  }
  if (tpl.outro) clips.push(sceneClip(tpl.outro));
  clips.forEach((c, i) => { if (i < clips.length - 1 && !tpl.dance) c.transition = { id: tpl.transitions[i % tpl.transitions.length], duration: tLen }; });
  if (tpl.dance) for (const c of clips) if (c.kind !== 'scene3d') { c.dance = { style: tpl.dance.style, amount: tpl.dance.amount ?? 1, flash: !!tpl.dance.flash, fxOnBeat: true }; c.motion = 'none'; }
  p.main = clips;

  // Clip start times decide where captions land.
  let cursor = 0;
  const starts = clips.map((c, i) => {
    const st = cursor;
    const d = c.kind === 'video' ? (c.out - c.in) / c.speed : c.duration;
    const next = clips[i + 1];
    const tl = c.transition && next ? Math.min(c.transition.duration, d / 2, (next.kind === 'video' ? (next.out - next.in) / next.speed : next.duration) / 2) : 0;
    cursor = st + d - tl;
    return { st, d };
  });
  const introDur = tpl.intro ? starts[0]?.d ?? 0 : 0;
  if (tpl.dance?.viz) {
    const dur = cursor;
    p.texts.push(newText({ text: 'Ekvalayzer', viz: tpl.dance.viz, start: 0, duration: dur, size: tpl.dance.viz === 'circle' ? 16 : 11, y: tpl.dance.viz === 'circle' ? 0.5 : 0.86, gradient: ['#f5b301', '#d6246e', '#16a9b8'], animIn: 'none', animOut: 'none' }));
  }
  for (const t of tpl.texts) p.texts.push(toTextClip({ ...t, at: (t.at ?? 0) + introDur }, 0, 3));
  if (tpl.captions) {
    const offset = tpl.intro ? 1 : 0;
    tpl.captions.forEach((text, i) => {
      const s = starts[i + offset];
      if (s) p.texts.push(toTextClip({ size: 6, y: 0.82, anim: 'slideUp', ...tpl.captionStyle, text }, s.st + 0.15, Math.max(0.6, s.d - 0.3)));
    });
  }
  return p;
}

/** Adds a template's background music to a project once its asset is known. */
export function addMusic(p: Project, asset: MediaAsset, name: string) {
  const a: AudioClip = { id: uid(), mediaId: asset.id, name, start: 0, in: 0, out: asset.duration, volume: 0.8, fadeIn: 0.3, fadeOut: 1, loop: true, muted: false, kind: 'music' };
  p.audio.push(a);
}
