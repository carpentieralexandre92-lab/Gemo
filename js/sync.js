/* Les Gémo — synchronisation PC ⇄ iPhone via un Gist GitHub privé.
   Fusion « à trois versions » : copie locale (L), copie distante (R) et dernière version commune (B, stockée dans IndexedDB).
   Un élément n'est retenu que si l'un des côtés l'a réellement modifié depuis B ; l'historique des révisions est cumulé. */
const Sync = (() => {
  const FILE = 'gemo-sync.json', DEF_API = 'https://api.github.com', COMPACT_DAYS = 120, EMPTY = () => ({ decks: [], notes: [], cards: [], revlog: [], daily: {}, nextPos: 1 });

  /* ---------- petit stockage clé/valeur (jeton, version commune) ---------- */
  const idb = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('gemo-sync', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode); const rq = fn(t.objectStore('kv')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); };
    return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
  })();

  /* ---------- fusion ---------- */
  const stable = v => v === undefined ? 'u' : JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
  const clone = v => JSON.parse(JSON.stringify(v));

  function conflict(kind, l, r) {
    if (!l) return r; if (!r) return l;                       // supprimé d'un côté, modifié de l'autre : on garde la modification
    if (kind === 'cards') return (r.last || 0) > (l.last || 0) ? r : l;
    if (kind === 'notes') return (r.modified || 0) > (l.modified || 0) ? r : l;
    return l;
  }
  function mergeList(l, r, b, kind) {
    const idx = a => new Map(a.map(x => [x.id, x])), L = idx(l), R = idx(r), B = idx(b);
    const ids = [...new Set([...L.keys(), ...R.keys(), ...B.keys()])], out = [];
    for (const id of ids) {
      const lv = L.get(id), rv = R.get(id), bv = B.get(id);
      const sl = stable(lv), sr = stable(rv), sb = stable(bv);
      const pick = sl === sr ? lv : sl === sb ? rv : sr === sb ? lv : conflict(kind, lv, rv);
      if (pick) out.push(pick);
    }
    return out;
  }
  function compactRevlog(revlog, daily, today) {
    const keep = [], d = { ...daily }, cnt = {}, cutoff = today - COMPACT_DAYS;
    for (const e of revlog) { if (e.day < cutoff) cnt[e.day] = (cnt[e.day] || 0) + 1; else keep.push(e); }
    for (const k in cnt) d[k] = Math.max(d[k] || 0, cnt[k]);
    return { revlog: keep, daily: d };
  }
  /** L, R : { decks, notes, cards, revlog, daily, nextPos } ; B : { decks, notes, cards } ; opts.today : numéro du jour courant */
  function merge(L, R, B, opts = {}) {
    B = B || { decks: [], notes: [], cards: [] };
    const out = {
      decks: mergeList(L.decks || [], R.decks || [], B.decks || [], 'decks'),
      notes: mergeList(L.notes || [], R.notes || [], B.notes || [], 'notes'),
      cards: mergeList(L.cards || [], R.cards || [], B.cards || [], 'cards'),
    };
    // historique : union
    const seen = new Map();
    for (const e of [...(L.revlog || []), ...(R.revlog || [])]) { const k = e.id + '|' + e.cardId; if (!seen.has(k)) seen.set(k, e); }
    let revlog = [...seen.values()].sort((a, b) => a.id - b.id);
    let daily = { ...(L.daily || {}) }; for (const [k, v] of Object.entries(R.daily || {})) daily[k] = Math.max(daily[k] || 0, v);
    if (opts.today != null) ({ revlog, daily } = compactRevlog(revlog, daily, opts.today));
    out.revlog = revlog; out.daily = daily; out.nextPos = Math.max(L.nextPos || 1, R.nextPos || 1);
    // cohérence : cartes sans note supprimées ; notes sans paquet → on retrouve le paquet
    const noteIds = new Set(out.notes.map(n => n.id)); out.cards = out.cards.filter(c => noteIds.has(c.noteId));
    const deckIds = new Set(out.decks.map(d => d.id)), pool = new Map([...(B.decks || []), ...(R.decks || []), ...(L.decks || [])].map(d => [d.id, d]));
    let lost = null;
    for (const n of out.notes) if (!deckIds.has(n.deckId)) {
      const d = pool.get(n.deckId) || lost || (lost = { id: 'recovered-' + Date.now().toString(36), name: 'Récupéré', color: 0, created: Date.now() });
      if (!deckIds.has(d.id)) { out.decks.push(d); deckIds.add(d.id); } n.deckId = d.id;
    }
    return out;
  }
  const snapshot = d => ({ decks: d.decks, notes: d.notes, cards: d.cards, revlog: d.revlog, daily: d.daily || {}, nextPos: d.nextPos });
  const sameData = (a, b) => ['decks', 'notes', 'cards', 'daily', 'nextPos'].every(k => stable(a[k]) === stable(b[k])) && (a.revlog || []).length === (b.revlog || []).length;

  /* ---------- configuration (jeton + gist), propre à chaque appareil ---------- */
  let conf = null, running = null;
  const saveConf = () => conf ? idb.set('conf', conf) : idb.del('conf');
  async function init() { try { conf = (await idb.get('conf')) || null; } catch (e) { conf = null; } return !!conf; }
  const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  const pairingCode = () => conf ? 'GEMO1-' + b64(JSON.stringify({ g: conf.gistId, t: conf.token, ...(conf.api ? { a: conf.api } : {}) })) : '';
  function parseCode(code) {
    const m = String(code || '').trim().replace(/\s+/g, '').match(/GEMO1-([A-Za-z0-9_-]+)/); if (!m) throw new Error('Code d\'appairage invalide.');
    let j; try { j = JSON.parse(unb64(m[1])); } catch (e) { throw new Error('Code d\'appairage illisible (copié en entier ?).'); }
    if (!j.g || !j.t) throw new Error('Code d\'appairage incomplet.'); return { gistId: j.g, token: j.t, api: j.a };
  }

  /* ---------- GitHub ---------- */
  async function gh(path, opts = {}, c = conf) {
    const r = await fetch((c.api || DEF_API) + path, { ...opts, headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401) throw Object.assign(new Error('Clé GitHub refusée (expirée ou incorrecte).'), { code: 'auth' });
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error('GitHub limite les requêtes : réessaie dans quelques minutes.'), { code: 'rate' });
    if (r.status === 404) throw Object.assign(new Error('Espace de sauvegarde introuvable (clé sans droit « gist », ou supprimé).'), { code: 'notfound' });
    if (!r.ok) throw new Error('GitHub : erreur ' + r.status);
    return r.json();
  }
  async function readRemote() {
    const g = await gh('/gists/' + conf.gistId), f = g.files && g.files[FILE]; if (!f) return null;
    let text = f.content; if (f.truncated || text == null) text = await (await fetch(f.raw_url)).text();
    if (!text || !text.trim() || text.trim() === '{}') return null;
    return JSON.parse(text);
  }
  const push = payload => gh('/gists/' + conf.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(payload) } } }) });
  const describe = e => (e && e.code === undefined && /Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))) ? 'Pas de connexion internet.' : (e && e.message) || String(e);

  /* ---------- synchronisation ---------- */
  function run() {
    if (!conf) return Promise.reject(new Error('Synchronisation non configurée.'));
    if (running) return running;
    running = (async () => {
      try {
        const rem = await readRemote(), base = (await idb.get('base')) || { decks: [], notes: [], cards: [] };
        const data = Store.data, today = Sched.dayIndex(Date.now(), Store.cfg().rolloverHour);
        const m = merge(snapshot(data), rem || EMPTY(), base, { today });
        const baseSnap = clone({ decks: m.decks, notes: m.notes, cards: m.cards });
        const payload = { v: 1, t: Date.now(), decks: m.decks, notes: m.notes, cards: m.cards, revlog: m.revlog, daily: m.daily, nextPos: m.nextPos };
        const remoteSame = rem && sameData(payload, rem);
        const localSame = sameData(m, snapshot(data));
        if (!remoteSame) await push(payload);
        if (!localSame) Store.applyMerged(m);
        await idb.set('base', baseSnap);
        conf.last = Date.now(); conf.error = null; await saveConf();
        return { ok: true, pulled: !localSame, pushed: !remoteSame };
      } catch (e) { if (conf) { conf.error = describe(e); await saveConf(); } throw e; }
      finally { running = null; }
    })();
    return running;
  }
  /** PC : crée l'espace de sauvegarde privé avec la clé GitHub, puis envoie toutes les cartes. */
  async function setup(token, api) {
    const c = { token: String(token || '').trim(), api: api || undefined };
    if (!c.token) throw new Error('Colle ta clé GitHub.');
    const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Les Gémo — sauvegarde synchronisée (ne pas modifier)', public: false, files: { [FILE]: { content: '{}' } } }) }, c);
    conf = { token: c.token, gistId: g.id, api: c.api, created: Date.now() }; await saveConf(); await idb.del('base');
    return run();
  }
  /** iPhone : rejoint l'espace existant grâce au code d'appairage. */
  async function join(code) {
    const p = parseCode(code); conf = { token: p.token, gistId: p.gistId, api: p.api, created: Date.now() }; await saveConf(); await idb.del('base');
    try { return await run(); } catch (e) { conf = null; await saveConf(); throw e; }
  }
  async function disable() { conf = null; await saveConf(); await idb.del('base'); }
  const status = () => ({ configured: !!conf, last: conf && conf.last || 0, error: conf && conf.error || null, running: !!running });

  return { init, run, setup, join, disable, status, pairingCode, merge, compactRevlog, describe };
})();
