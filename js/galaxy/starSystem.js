/* ===========================================================
 *  StarSystem —— 恒星系
 *  负责：资源底数、开发等级、建筑、防御设施、占领进度、战略价值
 *  产出计算交给 EconomySystem（避免循环依赖）
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  const DEV = () => SW.GalaxyConfig.devLevel;

  class StarSystem {
    constructor(id, x, y, starType, feature, rng) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.type = starType;                 // 恒星类型 id
      this.feature = feature;               // 特性 id
      /* 反序列化时 rng 为 null，名称会被存档数据覆盖 */
      this.name = rng ? SW.NameGen.star(rng) : '未命名星系';

      this.owner = null;                    // 势力 id 或 null（中立）
      this.devLevel = 0;                    // 0~5
      this.isHome = false;
      this.homeOf = null;

      /* 基础产出（每日） */
      this.base = { metal: 0, darkMatter: 0, materials: 0, research: 0 };

      /* 建筑：{id, hp, maxHp} */
      this.buildings = [];
      /* 建造队列：{kind:'building'|'dev', id, remaining, total} */
      this.queue = [];
      /* 船坞产能（由建筑聚合得来，缓存） */
      this.shipyardSlots = 0;
      this.shipyardLevel = 0;
      this.shipyardSpeed = 1;

      /* 防御设施 HP（可被打坏，战后自动修复） */
      this.defenseHp = 0;
      this.defenseMaxHp = 0;
      this.starShield = 0;
      this.starShieldMax = 0;

      /* 占领 */
      this.capture = null;   // { factionId, progress, total }

      /* 图论 */
      this.links = [];       // 相邻恒星 id
      this.degree = 0;
      this.betweenness = 0;
      this.isChoke = false;
      this.isHub = false;
      this.strategicValue = 0;

      /* 战争迷雾：每个势力的探索状态 */
      this.explored = {};    // factionId -> true
      this.lastSeen = {};    // factionId -> day

      /* 视觉 */
      this.seed = rng ? rng.int(0, 99999) : 0;
      this.twinkle = rng ? rng.range(0, Math.PI * 2) : 0;
      this.sizeScale = rng ? rng.range(0.85, 1.25) : 1;

      /* 战斗高亮 */
      this.battleFlash = 0;
    }

    /* ---------------- 只读信息 ---------------- */
    get typeDef() { return SW.StarTypeConfig[this.type]; }
    get featureDef() { return SW.StarFeatureConfig[this.feature]; }
    get color() {
      if (this.owner) return SW.FactionById[this.owner].color;
      return '#8fa3b8';
    }
    get devName() { return DEV().names[this.devLevel]; }

    slots() {
      let s = this.devLevel * DEV().slotsPerLevel;
      if (this.isHome) s += 2;
      return s;
    }
    freeSlots() {
      const queuedNewSlots = this.queue.filter(q => {
        if (q.kind !== 'building') return false;
        const cfg = SW.BuildingConfig[q.id];
        return !(cfg && cfg.shipyard && cfg.shipyard.dedicated && cfg.shipyard.upgradeFrom);
      }).length;
      return this.slots() - this.buildings.length - queuedNewSlots;
    }

    buildingCount(id) { return this.buildings.filter(b => b.id === id).length; }

    isDedicatedShipyard(id) {
      const cfg = SW.BuildingConfig[id];
      return !!(cfg && cfg.shipyard && cfg.shipyard.dedicated === true);
    }

    isDedicatedShipyardUpgrade(id) {
      const cfg = SW.BuildingConfig[id];
      return this.isDedicatedShipyard(id) && !!(cfg.shipyard.upgradeFrom);
    }

    dedicatedShipyard() {
      let current = null;
      for (const b of this.buildings) {
        if (!this.isDedicatedShipyard(b.id)) continue;
        const cfg = SW.BuildingConfig[b.id];
        if (!current || cfg.shipyard.level > SW.BuildingConfig[current.id].shipyard.level) current = b;
      }
      return current;
    }

    queuedDedicatedShipyard() {
      return this.queue.find(q => q.kind === 'building' && this.isDedicatedShipyard(q.id)) || null;
    }

    dedicatedShipyardLevel() {
      const current = this.dedicatedShipyard();
      return current ? (SW.BuildingConfig[current.id].shipyard.level || 0) : 0;
    }

    canBuild(id) {
      const cfg = SW.BuildingConfig[id];
      if (!cfg) return false;
      if (cfg.unique && cfg.unique !== this.owner) return false;
      if (cfg.tech && this.owner) {
        const f = this.ownerFaction();
        if (f && !f.isResearched(cfg.tech)) return false;
      }
      if (this.devLevel < cfg.requireDev) return false;
      if (this.buildingCount(id) >= cfg.maxPerStar) return false;
      const dedicated = this.isDedicatedShipyard(id);
      if (dedicated) {
        if (this.queuedDedicatedShipyard()) return false;
        const current = this.dedicatedShipyard();
        const from = cfg.shipyard.upgradeFrom;
        if (from ? (!current || current.id !== from) : !!current) return false;
      }
      /* 升级替换现有专用船坞，不新增建筑占位；首建仍需真实建筑槽。 */
      if (!this.isDedicatedShipyardUpgrade(id) && this.freeSlots() <= 0) return false;
      return true;
    }

    ownerFaction() { return SW._game ? SW._game.factions.get(this.owner) : null; }

    /* ---------------- 战略价值 ---------------- */
    computeStrategicValue() {
      const res = this.base.metal * 1.0 + this.base.darkMatter * 2.2 + this.base.materials * 5.0 + this.base.research * 1.4;
      const topo = this.degree * 4 + this.betweenness * 90 + (this.isChoke ? 30 : 0) + (this.isHub ? 22 : 0);
      this.strategicValue = Math.round(res * 0.75 + topo);
      return this.strategicValue;
    }

    /* ---------------- 序列化 ---------------- */
    serialize() {
      return {
        id: this.id, x: this.x, y: this.y, type: this.type, feature: this.feature, name: this.name,
        owner: this.owner, devLevel: this.devLevel, isHome: this.isHome, homeOf: this.homeOf,
        base: this.base, buildings: this.buildings.map(b => ({ id: b.id, hp: b.hp, maxHp: b.maxHp })),
        queue: this.queue, defenseHp: this.defenseHp, defenseMaxHp: this.defenseMaxHp,
        starShield: this.starShield, starShieldMax: this.starShieldMax,
        capture: this.capture, links: this.links, degree: this.degree,
        betweenness: this.betweenness, isChoke: this.isChoke, isHub: this.isHub,
        strategicValue: this.strategicValue,
        explored: this.explored, lastSeen: this.lastSeen,
        seed: this.seed, twinkle: this.twinkle, sizeScale: this.sizeScale
      };
    }

    static deserialize(d) {
      const s = new StarSystem(d.id, d.x, d.y, d.type, d.feature, null);
      s.name = d.name; s.owner = d.owner; s.devLevel = d.devLevel;
      s.isHome = d.isHome; s.homeOf = d.homeOf;
      s.base = d.base;
      s.buildings = (d.buildings || []).map(b => ({ id: b.id, hp: b.hp, maxHp: b.maxHp }));
      s.queue = d.queue || [];
      s.defenseHp = d.defenseHp || 0; s.defenseMaxHp = d.defenseMaxHp || 0;
      s.starShield = d.starShield || 0; s.starShieldMax = d.starShieldMax || 0;
      s.capture = d.capture || null;
      s.links = d.links || []; s.degree = d.degree || 0;
      s.betweenness = d.betweenness || 0; s.isChoke = d.isChoke; s.isHub = d.isHub;
      s.strategicValue = d.strategicValue || 0;
      s.explored = d.explored || {}; s.lastSeen = d.lastSeen || {};
      s.seed = d.seed || 0; s.twinkle = d.twinkle || 0; s.sizeScale = d.sizeScale || 1;
      s.recomputeShipyardCache();
      return s;
    }

    recomputeShipyardCache() {
      let slots = 0, level = 0, speed = 1;
      const dedicated = this.dedicatedShipyard();
      if (dedicated) {
        const cfg = SW.BuildingConfig[dedicated.id];
        slots += cfg.shipyard.slots;
        level = cfg.shipyard.level;
        speed = Math.max(speed, cfg.shipyard.speed || 1);
      }
      for (const b of this.buildings) {
        const cfg = SW.BuildingConfig[b.id];
        if (cfg && cfg.shipyard && !cfg.shipyard.dedicated) {
          slots += cfg.shipyard.slots;
          speed = Math.max(speed, cfg.shipyard.speed || 1);
        }
      }
      this.shipyardSlots = slots;
      this.shipyardLevel = level;
      this.shipyardSpeed = speed;
    }

    /** 舰船尺寸 -> 需要的船坞等级 */
    static dockLevelFor(shipId) {
      const s = SW.ShipConfig[shipId];
      if (!s) return 1;
      if (shipId === 'flagship') return 3;
      if (shipId === 'titan') return 3;
      if (s.size >= 5) return 2;
      return 1;
    }
  }

  SW.StarSystem = StarSystem;
})(window.SW);
