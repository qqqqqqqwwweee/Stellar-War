/* ===========================================================
 *  星际战争 - 通用工具库
 *  SW.U : 数学 / 随机 / 格式化 / 几何
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  const U = {};

  /* ---------------- 数学 ---------------- */
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.dist = (ax, ay, bx, by) => Math.sqrt(U.dist2(ax, ay, bx, by));
  U.round = (v, n) => { const p = Math.pow(10, n || 0); return Math.round(v * p) / p; };

  /* ---------------- 随机数发生器（可复现） ---------------- */
  class RNG {
    constructor(seed) { this.seed = (seed >>> 0) || (Date.now() >>> 0); this._s = this.seed; }
    next() {
      // mulberry32
      this._s |= 0; this._s = (this._s + 0x6D2B79F5) | 0;
      let t = Math.imul(this._s ^ (this._s >>> 15), 1 | this._s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + this.next() * (b - a); }
    int(a, b) { return Math.floor(a + this.next() * (b - a + 1)); }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    chance(p) { return this.next() < p; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
    /** 按权重挑选：items = [{w:number, ...}] */
    weighted(items, weightFn) {
      let total = 0;
      for (const it of items) total += Math.max(0, weightFn ? weightFn(it) : it.w);
      if (total <= 0) return items[0];
      let r = this.next() * total;
      for (const it of items) {
        r -= Math.max(0, weightFn ? weightFn(it) : it.w);
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    }
    gauss() {
      let u = 0, v = 0;
      while (u === 0) u = this.next();
      while (v === 0) v = this.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    getState() { return this._s; }
    setState(s) { this._s = s | 0; }
  }
  U.RNG = RNG;

  /* ---------------- 格式化 ---------------- */
  U.fmt = function (v) {
    if (v === null || v === undefined || isNaN(v)) return '0';
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
    if (a >= 100) return Math.round(v).toString();
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(1);
  };
  U.pct = (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';

  /* ---------------- ID ---------------- */
  let _idc = 1;
  U.nextId = (p) => (p || 'id') + '_' + (_idc++);
  U.resetIds = () => { _idc = 1; };

  /* ---------------- 颜色 ---------------- */
  U.hexToRgb = function (hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  };
  U.rgba = function (hex, a) {
    const c = U.hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  };
  U.mix = function (h1, h2, t) {
    const a = U.hexToRgb(h1), b = U.hexToRgb(h2);
    const r = Math.round(U.lerp(a.r, b.r, t));
    const g = Math.round(U.lerp(a.g, b.g, t));
    const bl = Math.round(U.lerp(a.b, b.b, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  };

  /* ---------------- 数组工具 ---------------- */
  U.sum = (arr, fn) => { let s = 0; for (const x of arr) s += fn ? fn(x) : x; return s; };
  U.max = (arr, fn) => { let m = -Infinity, r = null; for (const x of arr) { const v = fn ? fn(x) : x; if (v > m) { m = v; r = x; } } return r; };
  U.min = (arr, fn) => { let m = Infinity, r = null; for (const x of arr) { const v = fn ? fn(x) : x; if (v < m) { m = v; r = x; } } return r; };
  U.remove = (arr, item) => { const i = arr.indexOf(item); if (i >= 0) arr.splice(i, 1); return i >= 0; };

  SW.U = U;
})(window.SW);
