(() => {
  'use strict';

  const M = window.Music;
  const Sound = M.Sound;
  const VIEWS = ['quiz', 'list', 'piano', 'record', 'about'];
  const CLEF_OPTS = {
    treble: { label: 'ト音記号', hint: '右手のパートやメロディーでよく使う記号です。' },
    bass: { label: 'ヘ音記号', hint: '左手のパートや低い楽器で使う記号です。' },
    both: { label: '両方', hint: 'ト音記号とヘ音記号の問題がまざって出ます。' },
    grand: { label: '大譜表', hint: 'ピアノの楽譜と同じ、ト音記号とヘ音記号を上下に並べた譜表で出題します。' }
  };
  const LEVELS = { '-1': '五線の中だけ', 0: '加線なし', 1: '加線1本まで', 2: '加線2本まで', 3: '加線3本まで' };
  const LEVEL_KEYS = [-1, 0, 1, 2, 3];
  const SPEED_SEC = 60;

  const MODES = [
    { id: 'read', title: '五線譜を読む', desc: '五線譜の音符を見て、音名を答える', icon: 'staff' },
    { id: 'key', title: '鍵盤で答える', desc: '五線譜の音符を見て、鍵盤の正しい場所を押す', icon: 'piano' },
    { id: 'find', title: '五線譜から探す', desc: '音名を見て、その音の五線譜を4つから選ぶ', icon: 'find' },
    { id: 'earStaff', title: '聴いて五線譜を選ぶ', desc: '鳴った音を聴いて、その音の五線譜を選ぶ', icon: 'earStaff' },
    { id: 'earName', title: '聴いて音名を答える', desc: '鳴った音を聴いて、音名を答える', icon: 'ear' },
    { id: 'speed', title: '60秒スピード読み', desc: '60秒で何問読めるか。毎日の腕だめしに', icon: 'timer' }
  ];
  const EAR_MODES = ['earStaff', 'earName'];

  // ---------- storage (always optional) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('gy.' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('gy.' + key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
    }
  };

  const settings = Object.assign(
    {
      clef: 'treble', level: 1, sys: 'doremi', count: '10', acc: false, weak: true, auto: false, sound: true,
      ref: false, ear: 'far', volume: '0.55', keyLabels: 'c', goal: '20',
      filter: 'all', notes: 1, tone: 'piano', dur: '1',
      listClef: 'treble', listHide: false, listAcc: false, pvFlat: false, pvLabels: 'c', recClef: 'treble'
    },
    store.get('settings', {})
  );
  if (!CLEF_OPTS[settings.clef]) settings.clef = 'treble';
  if (!M.SYSTEMS[settings.sys]) settings.sys = 'doremi';
  settings.level = Math.max(-1, Math.min(3, +settings.level || 0));
  settings.notes = Math.max(1, Math.min(3, +settings.notes || 1));
  if (!['all', 'line', 'space', 'ceg'].includes(settings.filter)) settings.filter = 'all';
  let stats = store.get('stats', {});   // "treble:G4": { a, c }
  let days = store.get('days', {});     // "2026-10-08": { a, c }
  let bests = store.get('bests', {});   // スピード読み: { "treble:1:n": { s, a, d } }
  const saveSettings = () => { store.set('settings', settings); renderSummary(); };
  Sound.setVolume(+settings.volume);
  Sound.setType(settings.tone);
  Sound.setDur(settings.dur);

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const sample = (arr, n) => shuffle(arr).slice(0, n);
  const pad = (v) => String(v).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const nm = (n) => M.name(n, settings.sys);
  const clefLabel = (c) => M.CLEFS[c].label;
  const pct = (s) => (s && s.a ? Math.round((100 * s.c) / s.a) : null);

  /** 音名と、科学的表記・日本式のオクターブ */
  const fullName = (n) => `${nm(n)}<small>（${M.sci(n)}）</small>`;

  function segmented(container, options, current, onChange) {
    container.innerHTML = '';
    Object.entries(options).forEach(([value, label]) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(value === String(current)));
      b.addEventListener('click', () => {
        container.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        onChange(value);
      });
      container.appendChild(b);
    });
  }

  // 最初の操作で音を使えるようにする（ブラウザの自動再生の制限のため）
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true, capture: true });
  document.addEventListener('keydown', () => Sound.unlock(), { once: true, capture: true });

  // ---------- theme ----------
  const themeBtn = $('#themeBtn');
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('gy.theme', next); } catch (e) { /* ignore */ }
  });

  // ---------- views ----------
  let current = store.get('view', 'quiz');
  if (!VIEWS.includes(current)) current = 'quiz';
  function show(view) {
    if (quiz && view !== 'quiz') stopQuiz();
    current = view;
    store.set('view', view);
    VIEWS.forEach((v) => { $('#view-' + v).hidden = v !== view; });
    document.querySelectorAll('.nav-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.view === view)));
    if (view === 'quiz') renderToday();
    if (view === 'list') renderList();
    if (view === 'piano') renderPiano();
    if (view === 'record') renderRecord();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

  // ---------- 記録 ----------
  function record(clef, n, ok) {
    const k = clef + ':' + n.id;
    const s = stats[k] || (stats[k] = { a: 0, c: 0 });
    s.a++; if (ok) s.c++;
    const d = dayKey();
    const t = days[d] || (days[d] = { a: 0, c: 0 });
    t.a++; if (ok) t.c++;
    store.set('stats', stats);
    store.set('days', days);
  }
  function streak() {
    let n = 0;
    const d = new Date();
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1); // 今日まだなら昨日から数える
    while (days[dayKey(d)] && days[dayKey(d)].a > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------- Quiz setup ----------
  const ICONS = {
    staff: '<svg viewBox="0 0 48 28"><path d="M2 4h44M2 9h44M2 14h44M2 19h44M2 24h44"/><ellipse class="f" cx="20" cy="16.5" rx="3.6" ry="2.6" transform="rotate(-22 20 16.5)"/><path d="M23.2 16V3"/><ellipse class="f" cx="32" cy="9" rx="3.6" ry="2.6" transform="rotate(-22 32 9)"/><path d="M28.8 9.5V22"/></svg>',
    piano: '<svg viewBox="0 0 48 28"><rect x="4" y="3" width="40" height="22" rx="2"/><path d="M12 25V3M20 25V3M28 25V3M36 25V3"/><path class="f" d="M10 3h4v12h-4zM18 3h4v12h-4zM34 3h4v12h-4z"/></svg>',
    find: '<svg viewBox="0 0 48 28"><rect x="3" y="3" width="18" height="10" rx="2"/><rect x="27" y="3" width="18" height="10" rx="2"/><rect x="3" y="16" width="18" height="10" rx="2"/><rect class="hl" x="27" y="16" width="18" height="10" rx="2"/><ellipse class="f" cx="36" cy="21" rx="2.6" ry="1.9" transform="rotate(-22 36 21)"/></svg>',
    earStaff: '<svg viewBox="0 0 48 28"><path d="M6 11h4l6-5v16l-6-5H6z"/><path d="M20 9c2 2.6 2 7.4 0 10M24 6c3.6 4.4 3.6 11.6 0 16"/><path d="M30 8h16M30 12h16M30 16h16M30 20h16"/><ellipse class="f" cx="38" cy="14" rx="2.6" ry="1.9" transform="rotate(-22 38 14)"/></svg>',
    ear: '<svg viewBox="0 0 48 28"><path d="M8 11h4l6-5v16l-6-5H8z"/><path d="M22 9c2 2.6 2 7.4 0 10M26 6c3.6 4.4 3.6 11.6 0 16"/><text x="31" y="19" class="t">ソ?</text></svg>',
    timer: '<svg viewBox="0 0 48 28"><circle cx="24" cy="15.5" r="10"/><path d="M24 15.5V9.5M24 15.5l4 2.5M21 3h6M33 7l2-2"/></svg>'
  };

  const FILTERS = {
    all: 'すべての音',
    line: '線の上の音だけ',
    space: '線の間の音だけ',
    ceg: 'ドミソだけ'
  };
  const FILTER_SHORT = { all: null, line: '線の音', space: '間の音', ceg: 'ドミソ' };

  // 初めての人向けの順番。押すと出題の設定がまとめて切り替わる
  const STEPS = [
    { t: 'ドミソ', s: { clef: 'treble', level: 1, filter: 'ceg', notes: 1, acc: false } },
    { t: '線の音', s: { clef: 'treble', level: -1, filter: 'line', notes: 1, acc: false } },
    { t: '間の音', s: { clef: 'treble', level: -1, filter: 'space', notes: 1, acc: false } },
    { t: '五線の中ぜんぶ', s: { clef: 'treble', level: -1, filter: 'all', notes: 1, acc: false } },
    { t: '2つ続けて', s: { clef: 'treble', level: 0, filter: 'all', notes: 2, acc: false } },
    { t: '加線1本まで', s: { clef: 'treble', level: 1, filter: 'all', notes: 1, acc: false } },
    { t: 'ヘ音記号の線', s: { clef: 'bass', level: -1, filter: 'line', notes: 1, acc: false } },
    { t: 'ヘ音記号の間', s: { clef: 'bass', level: -1, filter: 'space', notes: 1, acc: false } },
    { t: 'ヘ音記号ぜんぶ', s: { clef: 'bass', level: 1, filter: 'all', notes: 1, acc: false } },
    { t: '大譜表', s: { clef: 'grand', level: 1, filter: 'all', notes: 1, acc: false } },
    { t: '3つ続けて', s: { clef: 'grand', level: 1, filter: 'all', notes: 3, acc: false } },
    { t: '♯・♭', s: { clef: 'treble', level: 1, filter: 'all', notes: 1, acc: true } }
  ];
  const stepActive = (st) => Object.entries(st.s).every(([k, v]) => String(settings[k]) === String(v));

  /** 出題する音のフィルタ（線・間・ドミソ） */
  function filterPool(pool, clef) {
    const f = settings.filter;
    let out = pool;
    if (f === 'line') out = pool.filter((n) => M.posOf(n, clef) % 2 === 0);
    else if (f === 'space') out = pool.filter((n) => Math.abs(M.posOf(n, clef)) % 2 === 1);
    else if (f === 'ceg') { const o = clef === 'treble' ? 4 : 3; out = [0, 2, 4].map((l) => M.note(l, o)); }
    return out.length ? out : pool;
  }
  /** あるステップ（または今の設定）で出る音の一覧 */
  function poolFor(s, clef) {
    const saved = settings.filter;
    settings.filter = s.filter;
    const p = filterPool(M.pool(clef, s.level, s.acc), clef);
    settings.filter = saved;
    return p;
  }

  function renderSteps() {
    const box = $('#stepBox');
    box.innerHTML = '<p class="steps-head">はじめての人は、ステップ1から順に</p>';
    const row = el('div', 'steps');
    STEPS.forEach((st, i) => {
      const s = st.s;
      const clefs = s.clef === 'bass' ? ['bass'] : s.clef === 'treble' ? ['treble'] : ['treble', 'bass'];
      const notes = clefs.flatMap((c) => poolFor(s, c));
      const desc = (notes.length <= 7 && !s.acc
        ? notes.map((n) => nm(n)).join('・')
        : `${CLEF_OPTS[s.clef].label} · ${LEVELS[s.level]}`) + (s.notes > 1 ? ` · ${s.notes}音ずつ` : '');
      const b = el('button', 'step' + (stepActive(st) ? ' on' : ''));
      b.type = 'button';
      b.innerHTML = `<span class="step-no">${i + 1}</span><span class="step-t">${st.t}</span><span class="step-d">${desc}</span>`;
      b.addEventListener('click', () => {
        Object.assign(settings, st.s);
        saveSettings();
        syncSettingsUI();
        renderSteps();
        renderModes();
      });
      row.appendChild(b);
    });
    box.appendChild(row);
    const on = row.querySelector('.step.on');
    if (on) row.scrollLeft = on.offsetLeft - 16;
  }

  function renderModes() {
    const list = $('#modeList');
    list.innerHTML = '';
    MODES.forEach((m) => {
      const b = el('button', 'mode');
      b.type = 'button';
      b.innerHTML = `<span class="mode-icon" aria-hidden="true">${ICONS[m.icon]}</span><span class="mode-title">${m.title}</span><span class="mode-desc">${m.desc}</span>`;
      if (m.id === 'speed') {
        const best = bests[speedKey()];
        b.insertAdjacentHTML('beforeend', `<span class="mode-best">${best ? '自己ベスト ' + best.s + speedUnit() : 'この設定ではまだ記録なし'}</span>`);
      }
      b.addEventListener('click', () => startQuiz(m.id));
      list.appendChild(b);
    });
  }

  function renderToday() {
    const t = days[dayKey()] || { a: 0, c: 0 };
    const goal = +settings.goal;
    const s = streak();
    const done = t.a >= goal;
    $('#todayBox').innerHTML = `
      <div class="today-main">
        <span class="today-label">今日の練習</span>
        <span class="today-count"><b>${t.a}</b> / ${goal} 音</span>
        <span class="today-sub">${t.a ? `正答率 ${pct(t)}%` : 'まだ練習していません'}${done ? ' · 目標達成' : ''}</span>
      </div>
      <div class="today-streak"><b>${s}</b><span>日連続</span></div>
      <div class="today-bar" aria-hidden="true"><span style="width:${Math.min(100, (100 * t.a) / goal)}%"></span></div>`;
    $('#todayBox').classList.toggle('done', done);
    renderSteps();
    renderModes();
  }

  function levelLabel(level) {
    const desc = (clef) => {
      const [lo, hi] = M.rangeOf(level);
      return `${M.name(M.noteAt(lo, clef), settings.sys)}${M.noteAt(lo, clef).o}〜${M.name(M.noteAt(hi, clef), settings.sys)}${M.noteAt(hi, clef).o}`;
    };
    const c = settings.clef;
    const r = c === 'treble' ? desc('treble') : c === 'bass' ? desc('bass') : `ト ${desc('treble')}・ヘ ${desc('bass')}`;
    return `${LEVELS[level]}（${r}）`;
  }
  function renderLevelOptions() {
    const sel = $('#optLevel');
    sel.innerHTML = LEVEL_KEYS.map((i) => `<option value="${i}">${levelLabel(i)}</option>`).join('');
    sel.value = String(settings.level);
  }

  /** 今の設定で出る音を、設定欄に小さく並べる */
  function renderPoolHint() {
    const clefs = settings.clef === 'bass' ? ['bass'] : settings.clef === 'treble' ? ['treble'] : ['treble', 'bass'];
    const parts = clefs.map((c) => {
      const p = filterPool(M.pool(c, settings.level, false), c);
      return (clefs.length > 1 ? (c === 'treble' ? 'ト：' : 'ヘ：') : '') + p.map((n) => `${nm(n)}<small>${n.o}</small>`).join(' ');
    });
    $('#poolHint').innerHTML = '出題される音：' + parts.join('　') + (settings.acc ? '（と、その♯・♭）' : '') +
      (settings.filter === 'ceg' ? '<br>ドミソは音域の設定に関係なく、ト音記号は真ん中のド（ド4）から、ヘ音記号はド3からの3つの音です。' : '');
  }

  function renderSummary() {
    $('#settingsSummary').textContent = [
      CLEF_OPTS[settings.clef].label, FILTER_SHORT[settings.filter], settings.filter === 'ceg' ? null : LEVELS[settings.level],
      +settings.notes > 1 ? settings.notes + '音ずつ' : null, settings.acc ? '♯♭あり' : null,
      M.SYSTEMS[settings.sys].label, settings.count + '問'
    ].filter(Boolean).join(' · ');
    if ($('#poolHint')) renderPoolHint();
  }

  const syncers = [];
  function syncSettingsUI() { syncers.forEach((f) => f()); renderSummary(); }

  function initSettings() {
    const clefSeg = () => segmented($('#clefSeg'), Object.fromEntries(Object.entries(CLEF_OPTS).map(([k, v]) => [k, v.label])), settings.clef, (v) => {
      settings.clef = v; $('#clefHint').textContent = CLEF_OPTS[v].hint; renderLevelOptions(); saveSettings(); renderSteps(); renderModes();
    });
    const sysSeg = () => segmented($('#sysSeg'), Object.fromEntries(Object.entries(M.SYSTEMS).map(([k, v]) => [k, v.label])), settings.sys, (v) => {
      settings.sys = v; renderLevelOptions(); saveSettings(); renderSteps();
    });
    const notesSeg = () => segmented($('#notesSeg'), { 1: '1つ', 2: '2つ', 3: '3つ' }, settings.notes, (v) => {
      settings.notes = +v; saveSettings(); renderSteps(); renderModes();
    });
    syncers.push(clefSeg, sysSeg, notesSeg, () => { $('#clefHint').textContent = CLEF_OPTS[settings.clef].hint; }, renderLevelOptions);
    $('#optFilter').innerHTML = Object.entries(FILTERS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#optTone').innerHTML = Object.entries(M.TONES).map(([k, v]) => `<option value="${k}">${v.label}${v.sustain ? '（持続音）' : ''}</option>`).join('');
    $('#pvTone').innerHTML = $('#optTone').innerHTML;
    $('#optLevel').addEventListener('change', (e) => { settings.level = +e.target.value; saveSettings(); renderSteps(); renderModes(); });
    const bind = (id, key, isCheck, after) => {
      const n = $(id);
      const sync = () => { if (isCheck) n.checked = !!settings[key]; else n.value = String(settings[key]); };
      syncers.push(sync);
      n.addEventListener('change', () => { settings[key] = isCheck ? n.checked : n.value; saveSettings(); if (after) after(); });
    };
    const toneChanged = () => { Sound.setType(settings.tone); syncSettingsUI(); Sound.stop(); Sound.play(67); };
    bind('#optFilter', 'filter', false, () => { renderSteps(); renderModes(); });
    bind('#optCount', 'count');
    bind('#optAcc', 'acc', true, () => { renderSteps(); renderModes(); });
    bind('#optWeak', 'weak', true);
    bind('#optAuto', 'auto', true);
    bind('#optSound', 'sound', true);
    bind('#optRef', 'ref', true);
    bind('#optEar', 'ear');
    bind('#optTone', 'tone', false, toneChanged);
    bind('#pvTone', 'tone', false, toneChanged);
    bind('#optDur', 'dur', false, () => { Sound.setDur(settings.dur); Sound.stop(); Sound.play(67); });
    bind('#optVolume', 'volume', false, () => { Sound.setVolume(+settings.volume); Sound.stop(); Sound.play(67); });
    bind('#optKeyLabels', 'keyLabels');
    bind('#optGoal', 'goal', false, renderToday);
    syncSettingsUI();
  }

  // ---------- Quiz ----------
  let quiz = null;
  let advanceTimer = null;
  let speedTimer = null;
  let flashTimer = null;
  let keyboard = null;
  const SEQ_GAP = 0.75; // 複数の音を続けて鳴らす間隔（秒）

  const speedKey = () => `${settings.clef}:${settings.level}:${settings.acc ? 'acc' : 'n'}:${settings.filter}:${settings.notes}`;
  const speedUnit = () => (+settings.notes > 1 ? '音' : '問');
  const speedKeyLabel = (k) => {
    const [c, l, a, f, n] = k.split(':');
    return [CLEF_OPTS[c] ? CLEF_OPTS[c].label : c, f && FILTER_SHORT[f], f === 'ceg' ? null : LEVELS[+l],
      +n > 1 ? n + '音ずつ' : null, a === 'acc' ? '♯♭あり' : null].filter(Boolean).join(' · ');
  };

  function pools() {
    return {
      treble: filterPool(M.pool('treble', settings.level, settings.acc), 'treble'),
      bass: filterPool(M.pool('bass', settings.level, settings.acc), 'bass')
    };
  }

  /** 苦手な音ほど出やすく、直前と同じ音は出にくく */
  function pickNote(clef, pool, prev) {
    let cand = pool;
    if (settings.acc) {
      const accs = pool.filter((n) => n.a);
      const nat = pool.filter((n) => !n.a);
      cand = accs.length && Math.random() < 0.4 ? accs : nat.length ? nat : pool;
    }
    const w = cand.map((n) => {
      const s = stats[clef + ':' + n.id];
      let x = 1;
      if (settings.weak && s && s.a) x += ((s.a - s.c) / s.a) * 3 * Math.min(1, s.a / 3);
      if (!s) x += 0.3;
      if (prev && prev.midi === n.midi) x = 0.02;
      return x;
    });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }

  function makeQuestion(prev, fixed) {
    const display = (clef) => (settings.clef === 'grand' ? 'grand' : clef);
    if (fixed) return { clef: fixed.clef, notes: fixed.notes || [fixed.n], display: display(fixed.clef) };
    const clef = settings.clef === 'treble' || settings.clef === 'bass' ? settings.clef : Math.random() < 0.5 ? 'treble' : 'bass';
    const k = Math.max(1, Math.min(3, +settings.notes || 1));
    const notes = [];
    let last = prev && prev.clef === clef ? prev.notes[prev.notes.length - 1] : null;
    for (let i = 0; i < k; i++) { const n = pickNote(clef, quiz.pools[clef], last); notes.push(n); last = n; }
    return { clef, notes, display: display(clef) };
  }

  /** 音名の4択（♯♭ありのとき） */
  function nameChoices(n) {
    const cands = [];
    [-1, 0, 1].forEach((dl) => {
      const l = (n.l + dl + 7) % 7;
      [-1, 0, 1].forEach((a) => {
        if (a > 0 && ![0, 1, 3, 4, 5].includes(l)) return;
        if (a < 0 && ![1, 2, 4, 5, 6].includes(l)) return;
        const c = M.note(l, n.o, a);
        if (c.pc !== n.pc) cands.push(c);
      });
    });
    const sameLetter = cands.filter((c) => c.l === n.l);
    const pick = [sample(sameLetter, 1)[0], ...sample(cands.filter((c) => c.l !== n.l), 3)].filter(Boolean);
    const set = [n, ...pick.slice(0, 3)];
    return set.sort((a, b) => a.l - b.l || a.a - b.a);
  }

  /** 五線譜の4択の選択肢（音の並びごと）。1つ目が正解の並び */
  function staffChoices(q) {
    const pool = quiz.pools[q.clef];
    const k = q.notes.length;
    const byName = q.mode === 'find';
    const keyOf = (seq) => seq.map((n) => (byName ? n.pc : n.midi)).join();
    const seen = new Set([keyOf(q.notes)]);
    const out = [q.notes];
    const altFor = (n) => {
      let c = pool.filter((x) => (byName ? x.pc !== n.pc : x.midi !== n.midi));
      if (!byName) {
        const d = (x) => Math.abs(x.dia - n.dia);
        const c2 = c.filter((x) => (settings.ear === 'near' ? d(x) <= 2 : d(x) >= 2));
        if (c2.length) c = c2;
      }
      return c.length ? c[Math.floor(Math.random() * c.length)] : null;
    };
    for (let tries = 0; out.length < 4 && tries < 100; tries++) {
      const seq = q.notes.slice();
      const m = byName || settings.ear === 'near' ? 1 : 1 + Math.floor(Math.random() * k);
      shuffle([...Array(k).keys()]).slice(0, m).forEach((i) => { const a = altFor(seq[i]); if (a) seq[i] = a; });
      const key = keyOf(seq);
      if (!seen.has(key)) { seen.add(key); out.push(seq); }
    }
    return shuffle(out);
  }

  function pitchChoices(n) {
    const pcs = new Set([n.midi % 12]);
    const out = [n.midi % 12];
    shuffle([...Array(12).keys()]).forEach((p) => { if (out.length < 4 && !pcs.has(p)) { pcs.add(p); out.push(p); } });
    return out.sort((a, b) => a - b);
  }

  function startQuiz(mode, fixedList) {
    clearTimeout(advanceTimer);
    clearInterval(speedTimer);
    Sound.unlock();
    quiz = {
      mode, i: 0, score: 0, notesOk: 0, notesDone: 0, log: [], pools: pools(),
      fixed: fixedList || null,
      total: mode === 'speed' ? Infinity : fixedList ? fixedList.length : +settings.count,
      endAt: mode === 'speed' ? Date.now() + SPEED_SEC * 1000 : 0,
      q: null
    };
    $('#quizSetup').hidden = true;
    $('#quizResult').hidden = true;
    $('#quizPlay').hidden = false;
    document.body.classList.add('quizzing');
    window.scrollTo(0, 0);
    if (mode === 'speed') {
      speedTimer = setInterval(tickSpeed, 200);
      tickSpeed();
    }
    nextQuestion();
  }

  function tickSpeed() {
    if (!quiz || quiz.mode !== 'speed') return;
    const left = Math.max(0, quiz.endAt - Date.now());
    $('#progressLabel').textContent = Math.ceil(left / 1000) + ' 秒';
    $('#progressBar').style.width = (100 * (1 - left / (SPEED_SEC * 1000))) + '%';
    if (left <= 0) { clearInterval(speedTimer); finishQuiz(); }
  }

  function stopQuiz() {
    clearTimeout(advanceTimer);
    clearInterval(speedTimer);
    Sound.stop();
    quiz = null;
    keyboard = null;
    document.body.classList.remove('quizzing');
    $('#quizPlay').hidden = true;
    $('#quizResult').hidden = true;
    $('#quizSetup').hidden = false;
    renderToday();
  }

  /** 音を順に鳴らす。持続音は次の音にかぶらない長さにする */
  function playNotes(notes, startAt = 0) {
    const dur = notes.length > 1 ? Math.min(+settings.dur, SEQ_GAP - 0.08) : undefined;
    notes.forEach((n, i) => Sound.play(n.midi, startAt + i * SEQ_GAP, dur));
  }
  function playQuestionSound(q) {
    Sound.stop();
    let t = 0;
    if (settings.ref) {
      Sound.play(q.clef === 'treble' ? 60 : 48, 0, Math.min(+settings.dur, 0.9));
      t = 1.1;
    }
    playNotes(q.notes, t);
  }

  function nextQuestion() {
    clearTimeout(advanceTimer);
    if (!quiz) return;
    if (quiz.i >= quiz.total) { finishQuiz(); return; }
    const prev = quiz.q;
    const q = makeQuestion(prev, quiz.fixed && quiz.fixed[quiz.i]);
    q.mode = quiz.mode;
    q.answered = false;
    q.step = 0;
    q.results = [];
    q.inputs = [];
    quiz.q = q;
    renderQuestion();
    if (EAR_MODES.includes(q.mode)) playQuestionSound(q);
  }

  /** 問題の五線譜。答えた音は色付き、複数の音のときは次に答える音を強調 */
  function stageStaff(q, final) {
    const many = q.notes.length > 1;
    const items = q.notes.map((n, i) => {
      let cls = '';
      if (final || i < q.step) cls = q.results[i] ? 'is-correct' : 'is-wrong';
      else if (many && i === q.step) cls = 'current';
      return { n, clef: q.clef, cls };
    });
    return M.staffSVG({
      clef: q.display, items, width: (q.display === 'grand' ? 150 : 140) + (q.notes.length - 1) * 46,
      level: settings.level, cls: 'stage-staff', label: '五線譜の問題'
    });
  }

  const namesOf = (notes) => notes.map((n) => nm(n)).join('・');
  const SEQ_MODES = ['read', 'speed', 'key', 'earName'];

  function renderQuestion() {
    const q = quiz.q;
    const stage = $('#stage');
    const choices = $('#choices');
    const k = q.notes.length;
    const many = k > 1;
    stage.className = 'stage';
    stage.onclick = null;
    choices.className = 'choices';
    choices.innerHTML = '';
    $('#gloss').innerHTML = '';
    $('#nextBtn').hidden = true;
    $('#replayBtn').hidden = !EAR_MODES.includes(q.mode);
    keyboard = null;

    if (quiz.mode !== 'speed') {
      $('#progressLabel').textContent = `${quiz.i + 1} / ${quiz.total}`;
      $('#progressBar').style.width = (100 * quiz.i) / quiz.total + '%';
    }
    $('#scoreLabel').textContent = `${quiz.mode === 'speed' ? quiz.notesOk : quiz.score} 正解`;

    const where = settings.clef === 'both' || settings.clef === 'grand' ? `（${clefLabel(q.clef)}の音）` : '';
    const keysHint = settings.acc ? '1〜4' : '1〜7 または C D E F G A B';
    let hint = '';
    if (q.mode === 'read' || q.mode === 'speed') {
      $('#prompt').textContent = (many ? `左から順に、${k}つの音を答えてください` : 'この音は？') + (settings.clef === 'grand' ? where : '');
      stage.innerHTML = stageStaff(q);
      renderAnswerButtons(q);
      hint = keysHint + ' で回答 · Enter で次へ';
    } else if (q.mode === 'key') {
      $('#prompt').textContent = many ? `左から順に、${k}つの音を鍵盤で押してください` : 'この音を鍵盤で押してください';
      stage.innerHTML = stageStaff(q);
      renderKeyboard(q);
      hint = '鍵盤をタップして回答 · Enter で次へ';
    } else if (q.mode === 'find') {
      $('#prompt').innerHTML = `${clefLabel(q.clef)}で「<b>${namesOf(q.notes)}</b>」と書いてあるのはどれ？`;
      stage.classList.add('compact');
      stage.innerHTML = `<div class="big-name${many ? ' many' : ''}">${namesOf(q.notes)}</div><div class="big-sub">${clefLabel(q.clef)}</div>`;
      renderStaffChoices(q);
      hint = '1〜4 で回答 · Enter で次へ';
    } else if (q.mode === 'earStaff') {
      $('#prompt').textContent = (many ? `鳴った${k}つの音の五線譜はどれ？` : '鳴った音の五線譜はどれ？') + where;
      stage.classList.add('compact');
      stage.innerHTML = speakerHTML(q);
      stage.onclick = () => playQuestionSound(q);
      renderStaffChoices(q);
      hint = '1〜4 で回答 · Space でもう一度聴く · Enter で次へ';
    } else if (q.mode === 'earName') {
      $('#prompt').textContent = many ? `鳴った${k}つの音の名前を、順に答えてください` : '鳴った音の名前は？';
      stage.classList.add('compact');
      stage.innerHTML = speakerHTML(q);
      stage.onclick = () => { if (!q.answered) playQuestionSound(q); };
      renderAnswerButtons(q);
      hint = keysHint + ' で回答 · Space でもう一度聴く';
    }
    if (many && SEQ_MODES.includes(q.mode)) renderSeqGloss(q);
    $('#kbdHint').textContent = window.matchMedia('(hover: hover)').matches ? hint : '';
  }

  function speakerHTML(q) {
    const many = q.notes.length > 1;
    const what = many ? q.notes.map(() => '？').join(' → ') : '？';
    const ref = settings.ref ? `<span class="ref-note">基準のド → ${what}</span>` : many ? `<span class="ref-note">${what}</span>` : '';
    return `<button class="speaker" type="button" aria-label="もう一度聴く"><svg viewBox="0 0 48 48"><path d="M10 19h7l10-8v26l-10-8h-7z"/><path d="M33 17c3 3.6 3 10.4 0 14M37.5 12.5c5.6 6.4 5.6 16.6 0 23"/></svg></button>${ref}`;
  }

  /** 複数の音を順に答えている途中の表示（答えた音は名前、まだの音は？） */
  function renderSeqGloss(q) {
    const chips = q.notes.map((n, i) => {
      if (i < q.step) return `<span class="ans-chip ${q.results[i] ? 'ok' : 'ng'}">${nm(n)}</span>`;
      return `<span class="ans-chip${i === q.step ? ' cur' : ''}">？</span>`;
    }).join('');
    $('#gloss').innerHTML = `<span class="chips-row">${chips}</span>`;
  }

  /** 今答える音のための回答ボタン（音名7つ、または4択） */
  function renderAnswerButtons(q) {
    const choices = $('#choices');
    choices.innerHTML = '';
    choices.classList.remove('four', 'seven');
    const n = q.notes[q.step];
    const pitch = q.mode === 'earName';
    if (settings.acc && pitch) {
      choices.classList.add('four');
      pitchChoices(n).forEach((p, i) => {
        const b = choiceBtn(`<span class="nm small">${M.pcLabel(p, settings.sys)}</span>`, i + 1);
        b.dataset.p = p;
        b.addEventListener('click', () => seqInput(p === n.midi % 12, M.pcLabel(p, settings.sys), b, (x) => +x.dataset.p === n.midi % 12, true));
        choices.appendChild(b);
      });
    } else if (settings.acc) {
      choices.classList.add('four');
      nameChoices(n).forEach((c, i) => {
        const b = choiceBtn(`<span class="nm">${nm(c)}</span>`, i + 1);
        b.dataset.pc = c.pc;
        b.addEventListener('click', () => seqInput(c.pc === n.pc, nm(c), b, (x) => x.dataset.pc === n.pc, true));
        choices.appendChild(b);
      });
    } else {
      choices.classList.add('seven');
      M.LETTERS.forEach((L, l) => {
        const c = M.note(l, 4);
        const sub = settings.sys === 'doremi' ? L : M.name(c, 'doremi');
        const b = choiceBtn(`<span class="nm">${nm(c)}</span><span class="sub">${sub}</span>`, l + 1);
        b.dataset.l = l;
        // 7つのボタンは音ごとに作り直さないので、正解の判定は押したときの音で行う
        b.addEventListener('click', () => {
          const cur = quiz.q.notes[quiz.q.step];
          if (!cur) return;
          seqInput(l === cur.l, nm(c), b, (x) => +x.dataset.l === cur.l, false);
        });
        choices.appendChild(b);
      });
    }
  }

  function renderStaffChoices(q) {
    const choices = $('#choices');
    choices.classList.add('staves');
    const k = q.notes.length;
    if (k >= 3) choices.classList.add('wide');
    staffChoices(q).forEach((seq, i) => {
      const b = choiceBtn(M.staffSVG({ clef: q.clef, items: seq.map((n) => ({ n })), width: 112 + (k - 1) * 40, level: settings.level, label: `選択肢${i + 1}` }), i + 1);
      if (seq === q.notes) b.dataset.ans = '1';
      b.addEventListener('click', () => choiceInput(seq, b));
      choices.appendChild(b);
    });
  }

  function renderKeyboard(q) {
    const choices = $('#choices');
    choices.classList.add('keys');
    // 鍵盤の範囲は、フィルタをかける前の音域にする（範囲から答えがわからないように）
    const all = [...M.pool(q.clef, settings.level, settings.acc), ...quiz.pools[q.clef]];
    let lo = Math.min(...all.map((n) => n.midi)), hi = Math.max(...all.map((n) => n.midi));
    // 両端に白鍵を1つずつ足して、端の音でも位置がわかるように
    lo = lo - 1; while (!M.isWhite(lo)) lo--;
    hi = hi + 1; while (!M.isWhite(hi)) hi++;
    const wrap = el('div', 'piano-wrap');
    choices.appendChild(wrap);
    keyboard = M.piano(wrap, {
      lo, hi, labels: settings.keyLabels, sys: () => settings.sys,
      onPress(midi, key) {
        if (q.answered || q.busy) return Sound.play(midi, 0, 'hold');
        const n = q.notes[q.step];
        keyboard.clear();
        Sound.stop();
        const v = Sound.play(midi, 0, 'hold');
        const ok = midi === n.midi;
        key.classList.add(ok ? 'is-correct' : 'is-wrong');
        if (!ok) keyboard.mark(n.midi, 'is-correct');
        seqInput(ok, `${M.pcLabel(midi, settings.sys)}（${M.sci(M.fromMidi(midi))}）`, null, null, false, true);
        return v;
      }
    });
  }

  function choiceBtn(html, num) {
    const b = el('button', 'choice', html);
    b.type = 'button';
    b.dataset.num = num;
    return b;
  }
  function flashStage(ok) {
    const stage = $('#stage');
    stage.classList.remove('flash-good', 'flash-bad');
    void stage.offsetWidth;
    stage.classList.add(ok ? 'flash-good' : 'flash-bad');
  }

  /**
   * 順に答えるモード（読む・鍵盤・聴いて音名・スピード）の1音ぶんの回答
   *   rebuild: 次の音で回答ボタンを作り直す（4択のとき）
   *   isKey: 鍵盤で答えた（押した音はもう鳴っている）
   */
  function seqInput(ok, label, btn, correctPred, rebuild, isKey) {
    const q = quiz && quiz.q;
    if (!q || q.answered || q.busy) return;
    const n = q.notes[q.step];
    const many = q.notes.length > 1;
    q.results.push(ok);
    q.inputs.push(label);
    record(q.clef, n, ok);
    quiz.notesDone++;
    if (ok) quiz.notesOk++;
    q.step++;
    const done = q.step >= q.notes.length;

    // 音：読む問題は答えたら正しい音を鳴らす。聴く問題・鍵盤は間違えたときだけ正しい音
    if (isKey) { if (!ok && settings.sound) Sound.play(n.midi, 0.45); }
    else if (q.mode === 'earName') { if (!ok) { Sound.stop(); Sound.play(n.midi, 0.05); } }
    else if (settings.sound) { Sound.stop(); Sound.play(n.midi, 0, many ? Math.min(+settings.dur, 0.6) : undefined); }

    const buttons = [...document.querySelectorAll('#choices .choice')];
    clearTimeout(flashTimer);
    buttons.forEach((x) => x.classList.remove('is-correct', 'is-wrong', 'dim'));
    if (btn) btn.classList.add(ok ? 'is-correct' : 'is-wrong');
    if (!ok && correctPred) buttons.forEach((x) => { if (correctPred(x)) x.classList.add('is-correct'); });

    if (done) { finishQuestion(); return; }

    // 次の音へ
    flashStage(ok);
    if (q.mode !== 'earName') $('#stage').innerHTML = stageStaff(q);
    renderSeqGloss(q);
    if (rebuild) {
      q.busy = true;
      flashTimer = setTimeout(() => { q.busy = false; if (quiz && quiz.q === q) renderAnswerButtons(q); }, ok ? 300 : 650);
    } else if (!isKey) {
      flashTimer = setTimeout(() => buttons.forEach((x) => x.classList.remove('is-correct', 'is-wrong')), ok ? 300 : 650);
    }
  }

  /** 五線譜の4択（探す・聴いて五線譜）の回答 */
  function choiceInput(seq, btn) {
    const q = quiz && quiz.q;
    if (!q || q.answered) return;
    const byName = q.mode === 'find';
    q.results = q.notes.map((n, i) => (byName ? seq[i].pc === n.pc : seq[i].midi === n.midi));
    q.notes.forEach((n, i) => record(q.clef, n, q.results[i]));
    quiz.notesDone += q.notes.length;
    quiz.notesOk += q.results.filter(Boolean).length;
    q.step = q.notes.length;
    q.chosen = seq;
    const ok = seq === q.notes;
    btn.classList.add(ok ? 'is-correct' : 'is-wrong');
    const right = document.querySelector('#choices .choice[data-ans="1"]');
    if (right) right.classList.add('is-correct');
    finishQuestion(ok);
  }

  function finishQuestion(okOverride) {
    const q = quiz.q;
    q.answered = true;
    const ok = okOverride != null ? okOverride : q.results.every(Boolean);
    q.ok = ok;
    const k = q.notes.length;
    const many = k > 1;
    if (ok) quiz.score++;
    quiz.log.push({ clef: q.clef, notes: q.notes, results: q.results.slice(), ok, mode: q.mode });
    document.querySelectorAll('#choices .choice').forEach((x) => { x.disabled = true; });
    if (!ok) document.querySelectorAll('#choices .choice:not(.is-correct):not(.is-wrong)').forEach((x) => x.classList.add('dim'));
    flashStage(ok);

    const stage = $('#stage');
    if (q.mode === 'earName') {
      // 聴き取りで音名を答えたあとは、その音の五線譜を小さく見せる
      stage.classList.remove('compact');
      stage.innerHTML = M.staffSVG({
        clef: q.clef, items: q.notes.map((n, i) => ({ n, cls: q.results[i] ? 'is-correct' : 'is-wrong' })),
        width: 120 + (k - 1) * 44, level: settings.level, cls: 'reveal-staff'
      });
    } else if (q.mode !== 'earStaff' && q.mode !== 'find') {
      stage.innerHTML = stageStaff(q, true);
    }
    // 選択肢の五線譜には正解が色付きで出るので、探す・聴いて五線譜は上の表示はそのまま
    stage.onclick = () => { Sound.stop(); playNotes(q.notes); };

    const info = q.notes.map((n) => M.posName(M.posOf(n, q.clef))).join(' · ');
    const nOk = q.results.filter(Boolean).length;
    let head;
    if (!many) head = ok ? '<span class="ok">正解</span>' : '<span class="ng">正解は</span>';
    else head = ok ? '<span class="ok">全部正解</span>' : `<span class="ng">${nOk} / ${k} 正解</span>`;
    const body = many
      ? `<span class="chips-row">${q.notes.map((n, i) => `<span class="ans-chip ${q.results[i] ? 'ok' : 'ng'}">${nm(n)}<small>${M.sci(n)}</small></span>`).join('')}</span>`
      : `　${fullName(q.notes[0])}`;
    $('#gloss').innerHTML = `${head}${body}<span class="pos">${clefLabel(q.clef)} · ${info}</span>`;
    if (!ok && q.inputs.length && SEQ_MODES.includes(q.mode)) {
      $('#gloss').insertAdjacentHTML('beforeend', `<span class="pos">${q.mode === 'key' ? '押したのは' : 'あなたの答え：'} ${q.inputs.join('・')}</span>`);
    }
    if (!ok && q.chosen && q.mode === 'earStaff') {
      $('#gloss').insertAdjacentHTML('beforeend', `<span class="pos">選んだのは ${q.chosen.map((n) => `${nm(n)}（${M.sci(n)}）`).join('・')}</span>`);
    }

    // 五線譜を選ぶ問題は、答えたら正解の音を鳴らす（聴く問題で正解したときは鳴らし直さない）
    if (q.mode === 'find' && settings.sound) { Sound.stop(); playNotes(q.notes); }
    if (q.mode === 'earStaff' && !ok) { Sound.stop(); playNotes(q.notes, 0.15); }
    // 複数の音を読んだあとは、並びをまとめて聴かせる
    if (many && settings.sound && (q.mode === 'read' || q.mode === 'key')) playNotes(q.notes, 0.7);

    $('#scoreLabel').textContent = `${quiz.mode === 'speed' ? quiz.notesOk : quiz.score} 正解`;
    quiz.i++;
    if (quiz.mode === 'speed') {
      advanceTimer = setTimeout(nextQuestion, ok ? 260 : 1100);
      return;
    }
    $('#nextBtn').hidden = false;
    $('#nextBtn').textContent = quiz.i >= quiz.total ? '結果を見る' : '次へ';
    if (ok && settings.auto) advanceTimer = setTimeout(nextQuestion, many ? 1400 : 800);
  }

  $('#nextBtn').addEventListener('click', nextQuestion);
  $('#replayBtn').addEventListener('click', () => { if (quiz && quiz.q) playQuestionSound(quiz.q); });
  $('#quitBtn').addEventListener('click', stopQuiz);

  function finishQuiz() {
    clearTimeout(advanceTimer);
    clearInterval(speedTimer);
    if (!quiz) return;
    const done = quiz;
    keyboard = null;
    $('#quizPlay').hidden = true;
    $('#quizResult').hidden = false;
    document.body.classList.remove('quizzing');
    const total = done.log.length;
    let title;
    if (done.mode === 'speed') {
      const k = speedKey();
      const unit = speedUnit();
      const prev = bests[k];
      const s = done.notesOk;
      const isBest = s > 0 && (!prev || s > prev.s);
      if (isBest) { bests[k] = { s, a: done.notesDone, d: dayKey() }; store.set('bests', bests); }
      $('#resultScore').textContent = s;
      $('#resultTotal').textContent = ` ${unit}正解 / ${done.notesDone}${unit}中`;
      title = isBest ? '自己ベスト更新！' : prev ? `自己ベストは ${prev.s} ${unit}です` : '';
      title += `<br><small>${speedKeyLabel(k)}</small>`;
    } else {
      $('#resultScore').textContent = done.score;
      $('#resultTotal').textContent = ` / ${total}`;
      const r = total ? done.score / total : 0;
      title = r === 1 ? 'パーフェクト！' : r >= 0.8 ? 'よく読めています' : r >= 0.5 ? 'その調子です' : 'くり返して慣れていきましょう';
    }
    $('#resultTitle').innerHTML = title;
    const misses = done.log.filter((x) => !x.ok);
    $('#retryMissBtn').hidden = !misses.length;
    $('#retryMissBtn').onclick = () => startQuiz(done.mode === 'speed' ? 'read' : done.mode, shuffle(misses.map((x) => ({ clef: x.clef, notes: x.notes }))));
    $('#againBtn').onclick = () => startQuiz(done.mode);
    const review = $('#review');
    review.innerHTML = '';
    const items = done.mode === 'speed' ? misses : done.log;
    if (!items.length) review.innerHTML = `<p class="review-empty">${done.mode === 'speed' ? '間違えた音はありません。' : ''}</p>`;
    items.forEach((x) => {
      const r = el('button', 'review-item ' + (x.ok ? 'ok' : 'ng'));
      r.type = 'button';
      const pos = x.notes.length === 1 ? ' · ' + M.posName(M.posOf(x.notes[0], x.clef)) : '';
      r.innerHTML = `${M.staffSVG({ clef: x.clef, items: x.notes.map((n, i) => ({ n, cls: x.results[i] ? '' : 'is-wrong' })), width: 90 + (x.notes.length - 1) * 34, level: settings.level, whole: true })}
        <span class="ans"><b>${namesOf(x.notes)}</b> <small>${x.notes.map((n) => M.sci(n)).join('・')} · ${clefLabel(x.clef)}${pos}</small></span>
        <span class="mark">${x.ok ? '○' : '×'}</span>`;
      r.addEventListener('click', () => { Sound.stop(); playNotes(x.notes); });
      review.appendChild(r);
    });
    quiz = null;
    window.scrollTo(0, 0);
  }
  $('#backBtn').addEventListener('click', stopQuiz);

  // キーボード操作
  document.addEventListener('keydown', (e) => {
    if (!quiz || !quiz.q || e.ctrlKey || e.metaKey || e.altKey) return;
    const q = quiz.q;
    if (e.key === 'Escape') { stopQuiz(); return; }
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      if (q.answered && quiz.mode !== 'speed') { e.preventDefault(); nextQuestion(); }
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (EAR_MODES.includes(q.mode)) playQuestionSound(q); else { Sound.stop(); playNotes(q.notes); }
      return;
    }
    if (q.answered) return;
    const btns = [...document.querySelectorAll('#choices .choice')];
    let target = null;
    if (/^[1-9]$/.test(e.key)) target = btns.find((b) => b.dataset.num === e.key);
    else if (/^[a-gA-G]$/.test(e.key)) target = btns.find((b) => b.dataset.l != null && M.LETTERS[+b.dataset.l] === e.key.toUpperCase());
    if (target) { e.preventDefault(); target.click(); }
  });

  // ---------- List ----------
  const LANDMARKS = {
    treble: [
      { id: 'G4', t: 'ト音記号の渦巻き', d: (n) => `ト音記号は「ト（G）＝${n('G4')}」の位置を示す記号です。書き始めの渦巻きが巻きつく<b>第2線</b>が${n('G4')}。` },
      { id: 'C4', t: '真ん中のド', d: (n) => `下に加線を1本引いた${n('C4')}。ヘ音記号の上第1線の${n('C4')}と同じ高さです。` },
      { id: 'C5', t: '第3間のド', d: (n) => `五線の真ん中より1つ上の間。真ん中の${n('C4')}の1オクターブ上です。` }
    ],
    bass: [
      { id: 'F3', t: 'ヘ音記号の2つの点', d: (n) => `ヘ音記号は「ヘ（F）＝${n('F3')}」の位置を示す記号です。2つの点にはさまれた<b>第4線</b>が${n('F3')}。` },
      { id: 'C4', t: '真ん中のド', d: (n) => `上に加線を1本引いた${n('C4')}。ト音記号の下第1線の${n('C4')}と同じ高さです。` },
      { id: 'C3', t: '第2間のド', d: (n) => `下から2番目の間。真ん中の${n('C4')}の1オクターブ下です。` }
    ]
  };

  function cardMeter(clef, n) {
    const p = pct(stats[clef + ':' + n.id]);
    return p == null ? '' : `<span class="meter" title="正答率 ${p}%"><span style="width:${p}%"></span></span>`;
  }

  function renderList() {
    const clef = settings.listClef;
    const nmId = (id) => nm(M.parse(id));
    const root = $('#view-list');
    root.classList.toggle('hide-names', !!settings.listHide);

    // 目印の音
    const land = $('#listLand');
    land.innerHTML = '<h2 class="sub-head">まず覚えたい目印の音</h2>';
    const lg = el('div', 'landmarks');
    LANDMARKS[clef].forEach((L) => {
      const n = M.parse(L.id);
      const c = el('button', 'land');
      c.type = 'button';
      c.innerHTML = `${M.staffSVG({ clef, items: [{ n, cls: 'accent' }], width: 100, level: 1, whole: true })}
        <span class="land-body"><span class="land-title">${L.t}</span><span class="land-name">${nm(n)} <small>${M.sci(n)}</small></span><span class="land-desc">${L.d(nmId)}</span></span>`;
      c.addEventListener('click', () => Sound.play(n.midi));
      lg.appendChild(c);
    });
    land.appendChild(lg);

    // 線と間の並び
    const lines = [0, 2, 4, 6, 8].map((p) => M.noteAt(p, clef));
    const spaces = [1, 3, 5, 7].map((p) => M.noteAt(p, clef));
    const row = (arr) => arr.map((n) => `<span class="mn">${nm(n)}</span>`).join('<span class="mn-sep">・</span>');
    $('#listMnemo').innerHTML = `
      <div class="mnemo">
        <div class="mnemo-staff">
          ${M.staffSVG({ clef, items: lines.map((n) => ({ n })), width: 200, level: 0, whole: true, label: '線の音' })}
          <p><b>線</b>（下から）${row(lines)}</p>
        </div>
        <div class="mnemo-staff">
          ${M.staffSVG({ clef, items: spaces.map((n) => ({ n })), width: 200, level: 0, whole: true, label: '間の音' })}
          <p><b>間</b>（下から）${row(spaces)}</p>
        </div>
      </div>`;
    $('#listMnemo').querySelectorAll('.mnemo-staff').forEach((box, i) => {
      box.addEventListener('click', () => Sound.seq((i ? spaces : lines).map((n) => n.midi), 0.38));
    });

    // 一覧
    const all = M.pool(clef, 3, !!settings.listAcc);
    const [lo, hi] = M.rangeOf(3);
    $('#listRange').textContent = `${nm(M.noteAt(lo, clef))}${M.noteAt(lo, clef).o}〜${nm(M.noteAt(hi, clef))}${M.noteAt(hi, clef).o}`;
    const box = $('#listGrid');
    box.innerHTML = '';
    // 下の加線・五線の中・上の加線に分け、グループごとに五線の高さを揃える（余白を減らすため）
    const groups = [
      { t: '五線より下（加線）', span: [lo, -1], f: (p) => p < -1 },
      { t: '五線の中とすぐ外', span: [-1, 9], f: (p) => p >= -1 && p <= 9 },
      { t: '五線より上（加線）', span: [9, hi], f: (p) => p > 9 }
    ];
    groups.forEach((g) => {
      box.appendChild(el('p', 'grid-head', g.t));
      const grid = el('div', 'grid notes-grid');
      box.appendChild(grid);
      all.filter((n) => g.f(M.posOf(n, clef))).forEach((n) => addCard(grid, n, g.span));
    });
    function addCard(grid, n, span) {
      const pos = M.posOf(n, clef);
      const c = el('button', 'card' + (n.a ? ' acc' : ''));
      c.type = 'button';
      c.innerHTML = `${M.staffSVG({ clef, items: [{ n }], width: 74, span, whole: true, label: M.sci(n) })}
        <span class="nm">${nm(n)}</span>
        <span class="sci">${M.sci(n)}</span>
        <span class="pos">${M.posName(pos)}</span>
        ${cardMeter(clef, n)}`;
      c.title = `${M.octJa(n)}`;
      c.addEventListener('click', () => { Sound.stop(); Sound.play(n.midi); c.classList.add('revealed'); });
      grid.appendChild(c);
    }

    // 音名の対応表
    const sysOrder = ['doremi', 'cde', 'haniho', 'de'];
    const naturals = M.LETTERS.map((_, l) => M.note(l, 4));
    let t = '<thead><tr><th></th>' + naturals.map((n) => `<th>${M.name(n, 'doremi')}</th>`).join('') + '</tr></thead><tbody>';
    sysOrder.forEach((s) => { t += `<tr><th>${M.SYSTEMS[s].long}</th>` + naturals.map((n) => `<td>${M.name(n, s)}</td>`).join('') + '</tr>'; });
    const sharps = [0, 1, 3, 4, 5].map((l) => M.note(l, 4, 1));
    const flats = [1, 2, 4, 5, 6].map((l) => M.note(l, 4, -1));
    t += '</tbody>';
    $('#nameTable').innerHTML = t;
    const accTable = $('#accTable') || (() => { const x = el('table', 'name-table'); x.id = 'accTable'; $('#nameTable').parentNode.appendChild(x); return x; })();
    let u = '<thead><tr><th>♯・♭</th>' + sysOrder.map((s) => `<th>${M.SYSTEMS[s].label}</th>`).join('') + '</tr></thead><tbody>';
    [...sharps, ...flats].forEach((n) => { u += `<tr><th>${M.sci(n).replace(/\d/, '')}</th>` + sysOrder.map((s) => `<td>${M.name(n, s)}</td>`).join('') + '</tr>'; });
    accTable.innerHTML = u + '</tbody>';
  }

  segmented($('#listClefSeg'), { treble: 'ト音記号', bass: 'ヘ音記号' }, settings.listClef, (v) => { settings.listClef = v; saveSettings(); renderList(); });
  $('#listHide').checked = !!settings.listHide;
  $('#listHide').addEventListener('change', (e) => { settings.listHide = e.target.checked; saveSettings(); renderList(); });
  $('#listAcc').checked = !!settings.listAcc;
  $('#listAcc').addEventListener('change', (e) => { settings.listAcc = e.target.checked; saveSettings(); renderList(); });

  // ---------- Piano ----------
  let pv = null;
  let pvLast = null;
  function renderPianoStage() {
    const n = pvLast;
    const items = n ? [{ n, clef: n.midi >= 60 ? 'treble' : 'bass', cls: 'accent' }] : [];
    $('#pvStaff').innerHTML = M.staffSVG({ clef: 'grand', items, width: 190, level: 3, gap: 64, label: '大譜表' });
    if (!n) {
      $('#pvInfo').innerHTML = '<p class="pv-empty">鍵盤を押してみましょう</p>';
      return;
    }
    const clef = n.midi >= 60 ? 'treble' : 'bass';
    const others = Object.keys(M.SYSTEMS).filter((s) => s !== settings.sys).map((s) => `<span>${M.SYSTEMS[s].label} <b>${M.name(n, s)}</b></span>`).join('');
    $('#pvInfo').innerHTML = `
      <p class="pv-name">${nm(n)}<small>${M.sci(n)}</small></p>
      <p class="pv-pos">${clefLabel(clef)} · ${M.posName(M.posOf(n, clef))} · ${M.octJa(n)}</p>
      <p class="pv-others">${others}</p>`;
  }
  function renderPiano() {
    if (!pv) {
      pv = M.piano($('#pvPiano'), {
        lo: 36, hi: 84, labels: settings.pvLabels, sys: () => settings.sys,
        onPress(midi) {
          const v = Sound.play(midi, 0, 'hold');
          pvLast = M.fromMidi(midi, settings.pvFlat);
          pv.clear();
          pv.mark(midi, 'hit');
          renderPianoStage();
          return v;
        }
      });
      // 真ん中のドが中央に来るようにスクロール
      const sc = $('#pvScroll');
      const c4 = pv.key(60);
      if (c4) sc.scrollLeft = c4.offsetLeft - sc.clientWidth / 2 + c4.offsetWidth / 2;
    } else pv.setLabels(settings.pvLabels);
    if (pvLast && pvLast.a) pvLast = M.fromMidi(pvLast.midi, settings.pvFlat);
    renderPianoStage();
  }
  segmented($('#pvAccSeg'), { sharp: '♯で表示', flat: '♭で表示' }, settings.pvFlat ? 'flat' : 'sharp', (v) => {
    settings.pvFlat = v === 'flat'; saveSettings(); renderPiano();
  });
  $('#pvLabels').value = settings.pvLabels;
  $('#pvLabels').addEventListener('change', (e) => { settings.pvLabels = e.target.value; saveSettings(); renderPiano(); });

  // ---------- Record ----------
  function renderRecord() {
    const today = days[dayKey()] || { a: 0, c: 0 };
    const total = Object.values(days).reduce((acc, d) => ({ a: acc.a + d.a, c: acc.c + d.c }), { a: 0, c: 0 });
    const nDays = Object.values(days).filter((d) => d.a > 0).length;
    $('#recTiles').innerHTML = `
      <div class="tile"><span class="tile-v">${streak()}<small>日</small></span><span class="tile-k">連続で練習</span></div>
      <div class="tile"><span class="tile-v">${today.a}<small>音</small></span><span class="tile-k">今日${today.a ? `（正答率 ${pct(today)}%）` : ''}</span></div>
      <div class="tile"><span class="tile-v">${total.a}<small>音</small></span><span class="tile-k">これまで（${nDays}日・正答率 ${total.a ? pct(total) + '%' : '—'}）</span></div>`;

    // 2週間
    const bars = $('#recBars');
    const list = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); list.push(d); }
    const max = Math.max(+settings.goal, ...list.map((d) => (days[dayKey(d)] || { a: 0 }).a));
    bars.innerHTML = list.map((d) => {
      const v = days[dayKey(d)] || { a: 0, c: 0 };
      const h = (100 * v.a) / max, hc = (100 * v.c) / max;
      const wd = '日月火水木金土'[d.getDay()];
      return `<div class="bar${dayKey(d) === dayKey() ? ' is-today' : ''}" title="${d.getMonth() + 1}/${d.getDate()}：${v.a}音（正解 ${v.c}）">
        <div class="bar-col"><span class="bar-all" style="height:${h}%"></span><span class="bar-ok" style="height:${hc}%"></span></div>
        <span class="bar-v">${v.a || ''}</span><span class="bar-d">${d.getDate()}<small>${wd}</small></span></div>`;
    }).join('');
    bars.style.setProperty('--goal', (100 * settings.goal) / max + '%');

    // 苦手な音
    const weak = Object.entries(stats)
      .filter(([, s]) => s.a >= 3 && s.c < s.a)
      .map(([k, s]) => { const [clef, id] = k.split(':'); return { clef, n: M.parse(id), s, p: s.c / s.a }; })
      .sort((a, b) => a.p - b.p || b.s.a - a.s.a)
      .slice(0, 8);
    const w = $('#recWeak');
    w.innerHTML = weak.length ? '' : '<p class="hint">3回以上出題されて、間違えたことのある音がここに並びます。</p>';
    if (weak.length) {
      const g = el('div', 'weak-list');
      weak.forEach((x) => {
        const b = el('button', 'weak');
        b.type = 'button';
        b.innerHTML = `${M.staffSVG({ clef: x.clef, items: [{ n: x.n }], width: 70, level: 2, whole: true })}
          <span class="weak-body"><b>${nm(x.n)}</b> <small>${M.sci(x.n)} · ${clefLabel(x.clef)}</small><span class="weak-p">正答率 ${Math.round(x.p * 100)}%（${x.s.c}/${x.s.a}）</span></span>`;
        b.addEventListener('click', () => Sound.play(x.n.midi));
        g.appendChild(b);
      });
      w.appendChild(g);
      const btn = el('button', 'btn small', '苦手な音を練習する');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        show('quiz');
        const listQ = [];
        while (listQ.length < Math.max(10, weak.length)) listQ.push(...shuffle(weak.map((x) => ({ clef: x.clef, n: x.n }))));
        startQuiz('read', listQ.slice(0, Math.max(10, weak.length)));
      });
      w.appendChild(btn);
    }

    // 音ごとの正答率
    const clef = settings.recClef;
    const heat = $('#recHeat');
    heat.innerHTML = '';
    M.pool(clef, 3, false).slice().reverse().forEach((n) => {
      const s = stats[clef + ':' + n.id];
      const p = pct(s);
      const c = el('div', 'heat-cell');
      const lvl = p == null ? 'none' : p >= 90 ? 'g4' : p >= 75 ? 'g3' : p >= 50 ? 'g2' : 'g1';
      c.dataset.lvl = lvl;
      c.innerHTML = `<b>${nm(n)}<small>${n.o}</small></b><span>${p == null ? '—' : p + '%'}</span>`;
      c.title = `${M.sci(n)} ${M.posName(M.posOf(n, clef))}${s ? `：${s.c}/${s.a}` : ''}`;
      heat.appendChild(c);
    });

    // 自己ベスト
    const be = Object.entries(bests).sort((a, b) => b[1].s - a[1].s);
    $('#recBest').innerHTML = be.length
      ? '<ul class="best-list">' + be.map(([k, v]) => `<li><span>${speedKeyLabel(k)}</span><b>${v.s}<small>${(k.split(':')[4] || 1) > 1 ? '音' : '問'}</small></b><small>${v.d.replace(/-/g, '/')}</small></li>`).join('') + '</ul>'
      : '<p class="hint">「60秒スピード読み」に挑戦すると、設定ごとの自己ベストがここに残ります。</p>';
  }
  segmented($('#recClefSeg'), { treble: 'ト音記号', bass: 'ヘ音記号' }, settings.recClef, (v) => { settings.recClef = v; saveSettings(); renderRecord(); });
  $('#resetStats').addEventListener('click', () => {
    if (!confirm('正答率・練習した日・自己ベストの記録をすべて消します。よろしいですか？')) return;
    stats = {}; days = {}; bests = {};
    store.set('stats', stats); store.set('days', days); store.set('bests', bests);
    renderRecord();
  });

  // ---------- install (PWA) ----------
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    $('#installBtn').hidden = true;
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ---------- 記号のフォントが届いたら描き直す ----------
  function redraw() {
    M.resetMetrics();
    if (current === 'list') renderList();
    if (current === 'piano') renderPianoStage();
    if (current === 'record') renderRecord();
    if (quiz && quiz.q && !quiz.q.answered) renderQuestion();
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px "Noto Music"', '\u{1D11E}\u{1D122}').then(redraw).catch(() => {});
  }

  // ---------- start ----------
  initSettings();
  show(current);
})();
