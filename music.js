/*
 * 音の理論・五線譜の描画・鍵盤・音源
 * window.Music に公開します。
 */
(() => {
  'use strict';

  // ---------- 音 ----------
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMI = [0, 2, 4, 5, 7, 9, 11];
  const BASE = {
    doremi: ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'],
    cde: LETTERS,
    haniho: ['ハ', 'ニ', 'ホ', 'ヘ', 'ト', 'イ', 'ロ'],
    de: ['C', 'D', 'E', 'F', 'G', 'A', 'H']
  };
  const SYSTEMS = {
    doremi: { label: 'ドレミ', long: 'ドレミ（イタリア式）' },
    cde: { label: 'CDE', long: 'CDE（英米式）' },
    haniho: { label: 'ハニホ', long: 'ハニホ（日本式）' },
    de: { label: 'ドイツ', long: 'ドイツ式（C D E F G A H）' }
  };
  // 日本式のオクターブの呼び方（C4 = 一点ハ）
  const OCT_JA = { 1: '下一点', 2: '大字', 3: '小字', 4: '一点', 5: '二点', 6: '三点', 7: '四点' };
  // ♯・♭を付けて出題する白鍵（E♯・B♯・C♭・F♭のような珍しい書き方は出さない）
  const SHARPABLE = [0, 1, 3, 4, 5];
  const FLATTABLE = [1, 2, 4, 5, 6];

  function note(l, o, a = 0) {
    const pc = LETTERS[l] + (a > 0 ? '#' : a < 0 ? 'b' : '');
    return { l, o, a, dia: o * 7 + l, midi: 12 * (o + 1) + SEMI[l] + a, pc, id: pc + o };
  }
  const fromDia = (dia, a = 0) => note(((dia % 7) + 7) % 7, Math.floor(dia / 7), a);
  function parse(id) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(id);
    return note(LETTERS.indexOf(m[1]), +m[3], m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  /** 白鍵・黒鍵の midi から音を作る。黒鍵は preferFlat で ♭ 表記にする */
  function fromMidi(midi, preferFlat) {
    const o = Math.floor(midi / 12) - 1;
    const s = midi % 12;
    const l = SEMI.indexOf(s);
    if (l >= 0) return note(l, o, 0);
    return preferFlat ? note(SEMI.indexOf(s + 1), o, -1) : note(SEMI.indexOf(s - 1), o, 1);
  }
  const isWhite = (midi) => SEMI.includes(midi % 12);

  function name(n, sys = 'doremi') {
    const b = BASE[sys][n.l];
    if (!n.a) return b;
    if (sys === 'haniho') return (n.a > 0 ? '嬰' : '変') + b;
    if (sys === 'de') {
      if (n.a > 0) return b + 'is';
      if (n.l === 6) return 'B';
      if (n.l === 2) return 'Es';
      if (n.l === 5) return 'As';
      return b + 'es';
    }
    return b + (n.a > 0 ? '♯' : '♭');
  }
  /** 科学的表記（C4 = 真ん中のド） */
  const sci = (n) => LETTERS[n.l] + (n.a > 0 ? '♯' : n.a < 0 ? '♭' : '') + n.o;
  const octJa = (n) => (OCT_JA[n.o] || '') + name(n, 'haniho');
  /** 黒鍵は「ド♯／レ♭」のように両方の名前 */
  function pcLabel(midi, sys) {
    const a = fromMidi(midi, false);
    if (!a.a) return name(a, sys);
    return name(a, sys) + '／' + name(fromMidi(midi, true), sys);
  }

  // ---------- 記号と音域 ----------
  const CLEFS = {
    treble: { label: 'ト音記号', bottom: 30 }, // 第1線 = E4
    bass: { label: 'ヘ音記号', bottom: 18 }    // 第1線 = G2
  };
  const posOf = (n, clef) => n.dia - CLEFS[clef].bottom;
  const noteAt = (pos, clef, a = 0) => fromDia(pos + CLEFS[clef].bottom, a);

  /** 線と間の呼び方（第1線＝いちばん下の線） */
  function posName(pos) {
    if (pos % 2 === 0) {
      if (pos < 0) return '下第' + (-pos / 2) + '線';
      if (pos > 8) return '上第' + ((pos - 8) / 2) + '線';
      return '第' + (pos / 2 + 1) + '線';
    }
    if (pos < 0) return '下第' + ((-pos + 1) / 2) + '間';
    if (pos > 8) return '上第' + ((pos - 7) / 2) + '間';
    return '第' + ((pos + 1) / 2) + '間';
  }
  const ledgerCount = (pos) => (pos <= -2 ? Math.floor(-pos / 2) : pos >= 10 ? Math.floor((pos - 8) / 2) : 0);

  /** 加線 level 本までの位置の範囲。すぐ外の間（加線なしで書ける音）も含む。level = -1 は五線の中だけ */
  const rangeOf = (level) => (level < 0 ? [0, 8] : [-(2 * level + 1), 9 + 2 * level]); // -1 は五線の中だけ

  function pool(clef, level, withAcc) {
    const [lo, hi] = rangeOf(level);
    const out = [];
    for (let p = lo; p <= hi; p++) {
      const n = noteAt(p, clef);
      out.push(n);
      if (withAcc) {
        if (SHARPABLE.includes(n.l)) out.push(noteAt(p, clef, 1));
        if (FLATTABLE.includes(n.l)) out.push(noteAt(p, clef, -1));
      }
    }
    return out;
  }

  // ---------- 五線譜（SVG） ----------
  const SP = 10;          // 線の間隔
  const H = SP / 2;
  const CLEF_CH = { treble: '\u{1D11E}', bass: '\u{1D122}' };
  // 記号のインクの上端・下端（五線の第5線からの距離）。フォントが違っても同じ位置に収まるよう、実測して合わせる
  const CLEF_BOX = { treble: [-17, 56], bass: [-0.6, 32] };
  const CLEF_FONT = '"Noto Music", "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", serif';
  let metricCache = {};

  function metrics(ch) {
    if (metricCache[ch]) return metricCache[ch];
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.font = '100px ' + CLEF_FONT;
      const m = c.measureText(ch);
      const r = { asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight };
      if (r.asc + r.desc > 1) return (metricCache[ch] = r);
    } catch (e) { /* canvas が使えない */ }
    return { asc: 70, desc: 30, left: 0, right: 40 };
  }

  function clefSVG(clef, x, top) {
    const [t, b] = CLEF_BOX[clef];
    const m = metrics(CLEF_CH[clef]);
    const k = (b - t) / (m.asc + m.desc);
    return {
      svg: `<text class="clef" x="${(x + m.left * k).toFixed(2)}" y="${(top + t + m.asc * k).toFixed(2)}" font-size="${(100 * k).toFixed(2)}">${CLEF_CH[clef]}</text>`,
      width: (m.left + m.right) * k
    };
  }

  const SHARP = '<path class="acc-stroke" d="M-1.9,-12.5V11 M2,-13.5V10"/><path class="acc-fill" d="M-5,-3.2 L5,-6.2 V-3.6 L-5,-0.6Z M-5,4.2 L5,1.2 V3.8 L-5,6.8Z"/>';
  const FLAT = '<path class="acc-stroke" d="M-2.6,-16V4.6"/><path class="acc-fill" d="M-2.6,4.6 C1,2.6 5.2,-0.4 4.6,-3 C4.1,-5.2 0.6,-5.3 -2.6,-2.2 V-0.4 C-0.4,-2.8 2.4,-3.3 2.6,-1.8 C2.8,-0.2 0.4,2 -2.6,3.4Z"/>';
  const NATURAL = '<path class="acc-stroke" d="M-2.6,-12V5.2 M2.6,-5.2V12"/><path class="acc-fill" d="M-2.6,-2.6 L2.6,-4.6 V-2 L-2.6,0Z M-2.6,4 L2.6,2 V4.6 L-2.6,6.6Z"/>';

  function ellipsePath(cx, cy, rx, ry, deg) {
    const t = (deg * Math.PI) / 180;
    const dx = rx * Math.cos(t), dy = rx * Math.sin(t);
    return `M${(cx - dx).toFixed(2)},${(cy - dy).toFixed(2)} a${rx},${ry} ${deg} 1,0 ${(2 * dx).toFixed(2)},${(2 * dy).toFixed(2)} a${rx},${ry} ${deg} 1,0 ${(-2 * dx).toFixed(2)},${(-2 * dy).toFixed(2)}Z`;
  }

  /** 1つの音符（加線・符頭・符尾・臨時記号） */
  function noteSVG(n, x, staff, opt) {
    const pos = posOf(n, staff.clef);
    const y = staff.yOf(pos);
    const mid = staff.top + 2 * SP;
    let s = `<g class="note ${opt.cls || ''}">`;
    for (let p = -2; p >= pos; p -= 2) s += `<line class="ledger" x1="${x - 10.5}" x2="${x + 10.5}" y1="${staff.yOf(p)}" y2="${staff.yOf(p)}"/>`;
    for (let p = 10; p <= pos; p += 2) s += `<line class="ledger" x1="${x - 10.5}" x2="${x + 10.5}" y1="${staff.yOf(p)}" y2="${staff.yOf(p)}"/>`;
    if (opt.whole) {
      s += `<path class="head" fill-rule="evenodd" d="${ellipsePath(x, y, 7, 4.7, 0)} ${ellipsePath(x, y, 3.6, 2.5, 55)}"/>`;
    } else {
      s += `<ellipse class="head" cx="${x}" cy="${y}" rx="6" ry="4.3" transform="rotate(-22 ${x} ${y})"/>`;
      if (pos < 4) s += `<line class="stem" x1="${x + 5.3}" x2="${x + 5.3}" y1="${y - 1.5}" y2="${Math.min(y - 35, mid)}"/>`;
      else s += `<line class="stem" x1="${x - 5.3}" x2="${x - 5.3}" y1="${y + 1.5}" y2="${Math.max(y + 35, mid)}"/>`;
    }
    if (n.a || opt.natural) {
      const g = n.a > 0 ? SHARP : n.a < 0 ? FLAT : NATURAL;
      s += `<g class="acc" transform="translate(${x - (opt.whole ? 17 : 15.5)} ${y})">${g}</g>`;
    }
    return s + '</g>';
  }

  /**
   * 五線譜の SVG を返す
   *   clef: 'treble' | 'bass' | 'grand'
   *   items: [{ n, clef（大譜表のときどちらの段か）, x, cls }]
   *   level: 高さを揃えるための音域（加線の本数）
   */
  function staffSVG(o) {
    const clef = o.clef || 'treble';
    const items = o.items || [];
    const level = o.level == null ? 2 : o.level;
    const width = o.width || 160;
    const grand = clef === 'grand';
    const left = grand ? 14 : 2;
    const [rlo, rhi] = o.span || rangeOf(level);
    const staves = grand
      ? [{ clef: 'treble', top: 0 }, { clef: 'bass', top: 40 + (o.gap || 64) }]
      : [{ clef, top: 0 }];
    staves.forEach((st) => { st.yOf = (p) => st.top + 4 * SP - p * H; });
    const staffFor = (it) => (grand ? staves[(it.clef || (it.n.midi >= 60 ? 'treble' : 'bass')) === 'treble' ? 0 : 1] : staves[0]);

    let body = '';
    let clefW = 0;
    staves.forEach((st) => {
      for (let i = 0; i < 5; i++) body += `<line class="line" x1="${left}" x2="${width - 2}" y1="${st.top + i * SP}" y2="${st.top + i * SP}"/>`;
      if (o.clefs !== false) {
        const c = clefSVG(st.clef, left + 3, st.top);
        body += c.svg;
        clefW = Math.max(clefW, c.width);
      }
    });
    if (grand) {
      const y1 = staves[0].top, y2 = staves[1].top + 4 * SP, ym = (y1 + y2) / 2, bx = left - 3;
      body += `<line class="line" x1="${left}" x2="${left}" y1="${y1}" y2="${y2}"/>`;
      body += `<path class="brace" d="M${bx},${y1} Q${bx - 5},${y1 + 2} ${bx - 5},${y1 + 14} L${bx - 5},${ym - 12} Q${bx - 5},${ym - 2} ${bx - 10},${ym} Q${bx - 5},${ym + 2} ${bx - 5},${ym + 12} L${bx - 5},${y2 - 14} Q${bx - 5},${y2 - 2} ${bx},${y2}"/>`;
    }
    if (o.barline) staves.forEach((st) => { body += `<line class="line" x1="${width - 2}" x2="${width - 2}" y1="${st.top}" y2="${st.top + 4 * SP}"/>`; });

    // 縦の範囲：記号と、音域いっぱいの音符が収まるように
    let yMin = Infinity, yMax = -Infinity;
    const extend = (st, lo, hi) => {
      yMin = Math.min(yMin, st.top + CLEF_BOX[st.clef][0], st.yOf(hi) - 8);
      yMax = Math.max(yMax, st.top + CLEF_BOX[st.clef][1], st.yOf(lo) + 8);
    };
    if (grand) { extend(staves[0], 0, rhi); extend(staves[1], rlo, 8); } else extend(staves[0], rlo, rhi);

    const startX = left + (o.clefs === false ? 8 : clefW + 14);
    items.forEach((it, i) => {
      const st = staffFor(it);
      const x = it.x != null ? it.x : startX + ((width - startX - 6) * (i + 0.5)) / items.length;
      const p = posOf(it.n, st.clef);
      const stemUp = o.whole ? 0 : p < 4 ? 30 : 0, stemDown = o.whole ? 0 : p >= 4 ? 30 : 0;
      yMin = Math.min(yMin, st.yOf(p) - 8 - stemUp);
      yMax = Math.max(yMax, st.yOf(p) + 8 + stemDown);
      body += noteSVG(it.n, x, st, { cls: it.cls, whole: o.whole, natural: it.natural });
    });
    yMin = Math.floor(yMin - 3);
    yMax = Math.ceil(yMax + 3);
    const xMin = grand ? 0 : 0;
    return `<svg class="staff ${o.cls || ''}" viewBox="${xMin} ${yMin} ${width} ${yMax - yMin}" role="img" aria-label="${o.label || '五線譜'}">${body}</svg>`;
  }

  // ---------- 鍵盤 ----------
  /**
   * lo〜hi（白鍵の midi）の鍵盤を container に作る
   *   labels: 'none' | 'c'（ドだけ）| 'all'
   */
  function piano(container, o) {
    const sys = () => (typeof o.sys === 'function' ? o.sys() : o.sys || 'doremi');
    const root = document.createElement('div');
    root.className = 'piano';
    const whites = [];
    for (let m = o.lo; m <= o.hi; m++) if (isWhite(m)) whites.push(m);
    const W = whites.length;
    const keys = {};
    const make = (midi, cls, style) => {
      const k = document.createElement('button');
      k.type = 'button';
      k.className = cls;
      k.dataset.midi = midi;
      if (style) k.setAttribute('style', style);
      k.setAttribute('aria-label', sci(fromMidi(midi)));
      keys[midi] = k;
      root.appendChild(k);
      return k;
    };
    whites.forEach((m) => {
      const k = make(m, 'wk' + (m === 60 ? ' middle-c' : ''));
      k.appendChild(document.createElement('span')).className = 'kl';
    });
    whites.forEach((m, i) => {
      if (i < W - 1 && whites[i + 1] - m === 2) {
        const bw = 62 / W;
        make(m + 1, 'bk', `left:${((i + 1) * 100) / W - bw / 2}%;width:${bw}%`);
      }
    });
    function setLabels(mode) {
      root.dataset.labels = mode;
      whites.forEach((m) => {
        const n = fromMidi(m);
        const show = mode === 'all' || (mode === 'c' && n.l === 0);
        keys[m].firstChild.innerHTML = show ? `${name(n, sys())}<small>${n.o}</small>` : '';
      });
    }
    setLabels(o.labels || 'c');
    // onPress が音（release() を持つもの）を返したら、指を離すまで持続音をのばす
    const held = new Map();
    root.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('[data-midi]');
      if (!k || k.disabled) return;
      e.preventDefault();
      const midi = +k.dataset.midi;
      k.classList.add('down');
      try { k.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      const ret = o.onPress ? o.onPress(midi, k) : null;
      if (ret && ret.release) held.set(e.pointerId, ret);
    });
    const up = (e) => {
      const k = e.target.closest && e.target.closest('[data-midi]');
      if (k) k.classList.remove('down');
      const v = held.get(e.pointerId);
      if (v) { v.release(); held.delete(e.pointerId); }
    };
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('lostpointercapture', up);
    // キーボード操作（Enter/Space）でも押せるように
    root.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      const k = e.target.closest('[data-midi]');
      if (k && o.onPress) o.onPress(+k.dataset.midi, k);
    });
    container.innerHTML = '';
    container.appendChild(root);
    return {
      el: root,
      key: (midi) => keys[midi],
      mark(midi, cls) { if (keys[midi]) keys[midi].classList.add(cls); },
      clear() { Object.values(keys).forEach((k) => k.classList.remove('is-correct', 'is-wrong', 'hit')); },
      lock(v) { Object.values(keys).forEach((k) => { k.disabled = v; }); },
      setLabels
    };
  }

  // ---------- 音源（Web Audio で合成） ----------
  // sustain: 鳴らしている間は同じ大きさで続く音（鍵盤を押している間のばせる）
  const TONES = {
    piano: { label: 'ピアノ', sustain: false },
    sine: { label: '純音（サイン波）', sustain: true },
    organ: { label: 'オルガン', sustain: true },
    synth: { label: 'シンセ', sustain: true },
    strings: { label: 'ストリングス', sustain: true },
    bell: { label: 'オルゴール', sustain: false }
  };
  const SUSTAIN = {
    sine: { a: 0.02, r: 0.15, l: 0.34 },
    organ: { a: 0.012, r: 0.08, l: 0.3 },
    synth: { a: 0.02, r: 0.3, l: 0.26 },
    strings: { a: 0.16, r: 0.4, l: 0.24 }
  };

  const Sound = {
    ctx: null, out: null, volume: 0.8, type: 'piano', dur: 1, voices: new Set(),
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        const ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.out = ctx.createGain();
        this.out.gain.value = this.volume;
        this.out.connect(comp);
        comp.connect(ctx.destination);
        this.ctx = ctx;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    setVolume(v) { this.volume = v; if (this.out) this.out.gain.value = v; },
    setType(t) { this.type = TONES[t] ? t : 'piano'; },
    setDur(d) { this.dur = +d || 1; },
    stop() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.voices.forEach((v) => {
        try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + 0.05); } catch (e) { /* noop */ }
        v.oscs.forEach((osc) => { try { osc.stop(t + 0.06); } catch (e) { /* noop */ } });
      });
      this.voices.clear();
    },
    /** 持続音を離す（ピアノ・オルゴールは自然に減衰するので何もしない） */
    release(v) {
      if (!v || !v.env || !this.ctx) return;
      const now = this.ctx.currentTime;
      try {
        v.env.gain.cancelScheduledValues(now);
        v.env.gain.setValueAtTime(v.env.gain.value, now);
        v.env.gain.setTargetAtTime(0, now, v.rel / 3);
      } catch (e) { /* noop */ }
      v.oscs.forEach((o) => { try { o.stop(now + v.rel * 1.6); } catch (e) { /* noop */ } });
    },
    /**
     * midi の音を when 秒後に鳴らす
     *   dur: 持続音の長さ（秒）。省略時は設定の長さ、'hold' は release() されるまで（最長 8 秒）
     */
    play(midi, when = 0, dur) {
      const ctx = this.unlock();
      if (!ctx) return null;
      const type = TONES[this.type] ? this.type : 'piano';
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const t = ctx.currentTime + 0.02 + when;
      const len = dur === 'hold' ? 8 : dur == null ? this.dur : dur;
      const voice = ctx.createGain();
      voice.gain.value = 1;
      voice.connect(this.out);
      const oscs = [];
      const osc = (wave, freq, dest, detune = 0) => {
        const o = ctx.createOscillator();
        o.type = wave;
        o.frequency.value = freq;
        o.detune.value = detune;
        o.connect(dest);
        o.start(t);
        oscs.push(o);
        return o;
      };
      let env = null, rel = 0, end;

      if (type === 'piano') {
        const decay = Math.min(3.2, Math.max(0.7, 2.2 * Math.pow(262 / f, 0.45)));
        voice.gain.value = f < 180 ? 1.35 : f > 900 ? 0.8 : 1;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(Math.min(14000, f * 12), t);
        lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.2, 500), t + decay);
        lp.connect(voice);
        [[1, 1], [2, 0.5], [3, 0.24], [4, 0.13], [5, 0.07], [6, 0.04], [8, 0.02]].forEach(([h, amp]) => {
          const fh = f * h * (1 + 0.00035 * h * h);
          if (fh > 16000) return;
          const g = ctx.createGain();
          const peak = 0.26 * amp;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(peak, t + 0.004);
          g.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.09);
          g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + 0.45 * (h - 1)));
          g.connect(lp);
          osc('sine', fh, g);
        });
        end = t + decay + 0.05;
      } else if (type === 'bell') {
        // オルゴール：澄んだ基音に、少しずれた高い倍音
        const d0 = Math.min(2.4, Math.max(0.6, 1.6 * Math.pow(523 / f, 0.3)));
        [[1, 1, 1], [2, 0.18, 0.6], [3, 0.3, 0.45], [4.2, 0.1, 0.3], [5.4, 0.06, 0.2]].forEach(([h, a, dk]) => {
          if (f * h > 16000) return;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.3 * a, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d0 * dk);
          g.connect(voice);
          osc('sine', f * h, g);
        });
        end = t + d0;
      } else {
        const P = SUSTAIN[type];
        rel = P.r;
        env = ctx.createGain();
        env.connect(voice);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(P.l, t + P.a);
        if (type === 'synth') env.gain.setTargetAtTime(P.l * 0.7, t + P.a, 0.15);
        let dest = env;
        if (type === 'synth' || type === 'strings') {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          if (type === 'synth') {
            lp.Q.value = 3;
            lp.frequency.setValueAtTime(Math.min(9000, f * 10), t);
            lp.frequency.setTargetAtTime(Math.min(6000, f * 3.5), t + 0.02, 0.18);
          } else {
            lp.Q.value = 0.7;
            lp.frequency.value = Math.min(5000, f * 4.5);
          }
          lp.connect(env);
          dest = lp;
        }
        if (type === 'sine') osc('sine', f, dest);
        if (type === 'organ') {
          const mix = ctx.createGain();
          mix.gain.value = 1 / 2.6;
          mix.connect(dest);
          [[1, 1], [2, 0.7], [3, 0.4], [4, 0.25], [6, 0.15], [8, 0.1]].forEach(([h, a]) => {
            if (f * h > 14000) return;
            const g = ctx.createGain();
            g.gain.value = a;
            g.connect(mix);
            osc('sine', f * h, g);
          });
        }
        if (type === 'synth') {
          const g = ctx.createGain();
          g.gain.value = 0.45;
          g.connect(dest);
          osc('sawtooth', f, g, -7);
          osc('sawtooth', f, g, 7);
          const sub = ctx.createGain();
          sub.gain.value = 0.25;
          sub.connect(dest);
          osc('square', f / 2, sub);
        }
        if (type === 'strings') {
          const g = ctx.createGain();
          g.gain.value = 0.33;
          g.connect(dest);
          // ゆるやかにかかるビブラート
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 5.3;
          const depth = ctx.createGain();
          depth.gain.setValueAtTime(0, t);
          depth.gain.linearRampToValueAtTime(6, t + 0.4);
          lfo.connect(depth);
          lfo.start(t);
          oscs.push(lfo);
          [-10, 0, 10].forEach((dt) => depth.connect(osc('sawtooth', f, g, dt).detune));
        }
        const relAt = t + Math.max(len, P.a + 0.05);
        env.gain.setTargetAtTime(0, relAt, rel / 3);
        end = relAt + rel * 1.6;
      }
      oscs.forEach((o) => o.stop(end));
      const v = { gain: voice, oscs, env, rel };
      v.release = () => this.release(v);
      this.voices.add(v);
      oscs[0].onended = () => this.voices.delete(v);
      return v;
    },
    seq(list, gap = 0.7) { list.forEach((m, i) => this.play(m, i * gap, Math.min(this.dur, gap * 0.9))); }
  };

  window.Music = {
    LETTERS, SEMI, BASE, SYSTEMS, CLEFS, TONES, note, fromDia, fromMidi, parse, isWhite, name, sci, octJa, pcLabel,
    posOf, noteAt, posName, ledgerCount, rangeOf, pool, staffSVG, piano, Sound,
    resetMetrics() { metricCache = {}; },
    CLEF_FONT
  };
})();
