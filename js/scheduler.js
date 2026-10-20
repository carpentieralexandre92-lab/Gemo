/* Mnémo — moteur de répétition espacée (famille SM-2, comportement proche d'Anki)
   États : 0 nouvelle · 1 apprentissage · 2 révision · 3 réapprentissage
   due : ms (états 1 et 3) ou numéro de jour (état 2) ; nouvelles : position dans la file */
const Sched = (() => {
  const MIN = 60000, DAY = 86400000;

  const defaults = {
    newPerDay: 20,
    reviewsPerDay: 200,
    learnSteps: [1, 10],        // minutes
    relearnSteps: [10],         // minutes
    graduatingInterval: 1,      // jours
    easyInterval: 4,            // jours
    startEase: 2.5,
    easyBonus: 1.3,
    hardMultiplier: 1.2,
    lapseMultiplier: 0.25,
    intervalModifier: 1.0,
    maxInterval: 36500,
    rolloverHour: 4,
    leechThreshold: 8,
    learnAheadMin: 20,
    shuffle: true,             // mélange l'ordre des nouvelles cartes à la révision
  };

  function dayIndex(now, rollover = 4) {
    const d = new Date(now - rollover * 3600000);
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY);
  }

  function newCard(noteId, ord, position, cfg) {
    return { id: uid(), noteId, ord, state: 0, due: position, ivl: 0, ease: cfg.startEase,
             reps: 0, lapses: 0, step: 0, suspended: false, last: 0 };
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const steps = (cfg, relearn) => (relearn ? cfg.relearnSteps : cfg.learnSteps).map(m => m * MIN);

  function fuzzed(ivl) {
    if (ivl < 7) return ivl;
    const r = Math.max(1, Math.round(ivl * (ivl < 20 ? 0.08 : 0.05)));
    return ivl - r + Math.floor(Math.random() * (2 * r + 1));
  }

  function graduate(c, cfg, easy, today) {
    c.state = 2; c.step = 0;
    c.ivl = easy ? cfg.easyInterval : cfg.graduatingInterval;
    c.due = today + c.ivl;
  }

  /** Applique une réponse (1 Encore · 2 Difficile · 3 Bien · 4 Facile). Renvoie une copie. */
  function answer(card, rating, cfg, now, fuzz = true) {
    const c = { ...card };
    const today = dayIndex(now, cfg.rolloverHour);
    c.reps = (c.reps || 0) + 1; c.last = now;

    if (c.state === 0 || c.state === 1) {
      const st = steps(cfg, false);
      if (c.state === 0) { c.state = 1; c.step = 0; }
      if (!st.length) { graduate(c, cfg, rating === 4, today); return c; }
      if (c.step >= st.length) c.step = st.length - 1;
      switch (rating) {
        case 1: c.step = 0; c.due = now + st[0]; break;
        case 2:
          c.due = now + (c.step === 0 ? (st.length > 1 ? (st[0] + st[1]) / 2 : st[0] * 1.5) : st[c.step]);
          break;
        case 3:
          if (c.step + 1 < st.length) { c.step++; c.due = now + st[c.step]; }
          else graduate(c, cfg, false, today);
          break;
        case 4: graduate(c, cfg, true, today); break;
      }
      return c;
    }

    if (c.state === 2) {
      const late = Math.max(0, today - c.due);
      const mod = cfg.intervalModifier;
      if (rating === 1) {
        c.lapses = (c.lapses || 0) + 1;
        c.ease = Math.max(1.3, c.ease - 0.2);
        c.ivl = Math.max(1, Math.round(c.ivl * cfg.lapseMultiplier));
        const rs = steps(cfg, true);
        if (rs.length) { c.state = 3; c.step = 0; c.due = now + rs[0]; }
        else c.due = today + c.ivl;
        return c;
      }
      const hard = Math.max(c.ivl + 1, Math.round((c.ivl + late / 4) * cfg.hardMultiplier * mod));
      const good = Math.max(hard + 1, Math.round((c.ivl + late / 2) * c.ease * mod));
      const easy = Math.max(good + 1, Math.round((c.ivl + late) * c.ease * cfg.easyBonus * mod));
      let ivl = rating === 2 ? hard : rating === 3 ? good : easy;
      if (rating === 2) c.ease = Math.max(1.3, c.ease - 0.15);
      if (rating === 4) c.ease = c.ease + 0.15;
      ivl = Math.min(cfg.maxInterval, ivl);
      if (fuzz) ivl = Math.max(c.ivl + 1, fuzzed(ivl));
      c.ivl = ivl; c.due = today + ivl;
      return c;
    }

    // État 3 : réapprentissage
    const rs = steps(cfg, true);
    if (!rs.length) { c.state = 2; c.due = today + c.ivl; return c; }
    if (c.step >= rs.length) c.step = rs.length - 1;
    switch (rating) {
      case 1: c.step = 0; c.due = now + rs[0]; break;
      case 2: c.due = now + rs[c.step]; break;
      case 3:
        if (c.step + 1 < rs.length) { c.step++; c.due = now + rs[c.step]; }
        else { c.state = 2; c.step = 0; c.due = today + c.ivl; }
        break;
      case 4: c.state = 2; c.step = 0; c.ivl = c.ivl + 1; c.due = today + c.ivl; break;
    }
    return c;
  }

  /* ---------- Formatage ---------- */
  function fmtMs(ms) {
    const m = ms / MIN;
    if (m < 1) return '< 1 min';
    if (m < 60) return Math.round(m) + ' min';
    const h = m / 60;
    if (h < 24) return Math.round(h) + ' h';
    return fmtDays(Math.round(h / 24));
  }
  function fmtDays(d) {
    if (d < 30) return d + ' j';
    if (d < 365) { const mo = d / 30; return (mo < 10 ? mo.toFixed(1).replace('.', ',').replace(',0', '') : Math.round(mo)) + ' mois'; }
    const y = d / 365; return (y.toFixed(1).replace('.', ',').replace(',0', '')) + (y >= 2 ? ' ans' : ' an');
  }

  /** Libellés des 4 boutons : { 1:'< 1 min', 2:'6 min', 3:'10 min', 4:'4 j' } */
  function preview(card, cfg, now) {
    const out = {};
    for (let r = 1; r <= 4; r++) {
      const n = answer(card, r, cfg, now, false);
      out[r] = n.state === 2 ? fmtDays(Math.max(1, n.ivl)) : fmtMs(Math.max(0, n.due - now));
    }
    return out;
  }

  return { defaults, dayIndex, newCard, answer, preview, fmtDays, fmtMs, uid, MIN, DAY };
})();
