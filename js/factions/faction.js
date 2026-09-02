/* ===========================================================
 *  Faction —— 势力实体
 *  资源 / 修正值 / 科研状态 / 外交 / 统计 / AI 运行时状态
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class Faction {
    constructor(id, game) {
      this.id = id;
      this.cfg = SW.FactionById[id];
      this.game = game;
      this.name = this.cfg.name;
      this.color = this.cfg.color;

      /* 资源库存 */
      this.res = {
        metal: SW.GalaxyConfig.start.startingMetal,
        darkMatter: SW.GalaxyConfig.start.startingDarkMatter,
        materials: SW.GalaxyConfig.start.startingMaterials,
        research: SW.GalaxyConfig.start.startingResearch
      };
      /* 每日净收入（由 EconomySystem 计算并缓存） */
      this.income = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
      this.upkeep = { metal: 0, darkMatter: 0, materials: 0, research: 0 };

      /* 科研 */
      this.tech = {
        completed: {},        // id -> true
        current: null,        // { id, progress, cost }
        queue: []             // [techId]
      };

      /* 修正值 */
      this.mods = null;
      this.recomputeMods();

      /* 外交 */
      this.relations = {};    // otherId -> -100..100
      this.atWar = {};        // otherId -> true
      this.truceUntil = {};   // otherId -> day
      this.contacts = {};     // otherId -> true（已接触）
      this.warWeariness = {}; // otherId -> 0..1

      /* 统计 */
      this.stats = {
        shipsBuilt: 0, shipsLost: 0, shipsKilled: 0,
        starsOwned: 0, starsLost: 0, starsTaken: 0,
        battlesWon: 0, battlesLost: 0,
        titansBuilt: 0, titansLost: 0,
        flagshipBuilt: 0, flagshipLost: 0, flagshipName: null,
        peakPower: 0, firstBattleDay: -1, totalWarDays: 0
      };

      /* AI 运行时 */
      this.ai = {
        timers: { economy: 0, expansion: 0, military: 0, research: 0, production: 0, diplomacy: 0, strategic: 0 },
        phase: 'early',           // early | mid | late
        posture: 'develop',       // develop | defend | attack | desperate
        primaryEnemy: null,
        threatLevel: 0,
        desire: { expand: 1, military: 1, tech: 1 },
        lastExpansionDay: 0,
        buildPlan: null,
        focusStar: null
      };

      this.defeated = false;
      this.defeatedDay = -1;
    }

    /* ---------------- 修正值 ---------------- */
    recomputeMods() {
      const base = {
        metal: 0, darkMatter: 0, materials: 0, research: 0,
        shipCost: 0, buildSpeed: 0, shipHp: 0, shipShield: 0, shipArmor: 0, shipDamage: 0,
        fleetSpeed: 0, repair: 0, defense: 0, sensor: 0, pd: 0,
        weapon: {}, ship: {}
      };
      const add = (obj) => {
        if (!obj) return;
        for (const k in obj) {
          if (k === 'weapon') {
            for (const w in obj.weapon) base.weapon[w] = (base.weapon[w] || 0) + obj.weapon[w];
          } else if (k === 'ship') {
            for (const s in obj.ship) {
              base.ship[s] = base.ship[s] || {};
              for (const p in obj.ship[s]) base.ship[s][p] = (base.ship[s][p] || 0) + obj.ship[s][p];
            }
          } else {
            base[k] = (base[k] || 0) + obj[k];
          }
        }
      };
      // 势力基础
      add(this.cfg.mods);
      if (this.cfg.shipMods) add({ ship: this.cfg.shipMods });
      if (this.cfg.weaponMods) add({ weapon: this.cfg.weaponMods });
      // 科技
      for (const tid in this.tech.completed) {
        const t = SW.TechById[tid];
        if (t && t.effects) add(t.effects);
      }
      this.mods = base;
      return base;
    }

    /** 乘区（1 + sum） */
    m(key) { return 1 + (this.mods[key] || 0); }
    weaponMult(type) { return 1 + (this.mods.weapon[type] || 0); }
    shipMod(shipId, key) {
      const s = this.mods.ship[shipId];
      return 1 + ((s && s[key]) || 0);
    }

    /* ---------------- 科技 ---------------- */
    isResearched(id) { return !!this.tech.completed[id]; }
    get techCount() { return Object.keys(this.tech.completed).length; }
    researchable() {
      const out = [];
      for (const t of SW.TechList) {
        if (this.tech.completed[t.id]) continue;
        if (t.faction && t.faction !== this.id) continue;
        let ok = true;
        for (const p of (t.prereq || [])) if (!this.tech.completed[p]) { ok = false; break; }
        if (ok) out.push(t);
      }
      return out;
    }
    /** 已解锁的舰种 */
    unlockedShips() {
      const out = [];
      for (const id of SW.ShipOrder) {
        const s = SW.ShipConfig[id];
        if (!s.tech || this.isResearched(s.tech)) out.push(id);
      }
      return out;
    }

    /* ---------------- 资源 ---------------- */
    canAfford(cost) {
      return this.res.metal >= (cost.metal || 0) &&
        this.res.darkMatter >= (cost.darkMatter || 0) &&
        this.res.materials >= (cost.materials || 0) &&
        this.res.research >= (cost.research || 0);
    }
    spend(cost) {
      this.res.metal -= (cost.metal || 0);
      this.res.darkMatter -= (cost.darkMatter || 0);
      this.res.materials -= (cost.materials || 0);
      this.res.research -= (cost.research || 0);
    }
    addRes(key, amount) {
      if (!Number.isFinite(amount) || amount === 0) return;
      /*
       * 接近 cap 时抑制新增速度而不是删除库存。softCapRatio、
       * floorMultiplier 缺省时完全回退到旧的线性入账行为。
       */
      if (amount > 0) {
        const cap = SW.ResourceConfig && SW.ResourceConfig.cap && SW.ResourceConfig.cap[key];
        const inv = SW.ResourceConfig && SW.ResourceConfig.tempo && SW.ResourceConfig.tempo.inventory;
        const softRatio = inv && inv.softCapRatio ? inv.softCapRatio[key] : null;
        const floor = inv && inv.floorMultiplier ? inv.floorMultiplier[key] : null;
        if (cap > 0 && Number.isFinite(softRatio) && softRatio > 0 && softRatio < 1 &&
          Number.isFinite(floor)) {
          const softCap = cap * softRatio;
          if (this.res[key] > softCap) {
            const span = Math.max(1, cap - softCap);
            const pressure = U.clamp((this.res[key] - softCap) / span, 0, 1);
            const retention = U.clamp(floor, 0, 1);
            amount *= Math.max(retention, 1 - pressure * (1 - retention));
          }
        }
      }
      this.res[key] += amount;
      const cap = SW.ResourceConfig.cap[key];
      if (cap && this.res[key] > cap) this.res[key] = cap;
      if (this.res[key] < 0) this.res[key] = 0;
    }

    /* ---------------- 外交 ---------------- */
    isEnemy(otherId) { return !!this.atWar[otherId]; }
    relationWith(otherId) { return this.relations[otherId] || 0; }
    setRelation(otherId, v) { this.relations[otherId] = U.clamp(v, -100, 100); }

    /* ---------------- 序列化 ---------------- */
    serialize() {
      return {
        id: this.id,
        res: this.res, income: this.income, upkeep: this.upkeep,
        tech: {
          completed: this.tech.completed,
          current: this.tech.current ? { id: this.tech.current.id, progress: this.tech.current.progress, cost: this.tech.current.cost } : null,
          queue: this.tech.queue.slice()
        },
        relations: this.relations, atWar: this.atWar, truceUntil: this.truceUntil,
        contacts: this.contacts, warWeariness: this.warWeariness,
        stats: this.stats,
        ai: {
          timers: this.ai.timers, phase: this.ai.phase, posture: this.ai.posture,
          primaryEnemy: this.ai.primaryEnemy, threatLevel: this.ai.threatLevel,
          desire: this.ai.desire, lastExpansionDay: this.ai.lastExpansionDay
        },
        defeated: this.defeated, defeatedDay: this.defeatedDay
      };
    }
    deserialize(d) {
      this.res = Object.assign(this.res, d.res || {});
      this.income = Object.assign(this.income, d.income || {});
      this.upkeep = Object.assign(this.upkeep, d.upkeep || {});
      this.tech.completed = d.tech ? (d.tech.completed || {}) : {};
      this.tech.current = d.tech && d.tech.current ? d.tech.current : null;
      this.tech.queue = d.tech ? (d.tech.queue || []) : [];
      this.relations = d.relations || {};
      this.atWar = d.atWar || {};
      this.truceUntil = d.truceUntil || {};
      this.contacts = d.contacts || {};
      this.warWeariness = d.warWeariness || {};
      this.stats = Object.assign(this.stats, d.stats || {});
      if (d.ai) {
        this.ai.timers = Object.assign(this.ai.timers, d.ai.timers || {});
        this.ai.phase = d.ai.phase || 'early';
        this.ai.posture = d.ai.posture || 'develop';
        this.ai.primaryEnemy = d.ai.primaryEnemy || null;
        this.ai.threatLevel = d.ai.threatLevel || 0;
        this.ai.desire = Object.assign(this.ai.desire, d.ai.desire || {});
        this.ai.lastExpansionDay = d.ai.lastExpansionDay || 0;
      }
      this.defeated = !!d.defeated; this.defeatedDay = d.defeatedDay != null ? d.defeatedDay : -1;
      this.recomputeMods();
    }
  }

  SW.Faction = Faction;
})(window.SW);
