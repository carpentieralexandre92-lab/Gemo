/* Les Gémo — lecture tolérante des fichiers de cartes : JSON (format Les Gémo), tableau Markdown, CSV/TSV (dont export texte d'Anki), listes Question/Réponse */
const Importer = (() => {
  const strip = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const FIELDS = {
    front: ['recto', 'question', 'front', 'q', 'avant', 'terme', 'mot', 'carte', 'texte', 'text', 'enonce'],
    back: ['verso', 'reponse', 'answer', 'back', 'r', 'a', 'arriere', 'definition', 'traduction', 'solution'],
    extra: ['astuce', 'extra', 'indice', 'hint', 'note', 'notes', 'mnemotechnique', 'complement'],
    source: ['source', 'origine', 'page', 'reference'],
    tags: ['tags', 'tag', 'etiquettes', 'etiquette', 'labels', 'mots cles'],
    deck: ['paquet', 'deck', 'chapitre', 'matiere', 'categorie', 'theme', 'cours'],
    type: ['type', 'genre', 'notetype', 'type de carte'],
  };
  const fieldOf = h => { const k = strip(h); for (const f in FIELDS) if (FIELDS[f].includes(k)) return f; return null; };
  const HTML_TAG = /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i;
  const htmlToText = s => !HTML_TAG.test(s) ? s : s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|tr)>/gi, '\n').replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

  /* ---------- JSON (avec ou sans bloc ```json copié depuis un chat) ---------- */
  function tryJson(text) {
    let t = text.replace(/^﻿/, '').trim();
    const fence = t.match(/```(?:json|JSON)?\s*\n([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    if (!/^[\[{]/.test(t)) { const i = t.search(/[\[{]/), j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')); if (i >= 0 && j > i && /"cards"|"decks"|"ops"|"front"|"question"/i.test(t)) t = t.slice(i, j + 1); else return null; }
    try { return { payload: JSON.parse(t) }; }
    catch (e) { return { error: 'JSON invalide : ' + e.message }; }
  }

  /* ---------- tableau Markdown ---------- */
  function tryMarkdownTable(text) {
    const lines = text.split(/\r?\n/).filter(l => /^\s*\|.*\|\s*$/.test(l));
    if (lines.length < 2) return null;
    const rows = lines.map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    const data = rows.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c) || c === ''));
    return data.length ? rowsToCards(data, {}) : null;
  }

  /* ---------- blocs Question / Réponse ---------- */
  function tryQA(text) {
    const qre = /^\s*(?:[-*•]\s*)?(?:\*\*)?(?:q|question)\s*\d*(?:\*\*)?\s*[:.)\-–—]\s*(.*)$/i, are = /^\s*(?:[-*•]\s*)?(?:\*\*)?(?:r|a|reponse|réponse|answer)(?:\*\*)?\s*[:.)\-–—]\s*(.*)$/i;
    const cards = []; let cur = null, mode = null;
    const push = () => { if (cur && cur.front.trim() && cur.back.trim()) cards.push({ front: cur.front.trim(), back: cur.back.trim() }); };
    for (const line of text.split(/\r?\n/)) {
      let m;
      if ((m = line.match(qre))) { push(); cur = { front: m[1], back: '' }; mode = 'front'; }
      else if (cur && (m = line.match(are))) { cur.back = m[1]; mode = 'back'; }
      else if (cur && line.trim()) cur[mode] += '\n' + line.trim();
    }
    push();
    return cards.length ? { payload: { cards } } : null;
  }

  /* ---------- CSV / TSV / export texte d'Anki ---------- */
  function parseDelimited(text, d) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(x => x !== '')) rows.push(row);
    return rows;
  }
  function tryDelimited(name, text) {
    const meta = {}, lines = [];
    for (const l of text.replace(/^﻿/, '').split(/\r?\n/)) {
      if (l.startsWith('#')) { const m = l.match(/^#\s*([a-z ]+?)\s*:\s*(.+)$/i); if (m) meta[m[1].toLowerCase()] = m[2].trim(); }
      else lines.push(l);
    }
    const body = lines.join('\n');
    const first = lines.find(l => l.trim()) || '';
    let delim = { tab: '\t', semicolon: ';', comma: ',', pipe: '|', space: ' ' }[(meta.separator || '').toLowerCase()];
    if (!delim) {
      const cnt = d => first.split(d).length - 1, best = ['\t', ';', ',', '|'].map(d => [d, cnt(d)]).sort((a, b) => b[1] - a[1])[0];
      if (best[1] > 0) delim = best[0]; else return null;
    }
    const rows = parseDelimited(body, delim);
    if (rows.length < 2 || rows[0].length < 2) return null;
    const hdr = rows[0].map(fieldOf), hasHeader = hdr.includes('front') && hdr.includes('back');
    if (!hasHeader) { const n = rows[0].length; if (rows.filter(r => r.length === n).length / rows.length < 0.8) return null; }
    const opt = {}; if (meta['tags column']) opt.tagsCol = +meta['tags column'] - 1; if (meta['deck column']) opt.deckCol = +meta['deck column'] - 1;
    return rowsToCards(rows, opt);
  }

  function rowsToCards(rows, opt) {
    const map = rows[0].map(fieldOf), isHeader = map.includes('front') && map.includes('back');
    const cols = {}; let data = rows;
    if (isHeader) { map.forEach((f, i) => { if (f && !(f in cols)) cols[f] = i; }); data = rows.slice(1); }
    else { cols.front = 0; cols.back = 1; if (opt.tagsCol != null) cols.tags = opt.tagsCol; else if (rows[0].length >= 3) cols.tags = 2; if (opt.deckCol != null) cols.deck = opt.deckCol; }
    const cards = [];
    for (const r of data) {
      const g = k => (cols[k] != null && r[cols[k]] != null) ? htmlToText(String(r[cols[k]])).trim() : '';
      const c = { front: g('front'), back: g('back') };
      if (!c.front) continue;
      for (const k of ['extra', 'source', 'deck', 'type']) { const v = g(k); if (v) c[k] = v; }
      const t = g('tags'); if (t) c.tags = t.split(/[,;\s]+/).filter(Boolean);
      cards.push(c);
    }
    return cards.length ? { payload: { cards } } : null;
  }

  /** Analyse un contenu texte ; renvoie { payload, format } ou { error } */
  function parseText(name, text) {
    if (!text || !text.trim()) return { error: 'vide' };
    const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
    const tries = ext === 'csv' || ext === 'tsv'
      ? [['CSV', () => tryDelimited(name, text)], ['JSON', () => tryJson(text)], ['Tableau', () => tryMarkdownTable(text)], ['Questions/Réponses', () => tryQA(text)]]
      : [['JSON', () => tryJson(text)], ['Tableau', () => tryMarkdownTable(text)], ['Questions/Réponses', () => tryQA(text)], ['CSV', () => tryDelimited(name, text)]];
    let firstErr = null;
    for (const [fmt, fn] of tries) {
      let r; try { r = fn(); } catch (e) { r = null; }
      if (!r) continue;
      if (r.error) return { error: r.error };
      return { payload: r.payload, format: fmt };
    }
    return { error: firstErr || 'Format non reconnu (attendu : JSON de Les Gémo, tableau, CSV, ou liste Question / Réponse).' };
  }

  function toGroups(p) {
    if (Array.isArray(p)) return { groups: [{ cards: p }], ops: [] };
    if (!p || typeof p !== 'object') return { groups: [], ops: [] };
    const ops = Array.isArray(p.ops) ? p.ops : [];
    if (Array.isArray(p.decks)) return { groups: p.decks.map(g => ({ deck: g.deck || g.name, cards: g.cards || g.flashcards || [] })), ops };
    const cards = p.cards || p.flashcards || p.items;
    if (Array.isArray(cards)) return { groups: [{ deck: p.deck || p.name, cards }], ops };
    return { groups: [], ops };
  }

  /** Assemble plusieurs sources : applique le paquet par défaut et les remplacements de paquets (deckMap). */
  function build(sources, defaultDeck, deckMap) {
    const groups = [], ops = [], formats = [], errors = [];
    for (const s of sources) {
      const r = parseText(s.name, s.text);
      if (r.error) { errors.push(`${s.name} : ${r.error}`); continue; }
      formats.push(`${s.name} (${r.format})`);
      const g = toGroups(r.payload); ops.push(...g.ops);
      for (const grp of g.groups) groups.push({ deck: grp.deck, cards: (grp.cards || []).map(c => ({ ...c })) });
    }
    const map = n => (deckMap && deckMap[n]) || n;
    for (const g of groups) {
      const gd = (g.deck || '').trim();
      g.deck = map(gd || defaultDeck || 'Importé');
      for (const c of g.cards) {
        if (c.deck) c.deck = map(String(c.deck).trim());
        const f = c.front ?? c.question ?? c.q ?? c.text ?? '';
        if (!c.type && /\{\{c\d+::/.test(String(f))) c.type = 'cloze';
      }
    }
    return { payload: { decks: groups, ops }, formats, errors };
  }

  /** Paquets existants dont le nom ressemble à `name` (même matière) sans être identique */
  const KEYSTOP = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'de', 'du', 'des', 'd', 'et', 'en']);
  const key = s => strip(s).split(' ').filter(w => w && !KEYSTOP.has(w));
  function near(name, existing) {
    const parts = name.split('::'); if (parts.length < 2 || existing.some(e => e.toLowerCase() === name.toLowerCase())) return [];
    const lk = key(parts[parts.length - 1]), out = [];
    for (const n of existing) {
      const np = n.split('::'); if (np.length < 2 || np[0].toLowerCase() !== parts[0].toLowerCase()) continue;
      const nk = key(np[np.length - 1]); if (!nk.length || !lk.length) continue;
      const inter = lk.filter(w => nk.includes(w)).length;
      if (inter > 0 && inter >= Math.min(lk.length, nk.length)) out.push(n);
    }
    return out;
  }

  return { parseText, build, near };
})();
