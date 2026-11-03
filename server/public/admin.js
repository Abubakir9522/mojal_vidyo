const $ = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) { if (k in el && k !== 'list') el[k] = v; else el.setAttribute(k, v); }
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
};
const root = document.getElementById('root');
let token = sessionStorage.getItem('admin') ?? '';
let toastT;
const toast = (msg, bad) => {
  document.querySelector('.toast')?.remove();
  document.body.append($('div', { class: bad ? 'toast bad' : 'toast', role: 'alert' }, msg));
  clearTimeout(toastT); toastT = setTimeout(() => document.querySelector('.toast')?.remove(), bad ? 6000 : 2500);
};
async function api(path, opts = {}) {
  const init = { method: opts.method ?? 'GET', headers: { authorization: `Bearer ${token}` } };
  if (opts.raw) init.body = opts.raw;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['content-type'] = 'application/json'; }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/admin/login') { token = ''; sessionStorage.removeItem('admin'); showLogin(); throw new Error('Qayta kiring'); }
  if (!r.ok) throw new Error(data.error ?? `Xato: ${r.status}`);
  return data;
}
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
const fmtDate = t => (t ? new Date(t).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const fmtMb = b => `${(b / 1048576).toFixed(1)} MB`;

function showLogin() {
  const pass = $('input', { type: 'password', id: 'pw', required: true, autocomplete: 'current-password' });
  const err = $('p', { class: 'err', role: 'alert' });
  root.replaceChildren($('form', { class: 'login', onsubmit: async e => {
    e.preventDefault();
    try { const r = await api('/api/admin/login', { method: 'POST', body: { password: pass.value } }); token = r.token; sessionStorage.setItem('admin', token); showApp(); }
    catch (x) { err.textContent = x.message; }
  } }, $('h1', {}, "Vodiy Vidyo Edit admin"), $('label', {}, 'Parol', pass), err, $('button', { class: 'primary', type: 'submit' }, 'Kirish')));
  pass.focus();
}

/** One measure per chart, on its own axis: a single series with hover values. */
function dayChart(title, rows, key, color) {
  const W = 520, H = 150, L = 30, B = 20, T = 8, R = 6;
  const maxV = Math.max(1, ...rows.map(r => r[key]));
  const nice = maxV <= 4 ? maxV : Math.ceil(maxV / 5) * 5;
  const bw = (W - L - R) / rows.length;
  const y = v => T + (H - T - B) * (1 - v / nice);
  const box = $('div', { class: 'chart' }, $('h3', {}, title));
  const tip = $('div', { class: 'tip', hidden: true });
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}, oxirgi 30 kun">`;
  for (const v of [0, nice / 2, nice]) svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#353b6b" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#a6abcc">${Number.isInteger(v) ? v : ''}</text>`;
  rows.forEach((r, i) => {
    const x = L + i * bw, h = y(0) - y(r[key]);
    if (r[key] > 0) svg += `<rect x="${x + 1}" y="${y(r[key])}" width="${Math.max(2, bw - 2)}" height="${Math.max(2, h)}" rx="2" fill="${color}"/>`;
    if (i % 7 === 2) svg += `<text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="11" fill="#a6abcc">${new Date(r.day).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })}</text>`;
    svg += `<rect data-i="${i}" x="${x}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>`;
  });
  svg += '</svg>';
  const holder = $('div', { html: svg });
  holder.addEventListener('pointermove', e => {
    const i = e.target.dataset?.i;
    if (i === undefined) { tip.hidden = true; return; }
    const r = rows[+i], rect = box.getBoundingClientRect();
    tip.hidden = false; tip.textContent = `${new Date(r.day).toLocaleDateString('uz-UZ')}: ${r[key]}`;
    tip.style.left = `${e.clientX - rect.left}px`; tip.style.top = `${e.clientY - rect.top}px`;
  });
  holder.addEventListener('pointerleave', () => { tip.hidden = true; });
  box.append(holder, tip);
  return box;
}

