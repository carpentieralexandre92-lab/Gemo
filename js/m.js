/* Les Gémo — appli iPhone (PWA, fonctionne hors ligne) */
const h = Render.esc;
const $ = (s, r = document) => r.querySelector(s);
const ic = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h14V9.5"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  gear: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  reset: '<path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.4"/><path d="M3 4v5h5"/>', shuffle: '<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  down: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
};
const svg = n => `<svg class="svg" viewBox="0 0 24 24">${ic[n]}</svg>`;
const plural = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
const pick = a => a[Math.floor(Math.random() * a.length)];
const dayDate = d => new Date(1970, 0, 1 + d);

/* ---------- stockage : IndexedDB ---------- */
const mdb = (() => {
  let p = null;
  const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('gemo-mobile', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), rq = fn(t.objectStore('kv')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); };
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)) };
})();

/* ---------- couleurs / thème ---------- */
const ACCENTS = [['#6a3dff', '#12b5ff'], ['#0a7cff', '#00d4ff'], ['#00b894', '#00e0b0'], ['#ff3d6e', '#ff9d00'], ['#e02eff', '#ff3d8b'], ['#7a2cff', '#ff4dd2']];
const clamp8 = n => Math.max(0, Math.min(255, Math.round(+n || 0)));
const hexToRgb = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0x6a3dff; return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }; };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp8(v).toString(16).padStart(2, '0')).join('');
function hexToHsl(hex) { let { r, g, b } = hexToRgb(hex); r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let hh = 0, s = 0; if (d) { s = d / (1 - Math.abs(2 * l - 1)); hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; } return [hh, s * 100, l * 100]; }
function hslToHex(hh, s, l) { hh = ((hh % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100; const k = n => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255); }
const mixHex = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t); };
function applyTheme() {
  const c = Store.cfg(); let t = c.theme || 'auto';
  if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const a = (typeof c.accent === 'string') ? [c.accent, hslToHex(hexToHsl(c.accent)[0] + 40, 80, 55)] : (ACCENTS[c.accent] || ACCENTS[0]), st = document.documentElement.style, [hh, ss] = hexToHsl(a[0]), dk = t === 'dark', sat = Math.max(45, ss);
  st.setProperty('--accent', a[0]); st.setProperty('--accent2', a[1]); st.setProperty('--mid', mixHex(a[0], a[1], .5));
  st.setProperty('--grad-side', `linear-gradient(175deg, ${hslToHex(hh - 8, sat, dk ? 20 : 30)} 0%, ${hslToHex(hh, sat, dk ? 34 : 48)} 48%, ${hslToHex(hh + 45, sat, dk ? 40 : 55)} 100%)`);
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = dk ? '#18106e' : hslToHex(hh - 8, sat, 30);
}

/* ---------- mascottes ---------- */
function mascot(kind, state = '', o = {}) {
  const suf = state ? '-' + state : '', blink = state ? '' : `<img class="blink" src="img/gemo-${kind}-blink.png" alt="" draggable="false">`;
  return `<span class="mascot ${o.cls || ''}" data-m="${kind}" style="${o.h ? `--h:${o.h}px;` : ''}--bd:${(Math.random() * 4).toFixed(1)}s"><img class="base" src="img/gemo-${kind}${suf}.png" alt="" draggable="false">${blink}</span>`;
}
const trio = (a = '', b = '', c = '', o = {}) => mascot('gris', a, o) + mascot('lapin', b, o) + mascot('bleu', c, o);
const CUTE = ['Coucou ! 😊', 'Tu fais du super boulot !', 'On est trop fiers de toi !', 'Hihi, ça chatouille !', 'Un petit câlin ? 🤗', 'Tu vas y arriver, on y croit !', 'On t\'adore ! 💜'];
const TIPS = ['Réviser juste avant de dormir aide la mémoire à fixer.', 'Une carte te résiste ? Reformule-la avec tes propres mots.', 'Teste-toi avant de regarder la réponse : même une erreur fait progresser.', 'Une pause de 5 minutes toutes les 25 minutes, ça change tout.', 'Explique la réponse à voix haute, comme à un ami.', 'Les cartes ratées reviennent vite : c\'est fait exprès !'];
document.addEventListener('click', e => {
  const m = e.target.closest('.mascot'); if (!m || m.closest('.toast')) return;
  m.classList.remove('jump'); void m.offsetWidth; m.classList.add('jump'); setTimeout(() => m.classList.remove('jump'), 650);
  const kind = m.dataset.m, base = m.querySelector('.base'), bl = m.querySelector('.blink');
  if (base && /gemo-(gris|bleu|lapin)\.png$/.test(base.getAttribute('src'))) { base.src = `img/gemo-${kind}-happy.png`; if (bl) bl.style.display = 'none'; clearTimeout(m._t); m._t = setTimeout(() => { base.src = `img/gemo-${kind}.png`; if (bl) bl.style.display = ''; }, 1800); }
  m.querySelectorAll('.bubble.pop').forEach(b => b.remove());
  const b = document.createElement('div'); b.className = 'bubble pop'; b.textContent = Math.random() < .5 ? pick(CUTE) : pick(TIPS); m.appendChild(b); setTimeout(() => b.remove(), 3200);
});

