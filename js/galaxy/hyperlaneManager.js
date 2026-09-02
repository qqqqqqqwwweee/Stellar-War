/* ===========================================================
 *  HyperlaneManager —— 超空间航道生成与分析
 *  1) 泊松盘采样生成恒星位置
 *  2) k 近邻 + MST + 环路补充 + 少量长程跳线 构建航道
 *  3) 保证连通、限制最大长度与最大度数
 *  4) 介数中心性分析 -> 枢纽 / 瓶颈
 *  5) 母星系航道裁剪为 1 条（防御瓶颈）
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class HyperlaneManager {
    constructor(rng) { this.rng = rng; }

    /* ---------------- 位置生成 ---------------- */
    generatePositions(count, cfg) {
      const R = cfg.radius, minD = cfg.minStarDist, hole = cfg.centerHole;
      const pts = [];
      let guard = 0;
      // 泊松盘（可变半径松弛，保证一定能放满）
      while (pts.length < count && guard < count * 900) {
        guard++;
        const relax = guard > count * 400 ? 0.55 : (guard > count * 150 ? 0.78 : 1.0);
        let placed = false;
        for (let attempt = 0; attempt < 24; attempt++) {
          const ang = this.rng.next() * Math.PI * 2;
          // sqrt 分布让恒星在圆盘上均匀
          const rr = hole + Math.sqrt(this.rng.next()) * (R - hole);
          const x = Math.cos(ang) * rr;
          const y = Math.sin(ang) * rr * this.rng.range(0.86, 1.0); // 轻微椭圆，更像银河
          let ok = true;
          for (const p of pts) { if (U.dist2(x, y, p.x, p.y) < (minD * relax) * (minD * relax)) { ok = false; break; } }
          if (ok) { pts.push({ x, y }); placed = true; break; }
        }
        if (!placed && relax <= 0.55) {
          // 极端情况下强行插入（仍保持一定距离）
          const ang = this.rng.next() * Math.PI * 2;
          const rr = hole + Math.sqrt(this.rng.next()) * (R - hole);
          pts.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
        }
      }
      return pts;
    }

    /* ---------------- 航道构建 ---------------- */
    buildLanes(stars, cfg) {
      const L = cfg.lane;
      const n = stars.length;
      const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
      const edgeSet = new Set();
      const edges = [];

      const addEdge = (a, b) => {
        if (a === b) return false;
        const k = key(a, b);
        if (edgeSet.has(k)) return false;
        const d = U.dist(stars[a].x, stars[a].y, stars[b].x, stars[b].y);
        if (d > L.maxLaneLength) return false;
        edgeSet.add(k);
        edges.push({ a, b, d });
        return true;
      };

      /* 1) k 近邻 */
      for (let i = 0; i < n; i++) {
        const dists = [];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          dists.push({ j, d: U.dist2(stars[i].x, stars[i].y, stars[j].x, stars[j].y) });
        }
        dists.sort((p, q) => p.d - q.d);
        const k = Math.max(1, Math.min(L.kNearest, dists.length));
        for (let m = 0; m < k; m++) addEdge(i, dists[m].j);
      }

      /* 2) 连通性：对未连通分量用 MST 边缝合（Prim over full graph） */
      const adj = () => {
        const a = new Map();
        for (let i = 0; i < n; i++) a.set(i, []);
        for (const e of edges) { a.get(e.a).push(e.b); a.get(e.b).push(e.a); }
        return a;
      };
      const components = (a) => {
        const seen = new Array(n).fill(-1);
        let c = 0;
        for (let i = 0; i < n; i++) {
          if (seen[i] !== -1) continue;
          const stack = [i]; seen[i] = c;
          while (stack.length) {
            const v = stack.pop();
            for (const w of a.get(v)) if (seen[w] === -1) { seen[w] = c; stack.push(w); }
          }
          c++;
        }
        return { seen, count: c };
      };

      let guard = 0;
      while (guard++ < 40) {
        const a = adj();
        const { seen, count } = components(a);
        if (count <= 1) break;
        // 找出跨分量的最短边并加入
        let best = null;
        for (let i = 0; i < n; i++) {
          const dists = [];
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            dists.push({ j, d: U.dist2(stars[i].x, stars[i].y, stars[j].x, stars[j].y) });
          }
          dists.sort((p, q) => p.d - q.d);
          for (let m = 0; m < Math.min(12, dists.length); m++) {
            const j = dists[m].j;
            if (seen[i] !== seen[j]) { best = { a: i, b: j }; break; }
          }
          if (best) break;
        }
        if (!best) break;
        if (!addEdge(best.a, best.b)) {
          // 长度超限仍强制连接，保证连通图
          const k = key(best.a, best.b);
          if (!edgeSet.has(k)) {
            edgeSet.add(k);
            edges.push({ a: best.a, b: best.b, d: U.dist(stars[best.a].x, stars[best.a].y, stars[best.b].x, stars[best.b].y) });
          } else break;
        }
      }

      /* 3) 环路补充（制造环形路线与多方向进攻路线） */
      for (let i = 0; i < n; i++) {
        if (!this.rng.chance(L.extraLoopChance)) continue;
        if (this.degreeOf(edges, i) >= L.maxDegree) continue;
        const dists = [];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          dists.push({ j, d: U.dist2(stars[i].x, stars[i].y, stars[j].x, stars[j].y) });
        }
        dists.sort((p, q) => p.d - q.d);
        const cands = dists.slice(1, 5);
        for (const c of cands) {
          if (this.degreeOf(edges, c.j) >= L.maxDegree) continue;
          if (addEdge(i, c.j)) break;
        }
      }

      /* 4) 少量长程战略跳线（跨区域通道，制造大战场） */
      const longCount = Math.max(2, Math.round(n * L.longRangeChance));
      for (let k = 0; k < longCount; k++) {
        const i = this.rng.int(0, n - 1);
        let best = null, bestD = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const d = U.dist(stars[i].x, stars[i].y, stars[j].x, stars[j].y);
          if (d > bestD && d < L.maxLaneLength * 1.35) { bestD = d; best = j; }
        }
        if (best != null && this.degreeOf(edges, i) < L.maxDegree && this.degreeOf(edges, best) < L.maxDegree) {
          addEdge(i, best);
        }
      }

      /* 5) 写入恒星（links 中存的是「恒星 id」而非下标） */
      for (const s of stars) s.links = [];
      for (const e of edges) {
        stars[e.a].links.push(stars[e.b].id);
        stars[e.b].links.push(stars[e.a].id);
      }
      for (const s of stars) s.degree = s.links.length;

      return edges;
    }

    degreeOf(edges, i) {
      let d = 0;
      for (const e of edges) { if (e.a === i) d++; if (e.b === i) d++; }
      return d;
    }

    /* ---------------- 介数中心性（Brandes，无权图） ---------------- */
    computeBetweenness(stars) {
      const n = stars.length;
      for (const s of stars) s.betweenness = 0;
      // 规模不大（<=160），O(V*(V+E)) 可接受，仅在生成时算一次
      const idxOf = new Map();
      stars.forEach((s, i) => idxOf.set(s.id, i));

      for (let s = 0; s < n; s++) {
        const stack = [];
        const P = []; for (let i = 0; i < n; i++) P.push([]);
        const sigma = new Float64Array(n); sigma[s] = 1;
        const d = new Int32Array(n).fill(-1); d[s] = 0;
        const Q = [s];
        while (Q.length) {
          const v = Q.shift(); stack.push(v);
          for (const wId of stars[v].links) {
            const w = idxOf.get(wId);
            if (w === undefined) continue;
            if (d[w] < 0) { Q.push(w); d[w] = d[v] + 1; }
            if (d[w] === d[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
          }
        }
        const delta = new Float64Array(n);
        while (stack.length) {
          const w = stack.pop();
          for (const v of P[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
          if (w !== s) stars[w].betweenness += delta[w];
        }
      }
      // 归一化
      const norm = (n - 1) * (n - 2) / 2;
      if (norm > 0) for (const s of stars) s.betweenness /= norm;
    }

    /* ---------------- 枢纽 / 瓶颈标记 ---------------- */
    markStrategic(stars) {
      const sorted = stars.slice().sort((a, b) => b.betweenness - a.betweenness);
      const topCount = Math.max(6, Math.round(stars.length * 0.12));
      for (let i = 0; i < topCount && i < sorted.length; i++) sorted[i].isHub = true;
      // 瓶颈：度数低但介数高 = 必经之路
      for (const s of stars) {
        if (s.degree <= 2 && s.betweenness > 0.012) s.isChoke = true;
        if (s.degree === 1 && s.betweenness > 0.004) s.isChoke = true;
      }
      // 保证至少有若干个瓶颈
      let chokes = stars.filter(s => s.isChoke).length;
      if (chokes < 4) {
        for (const s of sorted) { if (chokes >= 8) break; if (!s.isChoke) { s.isChoke = true; chokes++; } }
      }
    }

    /* ---------------- 母星系处理 ---------------- */
    /** 挑选四个角落的母星（边缘、彼此远离） */
    pickHomeStars(stars, factionDefs, cfg) {
      const R = cfg.radius;
      const dirs = { TL: [-1, -1], TR: [1, -1], BL: [-1, 1], BR: [1, 1] };
      const chosen = [];
      for (const f of factionDefs) {
        const dir = dirs[f.corner] || [1, 1];
        let best = null, bestScore = -Infinity;
        for (const s of stars) {
          if (chosen.indexOf(s.id) >= 0) continue;
          if (s.isHome) continue;
          const r = Math.sqrt(s.x * s.x + s.y * s.y);
          const nx = s.x / r, ny = s.y / r;
          // 与角落方向的一致性 + 靠边缘 + 度数适中（不要太高，免得裁剪失败）
          const align = nx * dir[0] + ny * dir[1];
          let score = align * 2.4 + (r / R) * 1.1 - s.degree * 0.10;
          // 远离已选的其他母星
          for (const cs of chosen) {
            const d = U.dist(s.x, s.y, cs.x, cs.y);
            score += Math.min(1.6, d / (R * 1.1)) * 1.5;
          }
          score += this.rng.range(0, 0.25);
          if (score > bestScore) { bestScore = score; best = s; }
        }
        if (best) { chosen.push(best); best.isHome = true; best.homeOf = f.id; }
      }
      return chosen.map(s => s.id);
    }

    /**
     * 将母星系的航道裁剪到 1 条（超级防御瓶颈）。
     * 逐条尝试移除多余的边，若移除导致图不连通则保留。
     */
    enforceCapitalBottleneck(stars, homeIds) {
      const idxOf = new Map();
      stars.forEach((s, i) => idxOf.set(s.id, i));
      const report = {};

      const connected = () => {
        const n = stars.length;
        const seen = new Uint8Array(n);
        let start = 0;
        seen[start] = 1;
        const stack = [start];
        let cnt = 1;
        while (stack.length) {
          const v = stack.pop();
          for (const wId of stars[v].links) {
            const w = idxOf.get(wId);
            if (w === undefined || seen[w]) continue;
            seen[w] = 1; cnt++; stack.push(w);
          }
        }
        return cnt === n;
      };

      for (const hid of homeIds) {
        const s = stars[idxOf.get(hid)];
        if (!s) continue;
        // 按距离排序保留最近的邻居
        const neigh = s.links.slice().map(id => ({ id, d: U.dist(s.x, s.y, stars[idxOf.get(id)].x, stars[idxOf.get(id)].y) }));
        neigh.sort((a, b) => a.d - b.d);
        let removed = 0;
        while (s.links.length > 1) {
          // 找到该移除的候选（最远的）
          const target = neigh.filter(x => s.links.indexOf(x.id) >= 0).pop();
          if (!target) break;
          // 移除
          s.links = s.links.filter(x => x !== target.id);
          const other = stars[idxOf.get(target.id)];
          other.links = other.links.filter(x => x !== s.id);
          if (!connected()) {
            // 回滚
            s.links.push(target.id);
            other.links.push(s.id);
            break;
          }
          removed++;
          s.degree = s.links.length;
          other.degree = other.links.length;
        }
        report[hid] = { degree: s.links.length, removed: removed };
      }
      for (const s of stars) s.degree = s.links.length;
      return report;
    }

    /** 是否是两个势力之间的必经通道（用于军事 AI） */
    isChokeBetween(stars, a, b) { return a.isChoke; }
  }

  SW.HyperlaneManager = HyperlaneManager;
})(window.SW);