const pages = {
  async 'Bosh sahifa'(m) {
    const s = await api('/api/admin/stats');
    const kpi = (v, l) => $('div', { class: 'kpi' }, $('b', {}, v), $('span', {}, l));
    m.append($('h1', {}, 'Bosh sahifa'),
      $('div', { class: 'kpis' }, kpi(s.devices, "O'rnatilgan qurilmalar"), kpi(s.active7, 'Faol, 7 kunda'), kpi(s.users, 'Hisob ochganlar'), kpi(s.exports, 'Tayyorlangan vidyolar'), kpi(s.projects, 'Serverdagi loyihalar')),
      $('div', { class: 'charts' }, dayChart('Kunlik faol qurilmalar', s.daily, 'devices', '#16a9b8'), dayChart('Kunlik tayyorlangan vidyolar', s.daily, 'exports', '#f5b301')),
      $('h2', {}, 'Eng ko\'p ishlatilgan shablonlar'),
      s.topTemplates.length ? $('div', { class: 'tablewrap' }, $('table', {}, $('thead', {}, $('tr', {}, $('th', {}, 'Shablon'), $('th', { class: 'num' }, 'Ishlatilgan'))), $('tbody', {}, s.topTemplates.map(t => $('tr', {}, $('td', {}, t.name), $('td', { class: 'num' }, t.n)))))) : $('p', { class: 'hint' }, "Ilova ishlatilgach, ma'lumot shu yerda ko'rinadi."),
      $('h2', {}, 'Ilova ichidagi kontent'),
      $('p', { class: 'hint' }, `${s.builtin.templates} ta shablon, ${s.builtin.effects} ta effekt, ${s.builtin.transitions} ta o'tish, ${s.builtin.scenes} ta 3D sahna. Serverdan qo'shilgan: ${s.customTemplates} ta shablon, ${s.music} ta musiqa.`));
  },

  async Foydalanuvchilar(m) {
    const search = $('input', { type: 'search', placeholder: 'Ism yoki telefon', 'aria-label': 'Qidirish', class: 'grow' });
    const wrap = $('div');
    const load = guard(async () => {
      const r = await api(`/api/admin/users?q=${encodeURIComponent(search.value)}`);
      wrap.replaceChildren(r.users.length ? $('div', { class: 'tablewrap' }, $('table', {},
        $('thead', {}, $('tr', {}, ...['Ism', 'Telefon', 'Reja', 'Loyihalar', "Ro'yxatdan o'tgan", 'Holat', ''].map(h => $('th', {}, h)))),
        $('tbody', {}, r.users.map(u => $('tr', { 'data-user': u.phone }, $('td', {}, u.name), $('td', {}, u.phone),
          $('td', {}, (() => { const s = $('select', { 'aria-label': 'Reja', onchange: guard(async () => { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { plan: s.value } }); toast('Reja saqlandi'); }) }, ['free', 'pro'].map(p => $('option', { value: p, selected: u.plan === p }, p === 'free' ? 'Bepul' : 'Pro'))); return s; })()),
          $('td', { class: 'num' }, u.projects), $('td', {}, fmtDate(u.createdAt)),
          $('td', {}, $('span', { class: u.blocked ? 'tag bad' : 'tag good' }, u.blocked ? 'Bloklangan' : 'Faol')),
          $('td', {}, $('div', { class: 'row' },
            $('button', { onclick: guard(async () => { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { blocked: !u.blocked } }); load(); }) }, u.blocked ? 'Blokdan chiqarish' : 'Bloklash'),
            $('button', { onclick: guard(async () => { const p = prompt(`${u.name} uchun yangi parol (kamida 6 belgi):`); if (p) { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { password: p } }); toast('Parol almashtirildi'); } }) }, 'Parol'),
            $('button', { class: 'danger', onclick: guard(async () => { if (confirm(`${u.name} va uning loyihalari o'chirilsinmi?`)) { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); load(); } }) }, "O'chirish")))))))) : $('p', { class: 'hint' }, 'Hech kim topilmadi.'),
        $('p', { class: 'hint', style: 'margin-top:8px' }, `Jami: ${r.total}`));
    });
    search.addEventListener('input', () => { clearTimeout(search._t); search._t = setTimeout(load, 250); });
    m.append($('h1', {}, 'Foydalanuvchilar'), $('div', { class: 'row', style: 'margin-bottom:10px' }, search), wrap);
    await load();
  },

  async Shablonlar(m) {
    const cat = await api('/api/admin/catalog');
    m.append($('h1', {}, 'Shablonlar'));
    const customBox = $('div');
    const formBox = $('div');
    const loadCustom = guard(async () => {
      const { templates } = await api('/api/admin/templates');
      customBox.replaceChildren(templates.length ? $('div', { class: 'tablewrap' }, $('table', {},
        $('thead', {}, $('tr', {}, ...['Nomi', 'Toifa', "O'lcham", 'Holat', ''].map(h => $('th', {}, h)))),
        $('tbody', {}, templates.map(t => $('tr', { 'data-tpl': t.name }, $('td', {}, t.name), $('td', {}, cat.categories.find(c => c.id === t.cat)?.name ?? t.cat), $('td', {}, t.data.aspect),
          $('td', {}, $('label', { class: 'tog' }, $('input', { type: 'checkbox', checked: !!t.enabled, onchange: guard(async e => { await api(`/api/admin/templates/${t.id}`, { method: 'PATCH', body: { enabled: e.target.checked } }); }) }), 'Ilovada ko\'rinadi')),
          $('td', {}, $('div', { class: 'row' },
            $('button', { onclick: () => openForm(t) }, 'Tahrirlash'),
            $('label', { class: 'tog' }, 'Rasm', $('input', { type: 'file', accept: 'image/webp,image/png,image/jpeg', style: 'width:170px', onchange: guard(async e => { const f = e.target.files[0]; if (f) { await api(`/api/admin/templates/${t.id}/thumb?name=${encodeURIComponent(f.name)}`, { method: 'PUT', raw: f }); toast('Rasm saqlandi'); } }) })),
            $('button', { class: 'danger', onclick: guard(async () => { if (confirm(`"${t.name}" o'chirilsinmi?`)) { await api(`/api/admin/templates/${t.id}`, { method: 'DELETE' }); loadCustom(); } }) }, "O'chirish")))))))) : $('p', { class: 'hint' }, "Hali serverdan shablon qo'shilmagan. Yangi shablon telefonlarga ilovani yangilamasdan yetib boradi."));
    });

    function picker(items, selected, single) {
      const box = $('div', { class: 'picks' });
      const set = new Set(selected);
      const draw = () => box.replaceChildren(...items.map(i => $('button', { type: 'button', class: set.has(i.id) ? 'pick on' : 'pick', 'data-id': i.id, onclick: () => { if (set.has(i.id)) set.delete(i.id); else { if (single) set.clear(); set.add(i.id); } draw(); } }, i.name)));
      draw();
      box.value = () => [...set];
      return box;
    }

    function openForm(existing) {
      const d = existing?.data ?? { aspect: '9:16', slots: 4, rhythm: [2], cat: cat.categories[0].id, effects: [[]], transitions: ['t_fade'], motions: ['zoomIn'], texts: [] };
      const name = $('input', { value: existing?.name ?? '', required: true, id: 'tpl-name', maxLength: 80 });
      const catSel = $('select', { id: 'tpl-cat' }, cat.categories.map(c => $('option', { value: c.id, selected: c.id === d.cat }, c.name)));
      const aspect = $('select', { id: 'tpl-aspect' }, ['9:16', '16:9', '1:1', '4:5', '3:4'].map(a => $('option', { value: a, selected: a === d.aspect }, a)));
      const slots = $('input', { type: 'number', min: 1, max: 60, value: d.slots, id: 'tpl-slots' });
      const rhythm = $('input', { value: d.rhythm.join(', '), id: 'tpl-rhythm' });
      const fxP = picker(cat.effects, d.effects.flat());
      const trP = picker(cat.transitions, d.transitions);
      const moP = picker(cat.motions, d.motions);
      const intro = $('select', { id: 'tpl-intro' }, $('option', { value: '' }, "Yo'q"), cat.scenes.map(s => $('option', { value: s.id, selected: d.intro?.scene === s.id }, s.name)));
      const introText = $('input', { value: d.intro?.text ?? '', id: 'tpl-intro-text' });
      const dance = $('select', { id: 'tpl-dance' }, $('option', { value: '' }, "Yo'q"), (cat.dances ?? []).map(s => $('option', { value: s.id, selected: d.dance?.style === s.id }, s.name)));
      const music = $('select', { id: 'tpl-music' }, $('option', { value: '' }, "Yo'q"), cat.music.map(s => $('option', { value: s.id, selected: d.music === s.id }, s.name)));
      const title = $('input', { value: d.texts[0]?.text ?? '', id: 'tpl-title' });
      const err = $('p', { class: 'err', role: 'alert' });
      const form = $('form', { class: 'card', style: 'display:grid;gap:12px;margin-bottom:12px', onsubmit: async e => {
        e.preventDefault();
        const body = {
          ...d, name: name.value.trim(), cat: catSel.value, aspect: aspect.value, slots: +slots.value,
          rhythm: rhythm.value.split(',').map(x => parseFloat(x)).filter(x => x > 0),
          effects: fxP.value().length ? fxP.value().map(id => [id]) : [[]], transitions: trP.value().length ? trP.value() : ['t_fade'], motions: moP.value().length ? moP.value() : ['none'],
          texts: title.value.trim() ? [{ text: title.value.trim(), at: 0.3, dur: 3, y: 0.82, size: 6, anim: 'pop' }] : [],
          intro: intro.value ? { scene: intro.value, ...(introText.value.trim() ? { text: introText.value.trim() } : {}) } : undefined,
          music: music.value || undefined,
          dance: dance.value ? { style: dance.value, step: 2, flash: true } : undefined,
        };
        try {
          if (existing) await api(`/api/admin/templates/${existing.id}`, { method: 'PUT', body });
          else await api('/api/admin/templates', { method: 'POST', body });
          formBox.replaceChildren(); toast('Shablon saqlandi. Telefonlarga internet ulanganda yetib boradi.'); loadCustom();
        } catch (x) { err.textContent = x.message; }
      } },
        $('h3', {}, existing ? 'Shablonni tahrirlash' : 'Yangi shablon'),
        $('div', { class: 'form-grid' }, $('label', {}, 'Nomi', name), $('label', {}, 'Toifa', catSel), $('label', {}, "O'lcham", aspect), $('label', {}, 'Rasm yoki vidyo soni', slots), $('label', {}, 'Har kadr, soniya. Masalan: 2 yoki 1, 1, 2', rhythm), $('label', {}, 'Sarlavha', title), $('label', {}, '3D kirish sahnasi', intro), $('label', {}, '3D sahna matni', introText), $('label', {}, 'Musiqa', music), $('label', {}, "Musiqaga o'ynash", dance)),
        $('label', {}, 'Effektlar. Kadrlar ularni navbat bilan oladi', fxP), $('label', {}, "O'tishlar", trP), $('label', {}, 'Kamera harakati', moP), err,
        $('div', { class: 'row' }, $('button', { class: 'primary', type: 'submit', id: 'tpl-save' }, 'Saqlash'), $('button', { type: 'button', class: 'ghost', onclick: () => formBox.replaceChildren() }, 'Bekor qilish')));
      formBox.replaceChildren(form);
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const filter = $('input', { type: 'search', placeholder: 'Shablon nomi', 'aria-label': 'Ichki shablonlarni qidirish', class: 'grow' });
    const catF = $('select', { 'aria-label': 'Toifa', style: 'width:auto' }, $('option', { value: '' }, 'Barcha toifalar'), cat.categories.map(c => $('option', { value: c.id }, c.name)));
    const grid = $('div', { class: 'grid-items' });
    const toggle = (t, key) => guard(async e => { await api(`/api/admin/override/template/${t.id}`, { method: 'PUT', body: { [key]: e.target.checked } }); t[key] = e.target.checked; draw(); });
    const draw = () => {
      const f = filter.value.toLowerCase();
      grid.replaceChildren(...cat.templates.filter(t => (!catF.value || t.cat === catF.value) && t.name.toLowerCase().includes(f)).map(t => $('div', { class: t.hidden ? 'item off' : 'item', 'data-builtin': t.id },
        $('img', { src: `thumbs/${t.id}.webp`, alt: '', loading: 'lazy' }),
        $('div', { class: 'body' }, $('b', {}, t.name),
          $('label', { class: 'tog' }, $('input', { type: 'checkbox', checked: t.hidden, onchange: toggle(t, 'hidden') }), 'Yashirish'),
          $('label', { class: 'tog' }, $('input', { type: 'checkbox', checked: t.featured, onchange: toggle(t, 'featured') }), 'Tavsiya')))));
    };
    filter.addEventListener('input', draw); catF.addEventListener('change', draw);
    m.append($('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' }, $('h2', { style: 'margin:0' }, "Serverdan qo'shilgan"), $('button', { class: 'primary', id: 'tpl-new', onclick: () => openForm(null) }, 'Yangi shablon')), formBox, customBox,
      $('h2', {}, `Ilova ichidagi shablonlar, ${cat.templates.length} ta`), $('div', { class: 'row', style: 'margin-bottom:10px' }, filter, catF), grid);
    draw();
    await loadCustom();
  },

  async Effektlar(m) {
    const cat = await api('/api/admin/catalog');
    m.append($('h1', {}, "Effektlar, o'tishlar, 3D sahnalar"), $('p', { class: 'hint' }, "Belgilangan elementlar ilovada ko'rinmaydi. O'zgarish telefonlarga internet ulanganda yetib boradi."));
    const block = (title, kind, list) => {
      m.append($('h2', {}, `${title}, ${list.length} ta`));
      m.append($('div', { class: 'card picks', style: 'max-height:none;background:var(--panel);border:0' }, list.map(x => $('label', { class: 'tog', style: 'min-width:190px' }, $('input', { type: 'checkbox', 'data-hide': x.id, checked: x.hidden, onchange: guard(async e => { await api(`/api/admin/override/${kind}/${x.id}`, { method: 'PUT', body: { hidden: e.target.checked } }); }) }), `${x.name} yashirish`))));
    };
    block('Effektlar', 'effect', cat.effects); block("O'tishlar", 'transition', cat.transitions); block('3D sahnalar', 'scene', cat.scenes);
  },

  async Musiqa(m) {
    const file = $('input', { type: 'file', accept: 'audio/*', id: 'mu-file', required: true });
    const name = $('input', { id: 'mu-name', required: true, maxLength: 80 });
    const mood = $('input', { id: 'mu-mood', maxLength: 40, placeholder: 'Masalan: Bayram' });
    const list = $('div');
    const load = guard(async () => {
      const r = await api('/api/admin/music');
      list.replaceChildren(r.music.length ? $('div', { class: 'tablewrap' }, $('table', {}, $('thead', {}, $('tr', {}, ...['Nomi', 'Kayfiyat', 'Uzunligi', 'Hajmi', 'Eshitish', 'Holat', ''].map(h => $('th', {}, h)))),
        $('tbody', {}, r.music.map(x => $('tr', { 'data-music': x.name }, $('td', {}, x.name), $('td', {}, x.mood), $('td', {}, `${Math.round(x.duration)} s`), $('td', {}, fmtMb(x.size)), $('td', {}, $('audio', { controls: true, preload: 'none', src: x.url, style: 'height:32px;width:200px' })),
          $('td', {}, $('label', { class: 'tog' }, $('input', { type: 'checkbox', checked: !!x.enabled, onchange: guard(async e => { await api(`/api/admin/music/${x.id}`, { method: 'PATCH', body: { enabled: e.target.checked } }); }) }), "Ko'rinadi")),
          $('td', {}, $('button', { class: 'danger', onclick: guard(async () => { if (confirm(`"${x.name}" o'chirilsinmi?`)) { await api(`/api/admin/music/${x.id}`, { method: 'DELETE' }); load(); } }) }, "O'chirish"))))))) : $('p', { class: 'hint' }, "Hali musiqa yuklanmagan. Faqat foydalanishga huquqingiz bor musiqalarni yuklang."));
    });
    m.append($('h1', {}, 'Musiqa kutubxonasi'),
      $('form', { class: 'card', style: 'display:grid;gap:10px;margin-bottom:12px', onsubmit: guard(async e => {
        e.preventDefault();
        const f = file.files[0];
        if (!f) return;
        const duration = await new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); a.src = URL.createObjectURL(f); });
        await api(`/api/admin/music?name=${encodeURIComponent(name.value)}&mood=${encodeURIComponent(mood.value)}&file=${encodeURIComponent(f.name)}&duration=${duration}`, { method: 'PUT', raw: f });
        toast('Musiqa yuklandi'); e.target.reset(); load();
      }) }, $('div', { class: 'form-grid' }, $('label', {}, 'Fayl', file), $('label', {}, 'Nomi', name), $('label', {}, 'Kayfiyat', mood)), $('div', {}, $('button', { class: 'primary', type: 'submit', id: 'mu-save' }, 'Yuklash'))), list);
    await load();
  },

  async "E'lonlar"(m) {
    const title = $('input', { id: 'an-title', required: true, maxLength: 100 });
    const body = $('textarea', { id: 'an-body', required: true, maxLength: 500 });
    const list = $('div');
    const load = guard(async () => {
      const r = await api('/api/admin/announcements');
      list.replaceChildren(r.announcements.length ? $('div', { class: 'tablewrap' }, $('table', {}, $('thead', {}, $('tr', {}, ...['Sarlavha', 'Matn', 'Sana', 'Holat', ''].map(h => $('th', {}, h)))), $('tbody', {}, r.announcements.map(a => $('tr', {}, $('td', {}, a.title), $('td', {}, a.body), $('td', {}, fmtDate(a.created_at)),
        $('td', {}, $('label', { class: 'tog' }, $('input', { type: 'checkbox', checked: !!a.active, onchange: guard(async e => { await api(`/api/admin/announcements/${a.id}`, { method: 'PATCH', body: { active: e.target.checked } }); }) }), "Ko'rinadi")),
        $('td', {}, $('button', { class: 'danger', onclick: guard(async () => { await api(`/api/admin/announcements/${a.id}`, { method: 'DELETE' }); load(); }) }, "O'chirish"))))))) : $('p', { class: 'hint' }, "Hali e'lon yo'q."));
    });
    m.append($('h1', {}, "E'lonlar"), $('p', { class: 'hint', style: 'margin-bottom:10px' }, "E'lon ilovaning bosh sahifasida chiqadi. Foydalanuvchi internetga ulanganda ko'radi."),
      $('form', { class: 'card', style: 'display:grid;gap:10px;margin-bottom:12px', onsubmit: guard(async e => { e.preventDefault(); await api('/api/admin/announcements', { method: 'POST', body: { title: title.value, body: body.value } }); e.target.reset(); toast("E'lon joylandi"); load(); }) }, $('label', {}, 'Sarlavha', title), $('label', {}, 'Matn', body), $('div', {}, $('button', { class: 'primary', type: 'submit', id: 'an-save' }, 'Joylash'))), list);
    await load();
  },

  async Sozlamalar(m) {
    const s = await api('/api/admin/settings');
    const cur = $('input', { type: 'password', required: true, autocomplete: 'current-password' }), next = $('input', { type: 'password', required: true, minLength: 8, autocomplete: 'new-password' });
    const notice = $('input', { value: s.notice, maxLength: 300 });
    m.append($('h1', {}, 'Sozlamalar'),
      $('form', { class: 'card', style: 'display:grid;gap:10px;margin-bottom:12px', onsubmit: guard(async e => { e.preventDefault(); await api('/api/admin/settings', { method: 'PUT', body: { notice: notice.value } }); toast('Saqlandi'); }) }, $('label', {}, 'Bosh sahifadagi qisqa xabar', notice), $('div', {}, $('button', { class: 'primary', type: 'submit' }, 'Saqlash'))),
      $('form', { class: 'card', style: 'display:grid;gap:10px', onsubmit: guard(async e => { e.preventDefault(); await api('/api/admin/password', { method: 'POST', body: { current: cur.value, next: next.value } }); e.target.reset(); toast("Parol o'zgartirildi"); }) }, $('h3', {}, 'Admin paroli'), $('label', {}, 'Joriy parol', cur), $('label', {}, 'Yangi parol, kamida 8 belgi', next), $('div', {}, $('button', { type: 'submit' }, 'Parolni almashtirish'))));
  },
};

function showApp() {
  const main = $('main');
  const nav = $('nav', { 'aria-label': 'Bo\'limlar' });
  const go = guard(async name => {
    [...nav.children].forEach(b => b.classList.toggle('on', b.textContent === name));
    main.replaceChildren();
    await pages[name](main);
  });
  Object.keys(pages).forEach(n => nav.append($('button', { onclick: () => go(n) }, n)));
  root.replaceChildren($('div', { class: 'layout' }, $('aside', {}, $('div', { class: 'brand' }, $('span', {}, "Vodiy Vidyo Edit")), nav, $('div', { style: 'padding:0 8px' }, $('button', { class: 'ghost', onclick: () => { token = ''; sessionStorage.removeItem('admin'); showLogin(); } }, 'Chiqish'))), main));
  go('Bosh sahifa');
}
token ? showApp() : showLogin();
