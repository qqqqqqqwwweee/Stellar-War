/* ===========================================================
 *  GalaxyManager —— 银河地图的总管
 *  生成 / 查询 / 距离（跳数） / 边界 / 序列化
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class GalaxyManager {
    constructor(rng, cfg) {
      this.rng = rng;
      this.cfg = cfg;
      this.stars = [];
      this.byId = {};
      this.edges = [];
      this.homeIds = [];
      this.laneManager = new SW.HyperlaneManager(rng);
      this._distCache = {};
      this._distCacheKey = '';
    }

    /* ---------------- 生成 ---------------- */
    generate(starCount) {
      const cfg = this.cfg;
      const n = U.clamp(starCount || cfg.starCount, cfg.starCountMin, cfg.starCountMax);
      this.stars = [];
      this.byId = {};
      this._distCache = {};

      const pts = this.laneManager.generatePositions(n, cfg);

      for (let i = 0; i < pts.length; i++) {
        const type = this._pickWeighted(SW.StarTypeConfig);
        const feature = this._pickWeighted(SW.StarFeatureConfig);
        const s = new SW.StarSystem('S' + i, pts[i].x, pts[i].y, type, feature, this.rng);
        this.stars.push(s);
        this.byId[s.id] = s;
      }

      /* 航道 */
      this.edges = this.laneManager.buildLanes(this.stars, cfg);
      this.laneManager.computeBetweenness(this.stars);
      this.laneManager.markStrategic(this.stars);

      /* 资源 */
      for (const s of this.stars) this.rollResources(s);

      /* 母星系 */
      this.homeIds = this.laneManager.pickHomeStars(this.stars, SW.FactionConfig, cfg);
      const report = this.laneManager.enforceCapitalBottleneck(this.stars, this.homeIds);

      /* 母星强化 */
      for (const h of this.homeIds) {
        const s = this.byId[h];
        s.devLevel = cfg.start.homeDevLevel;
        // 母星资源保底
        s.base.metal = Math.max(s.base.metal, 34);
        s.base.darkMatter = Math.max(s.base.darkMatter, 12);
        s.base.materials = Math.max(s.base.materials, 5);
        s.base.research = Math.max(s.base.research, 16);
        s.isHub = false;
      }
      this.capitalReport = report;
      this.recomputeAllStrategic();
      return this;
    }

    _pickWeighted(table) {
      const keys = Object.keys(table);
      let total = 0;
      for (const k of keys) total += table[k].weight || 1;
      let r = this.rng.next() * total;
      for (const k of keys) {
        r -= (table[k].weight || 1);
        if (r <= 0) return k;
      }
      return keys[0];
    }

    /* ---------------- 资源生成 ---------------- */
    rollResources(s) {
      const R = this.cfg.resources;
      const t = SW.StarTypeConfig[s.type];
      const f = SW.StarFeatureConfig[s.feature] || SW.StarFeatureConfig.none;
      const r = this.rng;
      const span = (range) => r.range(range[0], range[1]);

      let metal = span(R.metal);
      let dm = span(R.darkMatter);
      let mat = span(R.materials);
      let res = span(R.research);

      // 恒星类型加成
      metal *= (t.yield.metal || 1);
      dm *= (t.yield.darkMatter || 1);
      mat *= (t.yield.materials || 1);
      res *= (t.yield.research || 1);
      // 特性加成
      const fy = f.yield || {};
      metal *= (fy.metal || 1);
      dm *= (fy.darkMatter || 1);
      mat *= (fy.materials || 1);
      res *= (fy.research || 1);

      s.base.metal = U.round(metal, 1);
      s.base.darkMatter = U.round(dm, 1);
      s.base.materials = U.round(mat, 2);
      s.base.research = U.round(res, 1);
      if (s.base.materials > 0 && s.base.materials < 0.4) s.base.materials = 0.4;
    }

    recomputeAllStrategic() { for (const s of this.stars) s.computeStrategicValue(); }

    /* ---------------- 查询 ---------------- */
    get(id) { return this.byId[id]; }
    get starsOwned() { return this.stars; }

    starsOf(factionId) { return this.stars.filter(s => s.owner === factionId); }

    /** 沿航道 BFS，返回 {starId -> 跳数} 的映射（从若干起点出发） */
    hopsFrom(startIds, maxHops) {
      const key = startIds.slice().sort().join(',') + '|' + (maxHops || 99);
      if (this._distCache[key]) return this._distCache[key];
      const dist = {};
      const q = [];
      for (const id of startIds) { dist[id] = 0; q.push(id); }
      let head = 0;
      const limit = maxHops || 99;
      while (head < q.length) {
        const v = q[head++];
        const dv = dist[v];
        if (dv >= limit) continue;
        const s = this.byId[v];
        if (!s) continue;
        for (const w of s.links) {
          if (dist[w] === undefined) { dist[w] = dv + 1; q.push(w); }
        }
      }
      this._distCache[key] = dist;
      if (Object.keys(this._distCache).length > 60) this._distCache = {};
      return dist;
    }

    invalidateDistanceCache() { this._distCache = {}; }

    /** A* / Dijkstra：沿航道求最短跳数路径，返回 star id 数组（含起终点） */
    path(fromId, toId) {
      if (fromId === toId) return [fromId];
      const prev = {};
      const dist = {};
      const q = [fromId];
      dist[fromId] = 0;
      let head = 0;
      let found = false;
      while (head < q.length) {
        const v = q[head++];
        if (v === toId) { found = true; break; }
        const s = this.byId[v];
        if (!s) continue;
        for (const w of s.links) {
          if (dist[w] === undefined) { dist[w] = dist[v] + 1; prev[w] = v; q.push(w); }
        }
      }
      if (!found) return null;
      const path = [toId];
      let cur = toId;
      while (prev[cur] !== undefined) { cur = prev[cur]; path.unshift(cur); }
      return path;
    }

    /** 某恒星的邻居（返回 StarSystem 数组） */
    neighbors(s) { return s.links.map(id => this.byId[id]).filter(Boolean); }

    /** 与指定势力接壤（相邻）的恒星 */
    borderStars(factionId) {
      const mine = this.starsOf(factionId);
      const set = new Set();
      for (const s of mine) for (const nId of s.links) {
        const n = this.byId[nId];
        if (n && n.owner !== factionId) set.add(n.id);
      }
      return Array.from(set).map(id => this.byId[id]);
    }

    /** 中立且可殖民（与己方领土相邻或距离内） */
    claimableStars(factionId, maxHops) {
      const mine = this.starsOf(factionId);
      if (!mine.length) return [];
      const d = this.hopsFrom(mine.map(s => s.id), maxHops || 3);
      const out = [];
      for (const id in d) {
        const s = this.byId[id];
        if (s && s.owner === null) out.push(s);
      }
      return out;
    }

    laneLength(a, b) { return U.dist(a.x, a.y, b.x, b.y); }

    /* ---------------- 序列化 ---------------- */
    serialize() {
      return {
        starCount: this.stars.length,
        homeIds: this.homeIds,
        stars: this.stars.map(s => s.serialize())
      };
    }
    deserialize(d) {
      this.stars = d.stars.map(s => SW.StarSystem.deserialize(s));
      this.byId = {};
      for (const s of this.stars) this.byId[s.id] = s;
      this.homeIds = d.homeIds || [];
      this.edges = [];
      const seen = new Set();
      for (const s of this.stars) {
        for (const l of s.links) {
          const k = s.id < l ? s.id + '|' + l : l + '|' + s.id;
          if (!seen.has(k)) { seen.add(k); this.edges.push({ a: s.id, b: l }); }
        }
      }
      this._distCache = {};
      return this;
    }
  }

  SW.GalaxyManager = GalaxyManager;
})(window.SW);
