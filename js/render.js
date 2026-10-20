/* Mnémo — rendu du contenu des cartes : Markdown léger + maths KaTeX ($..$, $$..$$, \ce{}) + trous {{c1::..}} */
const Render = (() => {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

  function math(src, display) {
    try {
      return window.katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false });
    } catch (e) { return '<code>' + esc(src) + '</code>'; }
  }

  function inline(t) {
    return t
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  }

  function blocks(text) {
    const lines = text.split('\n'); const out = []; let list = null;
    const flush = () => { if (list) { out.push('<' + list.t + '>' + list.items.map(i => '<li>' + inline(i) + '</li>').join('') + '</' + list.t + '>'); list = null; } };
    for (const raw of lines) {
      let m;
      if ((m = raw.match(/^\s*[-•]\s+(.*)$/))) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); }
      else if ((m = raw.match(/^\s*\d+[.)]\s+(.*)$/))) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); }
      else { flush(); out.push(raw.trim() === '' ? '<div class="sp"></div>' : '<p>' + inline(raw) + '</p>'); }
    }
    flush();
    return out.join('');
  }

  /** mode : 'plain' | 'q' (cloze n masqué) | 'a' (cloze n révélé) ; n = numéro de trou actif */
  function html(text, mode = 'plain', n = 0) {
    if (text == null || text === '') return '';
    const store = [];
    let t = String(text).replace(/\r/g, '');
    const hold = h => { store.push(h); return '' + (store.length - 1) + ''; };
    t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => hold('<div class="math-block">' + math(m.trim(), true) + '</div>'));
    t = t.replace(/\$(?!\s)([^$\n]+?)\$/g, (all, m) => /\s$/.test(m) ? all : hold(math(m, false)));   // (sans lookbehind : compatible anciens iPhone)
    t = esc(t);
    if (mode !== 'plain') {
      t = t.replace(CLOZE, (_, num, content, hint) => {
        const active = Number(num) === n;
        if (!active) return content;
        if (mode === 'q') return '<span class="cloze cloze-hidden">' + (hint ? '[' + hint + ']' : '[…]') + '</span>';
        return '<span class="cloze cloze-shown">' + content + '</span>';
      });
    } else {
      t = t.replace(CLOZE, (_, num, content) => content);
    }
    t = blocks(t);
    return t.replace(/(\d+)/g, (_, i) => store[Number(i)]);
  }

  /** Numéros de trous présents dans un texte, triés */
  function clozeNumbers(text) {
    const set = new Set(); let m; const re = new RegExp(CLOZE.source, 'g');
    while ((m = re.exec(text || ''))) set.add(Number(m[1]));
    return [...set].sort((a, b) => a - b);
  }

  /** Texte brut (pour listes/recherche) */
  function plain(text) {
    return String(text || '').replace(CLOZE, (_, n, c) => c).replace(/\$\$?([^$]+)\$\$?/g, '$1').replace(/[*`=]/g, '').replace(/\s+/g, ' ').trim();
  }

  return { html, clozeNumbers, plain, esc };
})();