/* ---------- utilitaires ---------- */
function toast(msg, kind = '', ms = 3200) {
  const t = document.createElement('div'); t.className = 'toast ' + kind;
  t.innerHTML = (kind === 'ok' ? mascot(pick(['gris', 'bleu', 'lapin']), 'happy', { h: 36 }) : '') + '<span></span>'; t.lastChild.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
}
function openSheet(html, onMount) {
  closeSheet(); const o = document.createElement('div'); o.className = 'overlay'; o.id = 'sheet'; o.innerHTML = `<div class="sheet">${html}</div>`;
  o.addEventListener('click', e => { if (e.target === o) closeSheet(); }); $('#layer').appendChild(o); onMount && onMount(o); return o;
}
const closeSheet = () => { const s = $('#sheet'); if (s) s.remove(); };
function ask(title, text, label = 'Confirmer', danger = false) {
  return new Promise(res => openSheet(`<h2>${h(title)}</h2><p class="muted" style="line-height:1.55;margin:0 0 16px">${h(text)}</p><div class="sheet-actions"><button class="btn" data-x="no">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${h(label)}</button></div>`, o => o.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) { closeSheet(); res(b.dataset.x === 'yes'); } })));
}
const syncAgo = t => { if (!t) return 'jamais'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'à l\'instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/* ---------- navigation ---------- */
let view = 'home', S = null, P = { sel: new Set() };
const TABS = [['home', 'home', 'Accueil'], ['pick', 'play', 'Réviser'], ['stats', 'chart', 'Stats'], ['settings', 'gear', 'Réglages']];
function render() {
  const c = Store.counts(null), due = c.new + c.learn + c.review;
  $('#app').innerHTML = `<main id="main"></main><nav class="tabbar">${TABS.map(([k, i, l]) => `<button class="tab ${view === k ? 'on' : ''}" data-act="tab" data-k="${k}">${svg(i)}${l}${k === 'pick' && due ? `<span class="bdg">${due > 99 ? '99+' : due}</span>` : ''}</button>`).join('')}</nav>`;
  ({ home: viewHome, pick: viewPick, stats: viewStats, settings: viewSettings })[view]($('#main'));
}
const go = v => { view = v; render(); $('#main').scrollTop = 0; };

/* ---------- accueil ---------- */
function deckInfo(deck) {
  const scope = Store.deckScope(deck.id), nm = new Map(Store.data.notes.map(n => [n.id, n.deckId]));
  let total = 0, mature = 0;
  for (const c of Store.data.cards) if (scope.has(nm.get(c.noteId))) { total++; if (c.state === 2 && c.ivl >= 21) mature++; }
  return { total, mature, counts: Store.counts(scope) };
}
let showPair = false;
function pairingBox() {
  const st = Sync.status();
  return `<div class="card-box"><h3>☁ J'ai un code d'appairage</h3>
    <p class="muted" style="margin:0 0 12px;line-height:1.55">Sur le PC de Les Gémo : <b>Réglages → Synchronisation → « Code d'appairage »</b>. Envoie-toi ce code (message, Notes) puis colle-le ici.</p>
    <textarea class="input" id="pair-code" rows="3" placeholder="GEMO1-…" ${st.running ? 'disabled' : ''}></textarea>
    <button class="btn primary block" data-act="pair" style="margin-top:10px">Appairer et récupérer mes cartes</button></div>`;
}
function viewHome(m) {
  const all = Store.counts(null), total = all.new + all.learn + all.review, st = Store.stats(), hr = new Date().getHours();
  const name = (Store.cfg().userName || '').trim(), greet = (hr < 5 || hr >= 18 ? 'Bonsoir' : 'Bonjour') + (name ? ', ' + name : ' 👋');
  const decks = [...Store.data.decks].sort((a, b) => a.name.localeCompare(b.name, 'fr')), roots = decks.filter(d => !d.name.includes('::'));
  const none = !Store.data.cards.length, syncOn = Sync.status().configured;
  let a = '', c = '', b = ''; if (none) a = b = c = 'sleep'; else if (!total && st.doneToday) a = b = c = 'party'; else if (!total) a = b = c = 'sleep'; else if (st.doneToday) a = b = 'happy';
  m.innerHTML = `<div class="top"><h1>${h(greet)}</h1><p style="text-transform:capitalize">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
    ${isIOS() && !isStandalone() ? `<div class="install">📲 <div>Pour l'avoir comme une vraie appli : bouton <b>Partager</b> ⬆︎ puis <b>« Sur l'écran d'accueil »</b>.</div></div>` : ''}
    ${none && !syncOn ? `<div class="card-box"><div class="pair" style="height:110px;margin-bottom:6px">${trio('sleep', 'sleep', 'sleep')}</div><h3 style="text-align:center">Ajoute tes premières cartes</h3>
      <p class="muted" style="margin:0 0 14px;line-height:1.55;text-align:center">Importe un fichier de cartes (préparé avec Claude, ChatGPT, ou envoyé par un ami) ou crée-les toi-même.</p>
      <div style="display:grid;gap:10px"><button class="btn primary" data-act="importsheet">${svg('down')}Importer des cartes</button><button class="btn" data-act="addsheet">Créer une carte</button><button class="btn" data-act="showpair">J'ai un code d'appairage (PC)</button></div></div>${showPair ? pairingBox() : ''}` : ''}
    ${none && syncOn ? `<div class="empty"><div class="pair">${trio('sleep', 'sleep', 'sleep')}</div><h2>Aucune carte pour l'instant</h2><p>Synchronise avec ton PC pour récupérer tes cartes.</p><button class="btn primary" data-act="syncnow">${svg('reset')}Synchroniser</button></div>` : ''}
    ${none ? '' : `<div class="hero"><h2>${total ? `${plural(total, 'carte')} à réviser` : 'Tout est à jour 🎉'}</h2><p>${total ? 'Quelques minutes, et tu retiens plus longtemps.' : 'Reviens plus tard ou ajoute des cartes.'}</p>
      <div class="hero-counts"><div><b>${all.new}</b><span>Nouvelles</span></div><div><b>${all.learn}</b><span>En cours</span></div><div><b>${all.review}</b><span>À revoir</span></div></div>
      ${total ? `<button class="btn white" data-act="studyall">${svg('play')}Commencer</button>` : ''}<div class="hero-bears">${trio(a, c, b)}</div></div>
      <div class="chips"><span class="chip">${svg('flame')}${plural(st.streak, 'jour')} de série</span><span class="chip">${plural(st.doneToday, 'révision')} aujourd'hui</span>${st.retention != null ? `<span class="chip">${Math.round(st.retention * 100)} % de réussite</span>` : ''}</div>
      <div class="sect"><h3>Mes matières</h3><div style="display:flex;gap:8px"><button class="btn sm" data-act="importsheet">Importer</button><button class="btn sm" data-act="addsheet">+ Carte</button></div></div>${roots.map(r => subjectCard(r, decks)).join('')}`}`;
}function subjectCard(root, all) {
  const i = deckInfo(root), c = i.counts, col = Store.deckColor(root), kids = all.filter(x => x.name.startsWith(root.name + '::'));
  const cell = (k, v, l) => `<div class="cnt ${k} ${v ? '' : 'zero'}"><b>${v}</b><span>${l}</span></div>`;
  const rows = kids.map(k => { const ki = deckInfo(k), kc = ki.counts, depth = k.name.split('::').length - 2, badges = [['new', kc.new], ['learn', kc.learn], ['review', kc.review]].filter(x => x[1]).map(x => `<span class="n ${x[0]}">${x[1]}</span>`).join(''); return `<button class="chapter" style="padding-left:${16 + depth * 16}px" data-act="studydeck" data-id="${k.id}"><span class="cdot"></span><span class="nm">${h(k.name.split('::').pop())}</span>${badges || '<span class="tot" style="color:var(--good)">✓</span>'}<span class="tot">${ki.total}</span></button>`; }).join('');
  return `<div class="subject" style="--dc:${col}"><button class="subject-head" data-act="studydeck" data-id="${root.id}" style="width:100%;text-align:left"><div class="ttl"><h4>${h(root.name)}</h4><div class="sub">${plural(i.total, 'carte')} · ${i.total ? Math.round(i.mature / i.total * 100) : 0} % maîtrisées</div></div><span class="play">${svg('play')}</span></button>
    <div class="cnt3">${cell('new', c.new, 'Nouv.')}${cell('learn', c.learn, 'Cours')}${cell('review', c.review, 'Revoir')}</div>${rows ? `<div class="chapters">${rows}</div>` : ''}</div>`;
}

/* ---------- page Réviser : choix de matières / chapitres ---------- */
const ancestorsOf = name => { const p = name.split('::'), out = []; for (let i = 1; i < p.length; i++) out.push(p.slice(0, i).join('::')); return out; };
const pickIsOn = d => P.sel.has(d.id) || ancestorsOf(d.name).some(n => { const a = Store.deckByName(n); return a && P.sel.has(a.id); });
function viewPick(m) {
  const decks = [...Store.data.decks].sort((a, b) => a.name.localeCompare(b.name, 'fr')), roots = decks.filter(d => !d.name.includes('::'));
  const all = Store.counts(null), total = all.new + all.learn + all.review, cnt = d => { const c = Store.counts(Store.deckScope(d.id)); return c.new + c.learn + c.review; };
  P.sel = new Set([...P.sel].filter(id => Store.deckById(id)));
  m.innerHTML = `<div class="top"><h1>Réviser</h1><p>Choisis une matière, des chapitres — ou tout.</p></div>
    <button class="pick-all" data-act="studyall"><div><h3>Tout réviser</h3><p>${total ? `${plural(total, 'carte')} à revoir aujourd'hui` : 'Rien à réviser pour le moment'}</p></div><span class="play">${svg('play')}</span></button>
    ${roots.length ? roots.map(r => {
      const kids = decks.filter(x => x.name.startsWith(r.name + '::')), n = cnt(r);
      return `<div class="pick-subject" style="--dc:${Store.deckColor(r)}"><button class="subject-head" data-act="studydeck" data-id="${r.id}" style="width:100%;text-align:left"><div class="ttl"><h4>${h(r.name)}</h4><div class="sub">${n ? `${plural(n, 'carte')} à revoir` : 'À jour ✓'}</div></div><span class="play">${svg('play')}</span></button>
        <div class="ps-chips"><button class="pchip ${P.sel.has(r.id) ? 'on' : ''}" data-act="pickdeck" data-id="${r.id}">Toute la matière${n ? `<span class="n">${n}</span>` : ''}</button>${kids.map(k => { const kn = cnt(k); return `<button class="pchip ${pickIsOn(k) ? 'on' : ''}" data-act="pickdeck" data-id="${k.id}">${h(k.name.slice(r.name.length + 2).replace(/::/g, ' › '))}${kn ? `<span class="n">${kn}</span>` : '<span class="n ok">✓</span>'}</button>`; }).join('')}</div></div>`;
    }).join('') : `<div class="empty"><div class="pair">${trio('sleep', 'sleep', 'sleep')}</div><h2>Aucune carte</h2><p>Synchronise avec ton PC pour récupérer tes cartes.</p></div>`}
    ${P.sel.size ? pickBar() : ''}`;
}
function pickBar() {
  const scope = new Set([...P.sel].flatMap(id => [...Store.deckScope(id)])), c = Store.counts(scope);
  return `<div class="pickbar"><b>${plural(P.sel.size, 'sélection', 'sélections')} · ${plural(c.new + c.learn + c.review, 'carte')} à revoir</b><button class="btn solid" data-act="studysel">${svg('play')}Réviser</button><button class="btn" data-act="cramsel">${svg('shuffle')}Mode libre</button><button class="btn" data-act="pickclear">Vider</button></div>`;
}

/* ---------- révision ---------- */
const CHEER = { 4: ['Trop fort !', 'Facile pour toi !', 'Quelle mémoire !'], 3: ['Bravo !', 'Bien joué !', 'Exact !', 'Continue comme ça !', 'Yes !'], 2: ['Courage, presque !'], 1: ['Pas grave, on la revoit !', 'Ça va rentrer !', 'Courage !'] };
const moodTimers = {};
function setMood(side, state, ms) {
  const el = $(`#study .study-mascot.${side}`); if (!el) return;
  const kind = side === 'l' ? 'gris' : 'bleu', base = $('.base', el), bl = $('.blink', el);
  base.src = `img/gemo-${kind}${state ? '-' + state : ''}.png`; if (bl) bl.style.display = state ? 'none' : '';
  clearTimeout(moodTimers[side]); if (state && ms) moodTimers[side] = setTimeout(() => setMood(side, '', 0), ms);
}
function say(side, text, ms = 1800) {
  const b = $(`#study .study-mascot.${side} .bubble`), m = $(`#study .study-mascot.${side}`); if (!b) return;
  b.textContent = text; b.classList.add('show'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms);
  m.classList.remove('jump'); void m.offsetWidth; m.classList.add('jump');
}
function streakCelebrate(n) {
  document.querySelectorAll('.streak-ov').forEach(x => x.remove());
  const big = n >= 10, tag = n >= 15 ? pick(['Tu es une légende !', 'Imbattable !']) : big ? pick(['Incroyable !', 'Quelle série !']) : pick(['Tu es en feu ! 🔥', 'Continue comme ça !', 'Excellent !']);
  const cols = ['#ff3d8b', '#ffd23f', '#12d4ff', '#6a3dff', '#00d68f', '#ff9d00'];
  const conf = Array.from({ length: big ? 60 : 38 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${pick(cols)};animation-delay:${(Math.random() * .7).toFixed(2)}s;--dx:${Math.round(Math.random() * 120 - 60)}px"></i>`).join('');
  const ov = document.createElement('div'); ov.className = 'streak-ov';
  ov.innerHTML = `<div class="confetti">${conf}</div><div class="streak-card"><div class="bubble big">${n} d'affilée !<small>${h(tag)}</small></div>${mascot('lapin', big ? 'party' : 'happy', { cls: 'nod', h: big ? 250 : 210 })}</div>`;
  const host = $('#study'); if (!host) return; host.appendChild(ov); setTimeout(() => ov.classList.add('out'), 2300); setTimeout(() => ov.remove(), 2800);
}
function react(r) {
  S.combo = r >= 3 ? (S.combo || 0) + 1 : 0;
  if (r === 1) { setMood('l', 'sad', 1800); setMood('r', 'sad', 1800); say('l', pick(CHEER[1])); return; }
  if (r === 2) { say('r', pick(CHEER[2])); return; }
  if (S.combo > 0 && S.combo % 5 === 0) { setMood('l', 'party', 2200); setMood('r', 'party', 2200); streakCelebrate(S.combo); return; }
  const side = Math.random() < .5 ? 'l' : 'r'; setMood(side, 'happy', 1400); say(side, pick(CHEER[r]));
}
function startStudy(deckIds, opts = {}) {
  const scope = deckIds && deckIds.length ? new Set(deckIds.flatMap(id => [...Store.deckScope(id)])) : null;
  S = { args: [deckIds, opts], scope, only: opts.only || null, cram: !!opts.cram, queue: [], title: opts.title || (deckIds && deckIds.length ? deckIds.map(id => Store.deckById(id).name.replace(/::/g, ' › ')).join(' + ') : 'Tout réviser'), buried: new Set(), cur: null, shown: false, t0: 0, done: 0, again: 0, undo: null, ms: 0, combo: 0 };
  if (S.cram) S.queue = [...S.only].sort(() => Math.random() - .5);
  let el = $('#study');
  if (!el) { el = document.createElement('div'); el.id = 'study'; el.innerHTML = `<div id="sx"></div><div class="study-mascot l"><div class="bubble"></div>${mascot('gris')}</div><div class="study-mascot r"><div class="bubble"></div>${mascot('bleu')}</div>`; document.body.appendChild(el); }
  nextStudy();
}
function nextStudy() {
  if (S.cram) { S.cur = null; while (S.queue.length && !S.cur) S.cur = Store.data.cards.find(c => c.id === S.queue[0] && !c.suspended) || (S.queue.shift(), null); }
  else S.cur = Store.nextCard(S.scope, S.buried, S.only);
  S.shown = false; S.t0 = Date.now(); paintStudy();
}
function quitStudy() { S = null; Object.keys(moodTimers).forEach(k => clearTimeout(moodTimers[k])); const el = $('#study'); if (el) el.remove(); render(); setTimeout(() => { if (Sync.status().configured) syncNow(false); }, 400); }
function endScreen() {
  const mins = Math.max(1, Math.round(S.ms / 60000)), ok = S.done ? Math.round((1 - S.again / S.done) * 100) : 0;
  let a, cls = '', title, msg;
  if (!S.done) { a = 'sleep'; title = 'Rien à réviser'; msg = 'Aucune carte à étudier pour le moment ici.'; }
  else if (ok >= 85) { a = 'party'; cls = 'big'; title = 'Incroyable !'; msg = `${ok} % de réussite : les Gémo font la fête avec toi !`; }
  else if (ok >= 50) { a = 'happy'; title = 'Session terminée !'; msg = 'Beau travail, ça progresse bien. Reviens demain !'; }
  else { a = 'sad'; title = 'Pas facile aujourd\'hui…'; msg = 'Moins de la moitié de réussite, mais ne lâche rien : les cartes ratées reviendront bientôt. On s\'accroche !'; }
  return `<div class="done"><div class="pair ${cls}">${trio(a, a, a)}</div><h2>${title}</h2><p>${msg}</p>${S.done ? `<div class="stats-row"><div><b>${S.done}</b><span>cartes</span></div><div><b>${mins} min</b><span>de travail</span></div><div><b>${ok} %</b><span>réussies</span></div></div>` : ''}
    <div style="display:flex;gap:10px;justify-content:center">${ok < 50 && S.done && !S.cram ? `<button class="btn" data-act="restudy">${svg('reset')}Réessayer</button>` : ''}<button class="btn primary" data-act="quit">Terminer</button></div></div>`;
}
function paintStudy() {
  const el = $('#sx'); if (!el || !S) return; const cur = S.cur;
  const c = S.cram ? { new: 0, learn: 0, review: S.queue.length } : Store.counts(S.scope, S.buried, S.only), rem = c.new + c.learn + c.review;
  const on = cur ? (S.cram ? 'review' : cur.state === 0 ? 'new' : cur.state === 2 ? 'review' : 'learn') : '';
  document.querySelectorAll('#study .study-mascot').forEach(m => m.style.display = cur ? '' : 'none');
  let body, foot = '';
  if (cur) {
    const f = Store.faces(cur);
    body = `<div class="flash" ${S.shown ? '' : 'data-act="reveal"'}><div class="q">${f.q}</div>${S.shown ? `<div class="a">${f.a}</div>` : ''}${S.shown && f.source ? `<div class="source">Source : ${h(f.source)}</div>` : ''}</div>`;
    if (!S.shown) foot = `<button class="btn primary show-btn" data-act="reveal">Afficher la réponse</button>`;
    else if (S.cram) foot = `<div class="rate two"><button class="r1" data-act="rate" data-r="1"><span class="lab">À revoir</span><span class="iv">plus tard</span></button><button class="r3" data-act="rate" data-r="3"><span class="lab">Je sais</span><span class="iv">suivante</span></button></div>`;
    else { const pv = Sched.preview(cur, Store.cfg(), Date.now()), L = ['Encore', 'Difficile', 'Bien', 'Facile']; foot = `<div class="rate">${[1, 2, 3, 4].map(r => `<button class="r${r}" data-act="rate" data-r="${r}"><span class="lab">${L[r - 1]}</span><span class="iv">${pv[r]}</span></button>`).join('')}</div>`; }
  } else body = endScreen();
  el.innerHTML = `<div class="study-top"><button class="ibtn" data-act="quit">${svg('x')}</button><div class="title">${h(S.title)}${S.cram ? ' · libre' : ''}</div>
    <div class="study-counts">${S.cram ? `<span class="on" style="color:var(--c-review)">${rem}</span>` : `<span class="${on === 'new' ? 'on' : ''}" style="color:var(--c-new)">${c.new}</span><span class="${on === 'learn' ? 'on' : ''}" style="color:var(--c-learn)">${c.learn}</span><span class="${on === 'review' ? 'on' : ''}" style="color:var(--c-review)">${c.review}</span>`}</div>
    ${cur && !S.cram ? `<button class="ibtn" data-act="undo" ${S.undo ? '' : 'disabled'}>${svg('undo')}</button>` : ''}</div>
    <div class="progress"><i style="width:${S.done + rem ? S.done / (S.done + rem) * 100 : 100}%"></i></div>
    <div class="study-body">${body}</div><div class="study-foot">${foot}</div>`;
}
function rate(r) {
  if (!S || !S.cur || !S.shown) return; const card = S.cur;
  document.querySelectorAll('.streak-ov').forEach(x => x.remove());
  if (S.cram) { r = r <= 2 ? 1 : 3; S.queue.shift(); if (r === 1) S.queue.splice(Math.min(3, S.queue.length), 0, card.id); S.done++; S.ms += Date.now() - S.t0; if (r === 1) S.again++; react(r); nextStudy(); return; }
  const sibs = Store.data.cards.filter(c => c.noteId === card.noteId && c.id !== card.id && !S.buried.has(c.id)).map(c => c.id);
  const u = Store.answerCard(card, r, Date.now() - S.t0); u.buriedAdded = sibs; sibs.forEach(id => S.buried.add(id));
  S.undo = u; S.done++; S.ms += Date.now() - S.t0; if (r === 1) S.again++; react(r); nextStudy();
}
function undoStudy() {
  if (!S || !S.undo || S.cram) return; const u = S.undo, card = Store.data.cards.find(c => c.id === u.prev.id);
  Store.undoAnswer(card, u); u.buriedAdded.forEach(id => S.buried.delete(id)); S.undo = null; S.done = Math.max(0, S.done - 1); S.cur = card; S.shown = false; S.t0 = Date.now(); paintStudy();
}

/* ---------- statistiques ---------- */
function barChart(vals, labels, color, w = 340, hgt = 150) {
  const max = Math.max(1, ...vals), bw = w / vals.length, pad = 20;
  const bars = vals.map((v, i) => { const bh = v / max * (hgt - pad - 8); return `<rect x="${i * bw + 1.5}" y="${hgt - pad - bh}" width="${Math.max(2, bw - 3)}" height="${Math.max(v ? 2 : 0, bh)}" rx="3" fill="${color}" opacity="${v ? 1 : .15}"/>`; }).join('');
  const ticks = vals.map((v, i) => (i % 7 === 0 ? `<text x="${i * bw + bw / 2}" y="${hgt - 5}" font-size="10" text-anchor="middle" fill="var(--faint)">${labels[i].split(' ')[0]}</text>` : '')).join('');
  return `<svg viewBox="0 0 ${w} ${hgt}" style="width:100%;height:auto">${bars}${ticks}<text x="0" y="10" font-size="10" fill="var(--faint)">max ${max}</text></svg>`;
}
function donut(parts) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1, R = 46, C = 2 * Math.PI * R; let off = 0;
  const segs = parts.filter(p => p.v).map(p => { const len = p.v / total * C, s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${p.c}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += len; return s; }).join('');
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><svg width="120" height="120" viewBox="0 0 120 120"><circle r="46" cx="60" cy="60" fill="none" stroke="var(--surface2)" stroke-width="18"/>${segs}<text x="60" y="64" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)" font-family="var(--font-d)">${parts.reduce((s, p) => s + p.v, 0)}</text></svg><div class="legend" style="flex-direction:column;margin:0">${parts.map(p => `<span><span class="dot" style="background:${p.c}"></span>${p.l} — <b style="color:var(--text)">${p.v}</b></span>`).join('')}</div></div>`;
}
function viewStats(m) {
  const st = Store.stats(), t = st.today, mins = Math.round(st.timeToday / 60000);
  const fl = st.forecast.map((v, i) => ({ v, l: i === 0 ? 'Auj.' : dayDate(t + i).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }));
  const l30 = st.last30.map(x => ({ v: x.n, l: dayDate(x.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }));
  m.innerHTML = `<div class="top"><h1>Statistiques</h1><p>Ta progression, en un coup d'œil.</p></div>
    <div class="grid2"><div class="kpi"><div class="v">${st.streak}</div><div class="l">jours de série (record ${st.best})</div></div><div class="kpi"><div class="v">${st.doneToday}</div><div class="l">aujourd'hui${mins ? ' · ' + mins + ' min' : ''}</div></div>
      <div class="kpi"><div class="v">${st.retention != null ? Math.round(st.retention * 100) + ' %' : '—'}</div><div class="l">réussite (30 jours)</div></div><div class="kpi"><div class="v">${st.total}</div><div class="l">révisions au total</div></div></div>
    <div class="card-box"><h3>30 derniers jours</h3>${barChart(l30.map(x => x.v), l30.map(x => x.l), 'var(--accent)')}</div>
    <div class="card-box"><h3>À venir (30 jours)</h3>${barChart(fl.map(x => x.v), fl.map(x => x.l), 'var(--accent2)')}</div>
    <div class="card-box"><h3>Maturité des cartes</h3>${donut([{ l: 'Nouvelles', v: st.mat.new, c: 'var(--c-new)' }, { l: 'En apprentissage', v: st.mat.learning, c: 'var(--c-learn)' }, { l: 'Jeunes', v: st.mat.young, c: 'var(--accent2)' }, { l: 'Matures', v: st.mat.mature, c: 'var(--good)' }, { l: 'Suspendues', v: st.mat.suspended, c: 'var(--faint)' }])}</div>`;
}

/* ---------- réglages & synchronisation ---------- */
async function syncNow(manual) {
  try {
    const r = await Sync.run();
    if (manual) toast(r.pulled || r.pushed ? '☁ Synchronisé' + (r.pulled ? ' : nouveautés reçues' : '') : '☁ Déjà à jour', 'ok');
    if (r.pulled && !S && !$('#sheet')) render();
  } catch (e) { if (manual) toast('Synchronisation impossible : ' + Sync.describe(e), 'error', 6000); }
  if (view === 'settings' && !S && !$('#sheet')) render();
}
function viewSettings(m) {
  const c = Store.cfg(), st = Sync.status();
  m.innerHTML = `<div class="top"><h1>Réglages</h1><p>Profil, cartes, synchronisation et rythme.</p></div>
    <div class="card-box"><h3>Mon profil</h3><div class="field" style="margin:0"><label>Prénom</label><input class="input" data-s="userName" value="${h(c.userName || '')}" placeholder="Ton prénom" autocomplete="given-name"></div><p class="hint" style="margin:8px 0 0">Tes cartes et tes progrès sont enregistrés dans ce téléphone : personne d'autre ne les voit.</p></div>
    <div class="card-box"><h3>Mes cartes</h3><p class="hint" style="margin:0 0 12px">${plural(Store.data.cards.length, 'carte')} dans ce téléphone.</p><div style="display:grid;gap:10px"><button class="btn primary" data-act="importsheet">${svg('down')}Importer des cartes</button><button class="btn" data-act="addsheet">Créer une carte</button></div></div>
    <div class="card-box"><h3>☁ Sauvegarde et synchronisation</h3>${st.configured ? `<p style="margin:0 0 6px"><b>Activée.</b> Dernière synchro : <b>${syncAgo(st.last)}</b>${st.running ? ' · en cours…' : ''}</p>${st.error ? `<p style="color:var(--again);margin:0 0 8px">⚠ ${h(st.error)}</p>` : '<p class="hint" style="margin:0 0 10px">Se fait toute seule quand il y a internet.</p>'}
        <div style="display:grid;gap:10px"><button class="btn primary" data-act="syncnow">${svg('reset')}Synchroniser maintenant</button><button class="btn" data-act="codesheet">Code d'appairage (autre appareil)</button><button class="btn danger" data-act="syncoff">Désactiver</button></div>`
      : `<p class="muted" style="margin:0 0 12px;line-height:1.55"><b>Optionnel.</b> Sauvegarde tes cartes en ligne et retrouve-les sur un autre appareil.</p>
        <label class="hint" style="display:block;margin-bottom:6px">Je suis déjà appairé avec un PC : colle le code</label><textarea class="input" id="pair-code" rows="2" placeholder="GEMO1-…"></textarea><button class="btn primary block" data-act="pair" style="margin-top:10px">Appairer</button>
        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><label class="hint" style="display:block;margin-bottom:6px">Ou crée ta propre sauvegarde avec ta clé GitHub personnelle</label><input class="input" id="own-token" type="password" placeholder="Clé GitHub (ghp_…)" autocomplete="off"><button class="btn block" data-act="tokensetup" style="margin-top:10px">Activer ma sauvegarde</button>`}</div>
    <div class="card-box"><h3>Apparence</h3><div class="field"><label>Thème</label><div class="seg">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<button class="${(c.theme || 'auto') === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="field" style="margin:0"><label>Couleur</label><div class="swatches">${ACCENTS.map((a, i) => `<button class="sw ${c.accent === i ? 'on' : ''}" style="background:linear-gradient(135deg,${a[0]},${a[1]})" data-act="accent" data-v="${i}"></button>`).join('')}</div></div></div>
    <div class="card-box"><h3>Rythme quotidien</h3><div class="row2"><div class="field"><label>Nouvelles / jour</label><input class="input" type="number" min="0" inputmode="numeric" data-s="newPerDay" value="${c.newPerDay}"></div><div class="field"><label>Révisions max</label><input class="input" type="number" min="0" inputmode="numeric" data-s="reviewsPerDay" value="${c.reviewsPerDay}"></div></div>
      <div class="switch-row"><div><b>Mélanger les cartes</b><div class="hint">Nouvelles cartes dans un ordre aléatoire.</div></div><label class="tgl"><input type="checkbox" data-s="shuffle" ${c.shuffle !== false ? 'checked' : ''}><span></span></label></div></div>
    <div class="card-box"><h3>Données</h3><button class="btn block" data-act="export">${svg('down')}Exporter une copie de mes cartes (JSON)</button></div>
    <p class="hint" style="text-align:center">Les Gémo · version iPhone${isStandalone() ? '' : ' · ouvre-la depuis l\'écran d\'accueil pour une meilleure expérience'}</p>`;
}async function pairNow() {
  const code = ($('#pair-code') || {}).value || ''; if (!code.trim()) return toast('Colle d\'abord le code d\'appairage.', 'error');
  const btn = $('[data-act="pair"]'); if (btn) { btn.disabled = true; btn.textContent = 'Synchronisation…'; }
  try { await Sync.join(code); toast('☁ Appairé : cartes récupérées', 'ok'); render(); }
  catch (e) { toast(Sync.describe(e), 'error', 6000); if (btn) { btn.disabled = false; btn.textContent = 'Appairer'; } }
}

/* ---------- Importer / créer des cartes, prénom, code ---------- */
const CLAUDE_PROMPT = `Transforme le cours ci-dessous en flashcards pour mon appli Les Gémo.
Réponds UNIQUEMENT avec un bloc JSON de ce format (rien d'autre) :
{
  "deck": "Matière::Chapitre",
  "cards": [
    { "type": "basic", "front": "Question ?", "back": "Réponse", "source": "où dans le cours", "tags": ["matiere"] },
    { "type": "cloze", "front": "Texte avec {{c1::mot caché}}", "back": "" }
  ]
}
Règles : une seule idée par carte (question courte, réponse précise) ; types : basic (question → réponse), reversed (vocabulaire ou définitions dans les deux sens), cloze (texte à trous {{c1::…}}) ; formules en LaTeX entre $…$ (antislash doublés dans le JSON, ex. $\\\\frac{a}{b}$) ; le trou entoure la formule ({{c1::$x^2$}}) ; n'invente rien qui ne soit pas dans le cours ; indique la source de chaque carte ; en français.

Mon cours :
`;
async function copyText(txt, okMsg) { try { await navigator.clipboard.writeText(txt); toast(okMsg, 'ok'); return true; } catch (e) { toast('Copie impossible : sélectionne le texte à la main.', 'error'); return false; } }
function importSheet(files = []) {
  const st = { sources: [], deckMap: {} }, pretty = n => n.replace(/::/g, ' › ');
  const decks = [...Store.data.decks].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  openSheet(`<h2>Importer des cartes</h2>
    <button class="btn block" id="imp-browse" type="button">${svg('down')}Choisir un fichier…</button><input type="file" id="imp-file" multiple accept=".json,.csv,.tsv,.txt,.md,application/json,text/*" hidden>
    <div id="imp-files" class="chips" style="margin:10px 0 0"></div>
    <div class="field" style="margin-top:14px"><label>Ou colle le contenu ici</label><textarea class="input" id="imp-text" rows="4" placeholder="Colle ici le JSON, le tableau ou la liste de cartes…"></textarea></div>
    <div class="field"><label>Paquet par défaut <span style="text-transform:none;font-weight:400">(si les cartes n'en indiquent pas)</span></label><input class="input" id="imp-deck" list="imp-decks" placeholder="Ex. Histoire::Guerre froide" autocomplete="off"><datalist id="imp-decks">${decks.map(d => `<option value="${h(d.name)}">`).join('')}</datalist></div>
    <button class="btn sm" id="imp-prompt" type="button" style="margin-bottom:12px">Copier la consigne à donner à Claude / ChatGPT</button>
    <div id="imp-prev"></div>
    <div class="sheet-actions"><button class="btn" data-x="no">Annuler</button><button class="btn primary" data-x="ok" disabled>Importer</button></div>`, o => {
    const q = s => $(s, o), prev = q('#imp-prev'), okb = q('[data-x=ok]'); let timer = null, result = null;
    const paintFiles = () => { q('#imp-files').innerHTML = st.sources.map((s, i) => `<span class="chip">${h(s.name)} <button data-rm="${i}" style="margin-left:2px">${svg('x')}</button></span>`).join(''); };
    const addFiles = async fl => { for (const f of fl) { try { st.sources.push({ name: f.name, text: await f.text() }); } catch (e) { toast('Lecture impossible : ' + f.name, 'error'); } } paintFiles(); compute(); };
    const later = () => { clearTimeout(timer); timer = setTimeout(compute, 250); };
    function compute() {
      const srcs = [...st.sources], pasted = q('#imp-text').value; if (pasted.trim()) srcs.push({ name: 'Texte collé', text: pasted });
      result = null; okb.disabled = true; okb.textContent = 'Importer';
      if (!srcs.length) { prev.innerHTML = '<p class="hint">Un aperçu apparaît ici avant l\'import.</p>'; return; }
      const b = Importer.build(srcs, q('#imp-deck').value.trim(), st.deckMap), r = Store.importPayload(b.payload, { dryRun: true });
      const names = Object.keys(r.byDeck), existing = Store.data.decks.map(d => d.name);
      const warns = names.filter(n => r.byDeck[n].isNew).map(n => [n, Importer.near(n, existing)]).filter(x => x[1].length);
      const noDeck = !q('#imp-deck').value.trim() && b.payload.decks.some(g => g.deck === 'Importé');
      prev.innerHTML = `<div class="card-box" style="margin:0 0 10px;padding:12px 14px;box-shadow:none"><b>${r.added ? '✓ ' + plural(r.added, 'carte') + ' prête' + (r.added > 1 ? 's' : '') : 'Aucune carte à importer'}</b>${r.skipped ? ` · ${plural(r.skipped, 'doublon ignoré', 'doublons ignorés')}` : ''}<div class="hint">${b.formats.map(h).join(' · ')}</div></div>
        ${names.map(n => `<div class="hint" style="margin:0 0 6px">• <b style="color:var(--text)">${h(pretty(n))}</b> — ${plural(r.byDeck[n].added, 'carte')}${r.byDeck[n].isNew ? ' (nouveau paquet)' : ''}</div>`).join('')}
        ${warns.map(([n, nr]) => `<div class="install" style="margin:8px 0">⚠ <div>« ${h(pretty(n))} » n'existe pas, mais « ${h(pretty(nr[0]))} » existe. <button class="btn sm" data-use="${h(n)}" data-to="${h(nr[0])}" style="margin-top:6px">Utiliser « ${h(nr[0].split('::').pop())} »</button></div></div>`).join('')}
        ${noDeck ? `<div class="install" style="margin:8px 0">Ces cartes n'ont pas de paquet : elles iront dans « Importé ». Choisis un paquet ci-dessus pour les ranger.</div>` : ''}
        ${b.errors.concat(r.errors.slice(0, 3)).map(e => `<div class="hint" style="color:var(--again);margin:4px 0">${h(e)}</div>`).join('')}`;
      result = { payload: b.payload, r }; okb.disabled = !r.added; okb.textContent = r.added ? 'Importer ' + plural(r.added, 'carte') : 'Importer';
    }
    q('#imp-browse').onclick = () => q('#imp-file').click(); q('#imp-file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
    q('#imp-text').addEventListener('input', later); q('#imp-deck').addEventListener('input', () => { st.deckMap = {}; later(); });
    q('#imp-prompt').onclick = () => copyText(CLAUDE_PROMPT, 'Consigne copiée : colle-la dans Claude, puis ajoute ton cours.');
    o.addEventListener('click', e => {
      const rm = e.target.closest('[data-rm]'); if (rm) { st.sources.splice(+rm.dataset.rm, 1); paintFiles(); compute(); return; }
      const u = e.target.closest('[data-use]'); if (u) { st.deckMap[u.dataset.use] = u.dataset.to; compute(); return; }
      const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x !== 'ok') return closeSheet(); if (!result) return;
      const rr = Store.importPayload(result.payload); closeSheet();
      toast(`✨ ${plural(rr.added, 'carte importée', 'cartes importées')}${rr.skipped ? ` · ${plural(rr.skipped, 'doublon ignoré', 'doublons ignorés')}` : ''}`, 'ok', 4500); render();
    });
    paintFiles(); compute(); if (files.length) addFiles(files);
  });
}
function addSheet() {
  const roots = Store.data.decks.filter(d => !d.name.includes('::')), st = { type: 'basic' };
  openSheet(`<h2>Créer une carte</h2><div class="seg" id="ad-type" style="margin-bottom:14px"><button data-t="basic" class="on">Simple</button><button data-t="cloze">Texte à trous</button></div>
    <div class="row2"><div class="field"><label>Matière</label><input class="input" id="ad-subj" list="ad-subjs" placeholder="Ex. Histoire" autocomplete="off"><datalist id="ad-subjs">${roots.map(d => `<option value="${h(d.name)}">`).join('')}</datalist></div><div class="field"><label>Chapitre</label><input class="input" id="ad-chap" list="ad-chaps" placeholder="Ex. Guerre froide" autocomplete="off"><datalist id="ad-chaps"></datalist></div></div>
    <div class="field"><label id="ad-flab">Recto (question)</label><textarea class="input" id="ad-front" rows="3"></textarea><div class="hint" id="ad-hint"></div></div>
    <div class="field"><label id="ad-blab">Verso (réponse)</label><textarea class="input" id="ad-back" rows="3"></textarea></div>
    <div class="sheet-actions"><button class="btn" data-x="no">Terminé</button><button class="btn primary" data-x="ok">Ajouter</button></div>`, o => {
    const q = s => $(s, o), last = Store.data.decks.find(d => !d.name.includes('::'));
    const chapOpts = () => { const s = q('#ad-subj').value.trim().toLowerCase(); q('#ad-chaps').innerHTML = Store.data.decks.filter(d => d.name.toLowerCase().startsWith(s + '::')).map(d => `<option value="${h(d.name.slice(s.length + 2))}">`).join(''); };
    const typeUi = () => { o.querySelectorAll('#ad-type button').forEach(b => b.classList.toggle('on', b.dataset.t === st.type)); const cl = st.type === 'cloze'; q('#ad-flab').textContent = cl ? 'Texte à trous' : 'Recto (question)'; q('#ad-blab').textContent = cl ? 'Complément (optionnel)' : 'Verso (réponse)'; q('#ad-hint').innerHTML = cl ? 'Entoure les réponses : <code>{{c1::mot}}</code>' : ''; };
    q('#ad-subj').addEventListener('input', chapOpts); if (last) { q('#ad-subj').value = last.name; chapOpts(); } typeUi();
    o.addEventListener('click', e => {
      const tb = e.target.closest('#ad-type button'); if (tb) { st.type = tb.dataset.t; typeUi(); return; }
      const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x !== 'ok') { closeSheet(); render(); return; }
      const subj = q('#ad-subj').value.trim(), chap = q('#ad-chap').value.trim(), front = q('#ad-front').value.trim(), back = q('#ad-back').value.trim();
      if (!subj) return toast('Choisis une matière.', 'error'); if (!front) return toast('Le recto est vide.', 'error');
      if (st.type === 'cloze' && !Render.clozeNumbers(front).length) return toast('Ajoute au moins un trou {{c1::…}}.', 'error'); if (st.type !== 'cloze' && !back) return toast('Le verso est vide.', 'error');
      const deck = Store.addDeck(chap ? subj + '::' + chap : subj); Store.addNote({ deckId: deck.id, type: st.type, front, back, extra: '', source: '', tags: [] });
      toast('Carte ajoutée ✓', 'ok', 1800); q('#ad-front').value = ''; q('#ad-back').value = ''; q('#ad-front').focus();
    });
  });
}
function nameSheet() {
  openSheet(`<h2>Bienvenue ! 👋</h2><p class="muted" style="margin:0 0 14px;line-height:1.55">Comment tu t'appelles ? Ça sert juste à te dire bonjour.</p><input class="input" id="nm" placeholder="Ton prénom" autocomplete="given-name"><div class="sheet-actions" style="margin-top:14px"><button class="btn" data-x="no">Plus tard</button><button class="btn primary" data-x="ok">Valider</button></div>`, o => {
    const inp = $('#nm', o); setTimeout(() => inp.focus(), 250);
    o.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === 'ok' && inp.value.trim()) Store.cfg().userName = inp.value.trim(); Store.cfg().nameAsked = true; Store.save(); closeSheet(); render(); });
  });
}
function codeSheet() {
  const code = Sync.pairingCode();
  openSheet(`<h2>Code d'appairage</h2><p class="muted" style="margin:0 0 10px;line-height:1.55">Colle ce code dans Les Gémo sur un autre appareil pour y retrouver tes cartes. <b>Ne le partage avec personne d'autre</b> : il donne accès à tes cartes.</p><textarea class="input" rows="4" readonly style="font-size:12px">${h(code)}</textarea><div class="sheet-actions" style="margin-top:12px"><button class="btn" data-x="no">Fermer</button><button class="btn primary" data-x="copy">Copier</button></div>`, o => o.addEventListener('click', async e => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === 'copy') copyText(code, 'Code copié'); else closeSheet(); }));
}
async function tokenSetup() {
  const tok = ($('#own-token') || {}).value || ''; if (!tok.trim()) return toast('Colle d\'abord ta clé GitHub.', 'error');
  const btn = $('[data-act="tokensetup"]'); if (btn) { btn.disabled = true; btn.textContent = 'Activation…'; }
  try { await Sync.setup(tok); toast('☁ Sauvegarde activée', 'ok'); render(); } catch (e) { toast(Sync.describe(e), 'error', 6000); if (btn) { btn.disabled = false; btn.textContent = 'Activer ma sauvegarde'; } }
}
const actions = {
  tab: el => go(el.dataset.k),
  studyall: () => startStudy(null),
  studydeck: el => startStudy([el.dataset.id]),
  reveal: () => { document.querySelectorAll('.streak-ov').forEach(x => x.remove()); if (S && S.cur && !S.shown) { S.shown = true; paintStudy(); } },
  rate: el => rate(+el.dataset.r), undo: undoStudy, quit: quitStudy, restudy: () => startStudy(...S.args),
  pickdeck: el => {
    const d = Store.deckById(el.dataset.id), isRoot = !d.name.includes('::');
    if (P.sel.has(d.id)) P.sel.delete(d.id);
    else { const root = Store.deckByName(d.name.split('::')[0]); if (!isRoot && root && P.sel.has(root.id)) { P.sel.delete(root.id); Store.data.decks.filter(x => x.name.startsWith(root.name + '::') && x.id !== d.id).forEach(x => P.sel.add(x.id)); } else { if (isRoot) Store.data.decks.filter(x => x.name.startsWith(d.name + '::')).forEach(x => P.sel.delete(x.id)); P.sel.add(d.id); } }
    const y = $('#main').scrollTop; render(); $('#main').scrollTop = y;
  },
  pickclear: () => { P.sel = new Set(); render(); },
  studysel: () => { if (P.sel.size) startStudy([...P.sel]); },
  cramsel: () => {
    if (!P.sel.size) return; const scope = new Set([...P.sel].flatMap(id => [...Store.deckScope(id)])), nm = new Map(Store.data.notes.map(n => [n.id, n.deckId]));
    const only = new Set(Store.data.cards.filter(c => !c.suspended && scope.has(nm.get(c.noteId))).map(c => c.id)); if (!only.size) return toast('Aucune carte dans cette sélection.', 'error');
    startStudy([...P.sel], { only, cram: true });
  },
  theme: el => { Store.cfg().theme = el.dataset.v; Store.save(); applyTheme(); render(); },
  accent: el => { Store.cfg().accent = +el.dataset.v; Store.save(); applyTheme(); render(); },
  pair: pairNow, syncnow: () => syncNow(true),
  importsheet: () => importSheet(), addsheet: addSheet, codesheet: codeSheet, tokensetup: tokenSetup,
  showpair: () => { showPair = !showPair; render(); },
  syncoff: async () => { if (await ask('Désactiver la synchronisation ?', 'Tes cartes restent sur ce téléphone, mais ne seront plus synchronisées avec ton PC.', 'Désactiver', true)) { await Sync.disable(); toast('Synchronisation désactivée'); render(); } },
  export: async () => {
    const blob = new Blob([JSON.stringify(Store.data)], { type: 'application/json' }), file = new File([blob], 'les-gemo-' + new Date().toISOString().slice(0, 10) + '.json', { type: 'application/json' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  },
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && actions[el.dataset.act]) actions[el.dataset.act](el, e); });
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.s; if (!k) return; const c = Store.cfg();
  c[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Math.max(0, Number(e.target.value) || 0) : e.target.value; Store.save();
});

/* ---------- démarrage ---------- */
(async function boot() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { }
  Store.useDriver({ load: () => mdb.get('collection'), save: d => mdb.set('collection', d) });
  await Store.load({ seed: false });
  applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  await Sync.init();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => { document.documentElement.dataset.sw = 'ok'; }).catch(e => { document.documentElement.dataset.sw = 'erreur: ' + e.message; });
    let had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !S) location.reload(); had = true; });
  }
  if (Sync.status().configured) syncNow(false);
  if (!Store.cfg().userName && !Store.cfg().nameAsked) setTimeout(nameSheet, 700);
  window.addEventListener('online', () => { if (!S && Sync.status().configured) syncNow(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !S && Sync.status().configured) syncNow(false); });
  setInterval(() => { if (!S && !document.hidden && Sync.status().configured) syncNow(false); }, 5 * 60 * 1000);
})();
