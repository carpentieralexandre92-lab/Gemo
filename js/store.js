/* Mnémo — données (collection.json), import, files de révision, statistiques */
const TOKEN = (document.querySelector('meta[name="token"]') || {}).content || '';
const DECK_COLORS = ['#7c4dff', '#2f7bff', '#00c2a8', '#ffb300', '#ff4d6d', '#ff3dcf', '#00b8ff', '#ff7a1a'];

const Store = (() => {
  let data = null, saveTimer = null, dirty = false;
  const listeners = new Set();

  let CID = null; try { CID = sessionStorage.getItem('mnemo-cid'); } catch (e) { }
  if (!CID) { CID = Sched.uid() + Sched.uid(); try { sessionStorage.setItem('mnemo-cid', CID); } catch (e) { } }
  let lost = false;

  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { 'X-Token': TOKEN, 'X-Client': CID, ...(opts.headers || {}) } });
    if (r.status === 409) { lost = true; window.dispatchEvent(new Event('mnemo-lease-lost')); throw new Error('lease'); }
    if (!r.ok) throw new Error(path + ' → ' + r.status);
    return r.json();
  }
  /** Réclame le droit d'écrire. force = prendre la main sur une autre fenêtre. */
  async function claim(force = false) {
    const r = await fetch('/api/lease', { method: 'POST', headers: { 'X-Token': TOKEN }, body: JSON.stringify({ id: CID, force }) });
    const ok = (await r.json()).owner; if (ok) lost = false; return ok;
  }

  /* Stockage : par défaut le serveur local du PC ; l'appli iPhone fournit son propre pilote (IndexedDB). */
  let driver = {
    load: () => api('/api/data'),
    save: d => api('/api/data', { method: 'POST', body: JSON.stringify(d) }),
    beacon: d => { try { navigator.sendBeacon('/api/data?t=' + TOKEN + '&c=' + CID, JSON.stringify(d)); } catch (e) { } },
  };
  function useDriver(d) { driver = d; }

  const uid = Sched.uid;
  const cfg = () => data.settings;
  const now = () => Date.now();
  const today = () => Sched.dayIndex(now(), cfg().rolloverHour);

  function emptyCollection() {
    return { version: 1, settings: { ...Sched.defaults, theme: 'auto', accent: 0 }, decks: [], notes: [], cards: [], revlog: [], nextPos: 1 };
  }

  async function load(opts = {}) {
    let d = null;
    try { d = await driver.load(); } catch (e) { console.error(e); }
    data = d || emptyCollection();
    data.settings = { ...Sched.defaults, theme: 'auto', accent: 0, ...(data.settings || {}) };
    for (const k of ['decks', 'notes', 'cards', 'revlog']) data[k] = data[k] || [];
    data.nextPos = data.nextPos || (data.cards.length + 1);
    data.decks.slice().forEach(x => addDeck(x.name)); // crée les matières parentes manquantes
    if (!d && opts.seed !== false) seedDemo();
    return data;
  }

  function seedDemo() {
    const deck = addDeck('Démo — bienvenue', 0);
    const mk = (type, front, back, tags = ['demo'], source = '') => addNote({ deckId: deck.id, type, front, back, tags, source, extra: '' }, true);
    mk('basic', 'Quelle est la dérivée de $x^n$ ?', '$$\\left(x^n\\right)\' = n\\,x^{n-1}$$', ['demo', 'maths'], 'Cours — Dérivation');
    mk('cloze', 'La {{c1::mitochondrie}} produit l\'{{c2::ATP}} lors de la {{c3::respiration cellulaire}}.', '', ['demo', 'bio']);
    mk('basic', 'Formule du pH ?', '$\\mathrm{pH} = -\\log\\left[\\ce{H3O+}\\right]$', ['demo', 'chimie']);
    mk('reversed', 'Capitale de l\'Espagne', 'Madrid', ['demo', 'langues']);
    mk('basic', 'Comment ajouter mes propres cartes ?', '- Bouton **Ajouter** dans le menu\n- Ou demande à **Claude** de transformer ton cours en cartes : elles arrivent ici toutes seules.', ['demo']);
    save();
  }

  function save() {
    dirty = true; clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 350);
    emit();
  }
  async function flush() {
    if (!dirty || lost) return;
    dirty = false;
    try { await driver.save(data); }
    catch (e) { if (lost) return; dirty = true; console.error('Sauvegarde impossible', e); if (typeof toast === 'function') toast('Sauvegarde impossible — réessai…', 'error'); setTimeout(flush, 3000); }
  }
  window.addEventListener('beforeunload', () => { if (dirty && driver.beacon) driver.beacon(data); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  function emit() { listeners.forEach(f => f()); }
  function onChange(f) { listeners.add(f); }

  /* ---------- Paquets ---------- */
  const normName = n => n.trim().replace(/\s*::\s*/g, '::').replace(/^:+|:+$/g, '');
  /** Crée le paquet et tous ses parents (Philo::Liberté crée aussi Philo). */
  function addDeck(name, color) {
    name = normName(name);
    const parts = name.split('::'); let d = null;
    for (let i = 1; i <= parts.length; i++) {
      const n = parts.slice(0, i).join('::');
      d = data.decks.find(x => x.name.toLowerCase() === n.toLowerCase());
      if (!d) {
        const roots = data.decks.filter(x => !x.name.includes('::')).length;
        d = { id: uid(), name: n, color: (i === 1 && color != null) ? color : (i === 1 ? roots % DECK_COLORS.length : 0), created: now() };
        data.decks.push(d);
      }
    }
    return d;
  }
  const deckById = id => data.decks.find(d => d.id === id);
  const deckByName = n => data.decks.find(d => d.name.toLowerCase() === normName(n).toLowerCase());
  /** Couleur d'un paquet = celle de sa matière (paquet racine) */
  function deckColor(d) {
    if (!d) return DECK_COLORS[0];
    const root = deckByName(d.name.split('::')[0]) || d;
    return typeof root.color === 'string' ? root.color : DECK_COLORS[(root.color || 0) % DECK_COLORS.length];
  }
  function setDeckColor(id, color) { const d = deckById(id); if (d) { d.color = color; save(); } }
  function moveNotes(noteIds, deckName) {
    const ids = new Set(noteIds); if (!ids.size) return 0;
    const deck = addDeck(deckName); let n = 0;
    for (const note of data.notes) if (ids.has(note.id) && note.deckId !== deck.id) { note.deckId = deck.id; note.modified = now(); n++; }
    save(); return n;
  }
  function tagNotes(noteIds, add = [], remove = []) {
    const ids = new Set(noteIds), rm = new Set(remove.map(t => t.toLowerCase()));
    for (const note of data.notes) if (ids.has(note.id)) {
      note.tags = [...new Set([...note.tags.filter(t => !rm.has(t.toLowerCase())), ...add.map(t => t.trim()).filter(Boolean)])]; note.modified = now();
    }
    save();
  }
  function deckScope(deckId) {
    const d = deckById(deckId); if (!d) return new Set();
    const p = d.name + '::';
    return new Set(data.decks.filter(x => x.id === d.id || x.name.startsWith(p)).map(x => x.id));
  }
  function renameDeck(id, name) {
    const d = deckById(id); if (!d) return;
    name = normName(name);
    const target = deckByName(name);
    if (target && target.id !== id) { // fusion avec un paquet existant
      const scope = deckScope(id), p = d.name + '::';
      data.notes.forEach(n => { if (n.deckId === id) n.deckId = target.id; });
      data.decks.filter(x => x.name.startsWith(p)).forEach(x => { const nn = name + '::' + x.name.slice(p.length); const t2 = deckByName(nn); if (t2) { data.notes.forEach(n => { if (n.deckId === x.id) n.deckId = t2.id; }); x.__drop = true; } else x.name = nn; });
      d.__drop = true; data.decks = data.decks.filter(x => !x.__drop); save(); return;
    }
    const old = d.name, p = old + '::';
    data.decks.forEach(x => { if (x.name.startsWith(p)) x.name = name + '::' + x.name.slice(p.length); });
    d.name = name; addDeck(name); save();
  }
  /** Supprime les doublons exacts (même type + même recto) dans un paquet et ses chapitres ; garde la note la plus avancée. */
  function dedupeScope(deckId) {
    const sc = deckScope(deckId), cardsBy = new Map();
    data.cards.forEach(c => { if (!cardsBy.has(c.noteId)) cardsBy.set(c.noteId, []); cardsBy.get(c.noteId).push(c); });
    const score = n => (cardsBy.get(n.id) || []).reduce((s, c) => s + (c.reps || 0), 0);
    const groups = new Map();
    data.notes.filter(n => sc.has(n.deckId)).forEach(n => { const k = n.deckId + '|' + n.type + '|' + norm(n.front); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
    const drop = new Set();
    groups.forEach(list => {
      if (list.length < 2) return;
      list.sort((a, b) => score(b) - score(a) || (a.created - b.created));
      const keep = list[0]; list.slice(1).forEach(n => { n.tags.forEach(t => { if (!keep.tags.includes(t)) keep.tags.push(t); }); drop.add(n.id); });
    });
    if (drop.size) { data.notes = data.notes.filter(n => !drop.has(n.id)); data.cards = data.cards.filter(c => !drop.has(c.noteId)); save(); }
    return drop.size;
  }
  /** Fusionne le paquet source (et ses chapitres) dans le paquet cible, qui est conservé. */
  function mergeDecks(sourceId, targetId, opts = {}) {
    const s = deckById(sourceId), t = deckById(targetId);
    if (!s || !t || s.id === t.id) return { error: 'Paquets invalides.' };
    if (t.name.startsWith(s.name + '::')) return { error: 'Impossible de fusionner un paquet dans l\'un de ses propres chapitres.' };
    const sc = deckScope(sourceId), noteIds = new Set(data.notes.filter(n => sc.has(n.deckId)).map(n => n.id));
    const moved = data.cards.filter(c => noteIds.has(c.noteId)).length, tid = t.id, tname = t.name;
    renameDeck(sourceId, tname);
    const keep = deckById(tid) || deckByName(tname);
    const removed = opts.dedupe === false ? 0 : dedupeScope(keep.id);
    if (opts.newName && opts.newName.trim() && normName(opts.newName) !== keep.name) renameDeck(keep.id, opts.newName);
    const final = deckById(tid) || deckByName(normName(opts.newName || tname)) || keep;
    save();
    return { moved, removed, name: final ? final.name : tname };
  }
  function deleteDeck(id) {
    const ids = deckScope(id);
    const noteIds = new Set(data.notes.filter(n => ids.has(n.deckId)).map(n => n.id));
    data.cards = data.cards.filter(c => !noteIds.has(c.noteId));
    data.notes = data.notes.filter(n => !noteIds.has(n.id));
    data.decks = data.decks.filter(d => !ids.has(d.id));
    save();
  }

  /* ---------- Notes & cartes ---------- */
  const noteById = id => data.notes.find(n => n.id === id);
  const noteMap = () => new Map(data.notes.map(n => [n.id, n]));

  function ordsFor(note) {
    if (note.type === 'cloze') { const o = Render.clozeNumbers(note.front); return o.length ? o : [1]; }
    return note.type === 'reversed' ? [0, 1] : [0];
  }
  function syncCards(note) {
    const want = ordsFor(note);
    const mine = data.cards.filter(c => c.noteId === note.id);
    data.cards = data.cards.filter(c => c.noteId !== note.id || want.includes(c.ord));
    for (const o of want) if (!mine.some(c => c.ord === o)) data.cards.push(Sched.newCard(note.id, o, data.nextPos++, cfg()));
  }
  function addNote({ deckId, type = 'basic', front = '', back = '', extra = '', source = '', tags = [] }, silent) {
    const note = { id: uid(), deckId, type, front, back, extra, source, tags: [...new Set(tags.map(t => t.trim()).filter(Boolean))], created: now(), modified: now() };
    data.notes.push(note); syncCards(note);
    if (!silent) save();
    return note;
  }
  function updateNote(id, patch) {
    const n = noteById(id); if (!n) return;
    Object.assign(n, patch, { modified: now() });
    if (patch.tags) n.tags = [...new Set(patch.tags.map(t => t.trim()).filter(Boolean))];
    syncCards(n); save();
  }
  function deleteNote(id) {
    data.notes = data.notes.filter(n => n.id !== id);
    data.cards = data.cards.filter(c => c.noteId !== id);
    save();
  }
  /** Applique le résultat d'une synchronisation en place : les objets existants sont conservés (une révision en cours reste valide). */
  function applyMerged(m) {
    for (const k of ['decks', 'notes', 'cards']) {
      const old = new Map(data[k].map(x => [x.id, x])), next = [];
      for (const it of m[k]) {
        const ex = old.get(it.id);
        if (ex && ex !== it) { for (const kk of Object.keys(ex)) if (!(kk in it)) delete ex[kk]; Object.assign(ex, it); next.push(ex); }
        else next.push(it);
      }
      data[k].length = 0; next.forEach(x => data[k].push(x));
    }
    data.revlog.length = 0; m.revlog.forEach(x => data.revlog.push(x));
    data.daily = m.daily || {}; data.nextPos = Math.max(data.nextPos || 1, m.nextPos || 1);
    save();
  }
  /** Remet des cartes à "nouvelle" (toutes si cardIds est null). clearHistory : efface aussi leur historique de révisions. */
  function resetProgress(cardIds, clearHistory) {
    const ids = cardIds ? new Set(cardIds) : null, c = cfg(), nm = noteMap();
    const cards = data.cards.filter(x => !ids || ids.has(x.id));
    cards.slice().sort((a, b) => ((nm.get(a.noteId)?.created || 0) - (nm.get(b.noteId)?.created || 0)) || a.ord - b.ord).forEach(card => {
      Object.assign(card, { state: 0, due: data.nextPos++, ivl: 0, ease: c.startEase, reps: 0, lapses: 0, step: 0, last: 0, suspended: false });
      const n = nm.get(card.noteId); if (n) n.tags = n.tags.filter(t => t !== 'leech');
    });
    if (clearHistory) { const set = new Set(cards.map(x => x.id)); data.revlog = ids ? data.revlog.filter(e => !set.has(e.cardId)) : []; }
    save(); return cards.length;
  }
  /** Efface toutes les cartes et tous les paquets (les réglages sont conservés). */
  function wipeAll() { data.decks = []; data.notes = []; data.cards = []; data.revlog = []; data.nextPos = 1; save(); }
  function setSuspended(cardId, v) { const c = data.cards.find(x => x.id === cardId); if (c) { c.suspended = v; save(); } }
  function resetCard(cardId) {
    const c = data.cards.find(x => x.id === cardId); if (!c) return;
    Object.assign(c, { state: 0, due: data.nextPos++, ivl: 0, ease: cfg().startEase, step: 0, lapses: 0, reps: 0, suspended: false }); save();
  }

  /** Faces d'une carte */
  function faces(card) { return facesFor(noteById(card.noteId), card.ord); }
  function facesFor(n, ord) {
    const card = { ord };
    if (!n) return { q: '', a: '', source: '' };
    const extra = n.extra ? '<div class="extra">' + Render.html(n.extra) + '</div>' : '';
    if (n.type === 'cloze') {
      return { q: Render.html(n.front, 'q', card.ord), a: Render.html(n.front, 'a', card.ord) + (n.back ? '<div class="extra">' + Render.html(n.back) + '</div>' : '') + extra, source: n.source };
    }
    const [f, b] = card.ord === 1 ? [n.back, n.front] : [n.front, n.back];
    return { q: Render.html(f), a: Render.html(b) + extra, source: n.source };
  }

  /* ---------- Recherche (même syntaxe dans l'app et pour les opérations de Claude) ---------- */
  function parseSearch(q) {
    const toks = []; const re = /(-?)(\w+):"([^"]*)"|(-?)(\w+):(\S+)|"([^"]*)"|(\S+)/g; let m;
    while ((m = re.exec(q || ''))) toks.push(m[2] ? { k: m[2].toLowerCase(), v: m[3].toLowerCase() } : m[5] ? { k: m[5].toLowerCase(), v: m[6].toLowerCase() } : { k: 'text', v: (m[7] ?? m[8]).toLowerCase() });
    return toks;
  }
  function search(q) {
    const toks = parseSearch(q), nm = new Map(data.notes.map(n => [n.id, n])), dm = new Map(data.decks.map(d => [d.id, d]));
    const t = today(), n0 = now(), out = [];
    for (const c of data.cards) {
      const n = nm.get(c.noteId); if (!n) continue; const d = dm.get(n.deckId);
      let ok = true;
      for (const tk of toks) {
        if (tk.k === 'deck') { const dn = (d?.name || '').toLowerCase(); ok = dn === tk.v || dn.startsWith(tk.v + '::') || (!tk.v.includes('::') && dn.includes(tk.v)); }
        else if (tk.k === 'tag') ok = n.tags.some(x => x.toLowerCase() === tk.v);
        else if (tk.k === 'type') ok = n.type === tk.v;
        else if (tk.k === 'is') ok = tk.v === 'new' ? c.state === 0 : tk.v === 'learn' ? (c.state === 1 || c.state === 3) : tk.v === 'review' ? c.state === 2 : tk.v === 'suspended' ? c.suspended : tk.v === 'leech' ? n.tags.includes('leech') : tk.v === 'due' ? !c.suspended && ((c.state === 2 && c.due <= t) || ((c.state === 1 || c.state === 3) && c.due <= n0)) : true;
        else ok = (n.front + ' ' + n.back + ' ' + n.extra + ' ' + n.source + ' ' + n.tags.join(' ')).toLowerCase().includes(tk.v);
        if (!ok) break;
      }
      if (ok) out.push({ c, n, d });
    }
    out.sort((a, b) => b.n.created - a.n.created || a.c.ord - b.c.ord);
    return out;
  }

  /** Opérations de tri demandées via un fichier de la boîte de réception (ex. par Claude) */
  function runOps(ops, res) {
    for (const [i, op] of ops.entries()) {
      const name = String(op.op || '').toLowerCase();
      const pick = () => {
        if (Array.isArray(op.ids)) return [...new Set(op.ids.map(String))].filter(id => data.notes.some(n => n.id === id));
        if (op.query) return [...new Set(search(op.query).map(r => r.n.id))];
        return null;
      };
      try {
        if (name === 'move') {
          const ids = pick(); if (!ids || !op.to) throw new Error('move : "to" et ("query" ou "ids") requis');
          res.moved += moveNotes(ids, op.to); res.decks.add(normName(op.to));
        } else if (name === 'tag') {
          const ids = pick(); if (!ids) throw new Error('tag : "query" ou "ids" requis');
          tagNotes(ids, op.add || [], op.remove || []); res.tagged += ids.length;
        } else if (name === 'create_deck') { addDeck(op.name, op.color); res.decks.add(normName(op.name)); res.created++; }
        else if (name === 'merge_decks') {
          const a = deckByName(op.from), b = deckByName(op.to); if (!a || !b) throw new Error('paquet introuvable : ' + (!a ? op.from : op.to));
          const m = mergeDecks(a.id, b.id, { dedupe: op.dedupe !== false, newName: op.name }); if (m.error) throw new Error(m.error);
          res.merged += m.moved; res.deduped += m.removed; res.decks.add(m.name);
        }
        else if (name === 'rename_deck') { const d = deckByName(op.from); if (!d) throw new Error('paquet introuvable : ' + op.from); renameDeck(d.id, op.to); res.decks.add(normName(op.to)); res.renamed++; }
        else if (name === 'color_deck') { const d = deckByName(op.name); if (!d) throw new Error('paquet introuvable : ' + op.name); d.color = /^#[0-9a-f]{6}$/i.test(String(op.color)) ? String(op.color).toLowerCase() : (Number(op.color) || 0); }
        else throw new Error('opération inconnue : ' + name);
      } catch (e) { res.errors.push(`Opération ${i + 1} — ${e.message}`); }
    }
  }
  /* ---------- Import (boîte de réception de Claude, fichiers, etc.) ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const TYPES = { basic: 'basic', simple: 'basic', cloze: 'cloze', trou: 'cloze', reversed: 'reversed', reverse: 'reversed', 'basic-reversed': 'reversed', recto_verso: 'reversed', inverse: 'reversed' };

  function importPayload(p, opts = {}) {
    const dry = !!opts.dryRun;
    const res = { added: 0, skipped: 0, moved: 0, tagged: 0, created: 0, renamed: 0, merged: 0, deduped: 0, errors: [], decks: new Set(), byDeck: {}, ops: 0 };
    const groups = Array.isArray(p) ? [{ cards: p }] : p.decks ? p.decks : [p];
    const existing = new Set(data.notes.map(n => n.deckId + '|' + n.type + '|' + norm(n.front)));
    for (const g of groups) {
      for (const [i, c] of (g.cards || []).entries()) {
        const type = TYPES[norm(c.type || 'basic')] || 'basic';
        const front = c.front ?? c.question ?? c.q ?? c.text ?? '';
        const back = c.back ?? c.answer ?? c.a ?? '';
        const deckName = c.deck || g.deck || g.name || 'Importé';
        if (!String(front).trim()) { res.errors.push(`Carte ${i + 1} : recto vide`); continue; }
        if (type === 'cloze' && !Render.clozeNumbers(front).length) { res.errors.push(`Carte ${i + 1} : aucun trou {{c1::…}}`); continue; }
        if (type !== 'cloze' && !String(back).trim()) { res.errors.push(`Carte ${i + 1} : verso vide`); continue; }
        const dname = normName(String(deckName)), existed = !!deckByName(dname);
        const deck = dry ? deckByName(dname) : addDeck(deckName);
        const key = (deck ? deck.id : 'new:' + dname.toLowerCase()) + '|' + type + '|' + norm(front);
        const bd = res.byDeck[dname] || (res.byDeck[dname] = { added: 0, skipped: 0, isNew: !existed });
        if (existing.has(key)) { res.skipped++; bd.skipped++; continue; }
        existing.add(key);
        if (dry) { res.added++; bd.added++; res.decks.add(dname); continue; }
        bd.added++;
        addNote({ deckId: deck.id, type, front: String(front), back: String(back), extra: String(c.extra ?? c.hint ?? ''), source: String(c.source ?? ''), tags: Array.isArray(c.tags) ? c.tags.map(String) : String(c.tags || '').split(/[,;]/) }, true);
        res.added++; res.decks.add(deck.name);
      }
    }
    if (Array.isArray(p.ops)) { res.ops = p.ops.length; if (!dry) runOps(p.ops, res); }
    if (!dry && res.added) save();
    return res;
  }

  async function pollInbox() {
    let items;
    try { items = await api('/api/inbox'); } catch (e) { return null; }
    if (!Array.isArray(items)) return null;
    if (!items.length) return null;
    const total = { added: 0, skipped: 0, moved: 0, tagged: 0, created: 0, renamed: 0, merged: 0, deduped: 0, errors: [], decks: new Set(), files: 0 };
    const done = [];
    for (const it of items) {
      try {
        const r = importPayload(JSON.parse(it.content.replace(/^﻿/, '')));
        total.added += r.added; total.skipped += r.skipped; total.moved += r.moved; total.tagged += r.tagged; total.created += r.created; total.renamed += r.renamed; total.merged += r.merged; total.deduped += r.deduped; total.errors.push(...r.errors.map(e => it.file + ' — ' + e));
        r.decks.forEach(d => total.decks.add(d)); total.files++;
      } catch (e) { total.errors.push(it.file + ' — JSON invalide : ' + e.message); }
      done.push(it.file);
    }
    await flush();
    try { await api('/api/inbox/ack', { method: 'POST', body: JSON.stringify({ files: done }) }); } catch (e) { }
    return total;
  }

  /* ---------- Files de révision ---------- */
  function todayEntries() {
    const t = today(), out = [];
    for (let i = data.revlog.length - 1; i >= 0 && data.revlog[i].day >= t; i--) out.push(data.revlog[i]);
    return out;
  }

  /** Compteurs et cartes disponibles pour un ensemble de paquets (null = tous) */
  function queues(scope, buried = new Set(), only = null) {
    const t = today(), n = now(), c = cfg();
    const te = todayEntries().filter(e => !scope || scope.has(e.deckId));
    const newDone = te.filter(e => e.state === 0).length;
    const revDone = te.filter(e => e.state === 2).length;
    const nm = noteMap();
    const ok = card => { const nt = nm.get(card.noteId); return nt && !card.suspended && !buried.has(card.id) && (!only || only.has(card.id)) && (!scope || scope.has(nt.deckId)); };
    const learn = [], review = [], fresh = [];
    for (const card of data.cards) {
      if (!ok(card)) continue;
      if (card.state === 1 || card.state === 3) learn.push(card);
      else if (card.state === 2) { if (card.due <= t) review.push(card); }
      else fresh.push(card);
    }
    fresh.sort((a, b) => a.due - b.due);
    return {
      learn, review, fresh,
      newLimit: only ? 99999 : Math.max(0, c.newPerDay - newDone),
      revLimit: only ? 99999 : Math.max(0, c.reviewsPerDay - revDone),
    };
  }

  function counts(scope, buried, only) {
    const q = queues(scope, buried, only), n = now();
    const learnNow = q.learn.filter(c => c.due <= n + cfg().learnAheadMin * 60000).length;
    return { new: Math.min(q.fresh.length, q.newLimit), learn: learnNow, review: Math.min(q.review.length, q.revLimit) };
  }

  /** Prochaine carte à étudier (ou null) */
  function nextCard(scope, buried, only) {
    const q = queues(scope, buried, only), n = now();
    const dueLearn = q.learn.filter(c => c.due <= n).sort((a, b) => a.due - b.due);
    if (dueLearn.length) return dueLearn[0];
    const revAvail = q.revLimit > 0 ? q.review : [];
    const pickNew = pool => (cfg().shuffle !== false ? pool[Math.floor(Math.random() * pool.length)] : pool[0]);
    const newAvail = q.newLimit > 0 ? q.fresh : [];
    if (revAvail.length && newAvail.length) {
      const nn = Math.min(newAvail.length, q.newLimit), rr = Math.min(revAvail.length, q.revLimit);
      if (Math.random() < nn / (nn + rr)) return pickNew(newAvail);
      return revAvail[Math.floor(Math.random() * revAvail.length)];
    }
    if (newAvail.length) return pickNew(newAvail);
    if (revAvail.length) return revAvail[Math.floor(Math.random() * revAvail.length)];
    const ahead = q.learn.filter(c => c.due <= n + cfg().learnAheadMin * 60000).sort((a, b) => a.due - b.due);
    return ahead[0] || null;
  }

  /** Enregistre une réponse. Renvoie l'état d'annulation. */
  function answerCard(card, rating, elapsedMs) {
    const prev = { ...card }, c = cfg(), t = now();
    const upd = Sched.answer(card, rating, c, t);
    Object.assign(card, upd);
    const note = noteById(card.noteId);
    const entry = { id: t, cardId: card.id, deckId: note ? note.deckId : null, rating, state: prev.state, lastIvl: prev.ivl, ivl: card.ivl, ease: card.ease, time: Math.min(elapsedMs || 0, 120000), day: today() };
    data.revlog.push(entry);
    let leech = false;
    if (rating === 1 && card.state !== 0 && card.lapses >= c.leechThreshold && card.lapses % Math.max(1, Math.floor(c.leechThreshold / 2)) === 0) {
      leech = true; card.suspended = true;
      if (note && !note.tags.includes('leech')) note.tags.push('leech');
    }
    save();
    return { prev, entry, leech };
  }
  function undoAnswer(card, u) {
    Object.assign(card, u.prev);
    const i = data.revlog.lastIndexOf(u.entry); if (i >= 0) data.revlog.splice(i, 1);
    save();
  }

  /* ---------- Statistiques ---------- */
  function stats() {
    const t = today();
    const byDay = new Map();
    for (const e of data.revlog) byDay.set(e.day, (byDay.get(e.day) || 0) + 1);
    if (data.daily) for (const [dd, cnt] of Object.entries(data.daily)) byDay.set(+dd, Math.max(byDay.get(+dd) || 0, cnt));
    let streak = 0, d = byDay.has(t) ? t : t - 1;
    while (byDay.has(d)) { streak++; d--; }
    let best = 0, run = 0; const days = [...byDay.keys()].sort((a, b) => a - b);
    days.forEach((day, i) => { run = i && day === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
    const forecast = Array(30).fill(0);
    const mat = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
    for (const c of data.cards) {
      if (c.suspended) { mat.suspended++; continue; }
      if (c.state === 0) mat.new++;
      else if (c.state === 1 || c.state === 3) mat.learning++;
      else { (c.ivl >= 21 ? mat.mature++ : mat.young++); forecast[Math.max(0, Math.min(29, c.due - t))]++; }
    }
    const since = t - 30; let rv = 0, ok = 0;
    for (let i = data.revlog.length - 1; i >= 0 && data.revlog[i].day >= since; i--) { const e = data.revlog[i]; if (e.state === 2) { rv++; if (e.rating > 1) ok++; } }
    const last30 = []; for (let i = 29; i >= 0; i--) last30.push({ day: t - i, n: byDay.get(t - i) || 0 });
    const timeToday = todayEntries().reduce((s, e) => s + e.time, 0);
    return { byDay, streak, best, forecast, mat, retention: rv ? ok / rv : null, retN: rv, last30, today: t, doneToday: byDay.get(t) || 0, timeToday, total: data.revlog.length };
  }

  return { claim, load, save, flush, useDriver, applyMerged, onChange, get data() { return data; }, cfg, today, now, api,
    addDeck, deckById, deckByName, deckColor, setDeckColor, moveNotes, tagNotes, search, deckScope, renameDeck, mergeDecks, dedupeScope, deleteDeck, noteById, addNote, updateNote, deleteNote, setSuspended, resetCard, resetProgress, wipeAll, faces, facesFor,
    importPayload, pollInbox, counts, nextCard, answerCard, undoAnswer, stats, ordsFor };
})();
