/* ===========================================================
 *  FactionManager —— 四大势力的创建、初始化、查询与更新
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class FactionManager {
    constructor(game) {
      this.game = game;
      this.list = [];
      this.byId = {};
    }

    create() {
      this.list = [];
      this.byId = {};
      for (const cfg of SW.FactionConfig) {
        const f = new SW.Faction(cfg.id, this.game);
        this.list.push(f);
        this.byId[f.id] = f;
        for (const o of SW.FactionConfig) {
          if (o.id === f.id) continue;
          f.setRelation(o.id, SW.AIConfig.diplomacy.initialRelation);
        }
      }
      return this;
    }

    get(id) { return this.byId[id] || null; }
    get alive() { return this.list.filter(f => !f.defeated); }

    /* ---------------- 初始领土与部队 ---------------- */
    setupStartingPositions(galaxy) {
      const cfg = SW.GalaxyConfig;
      for (const f of this.list) {
        const homeId = galaxy.homeIds[SW.FactionConfig.findIndex(x => x.id === f.id)];
        const home = galaxy.get(homeId);
        if (!home) continue;
        home.owner = f.id;
        home.devLevel = cfg.start.homeDevLevel;
        home.isHome = true;
        home.homeOf = f.id;
        f.homeStarId = home.id;

        /* 母星建筑 */
        home.buildings = [];
        home.queue = [];
        home.buildings.push({ id: 'mine', hp: 100, maxHp: 100 });
        home.buildings.push({ id: 'researchLab', hp: 100, maxHp: 100 });
        home.buildings.push({ id: 'shipyard', hp: 100, maxHp: 100 });
        home.buildings.push({ id: 'defensePlatform', hp: 100, maxHp: 100 });
        if (f.cfg.uniqueBuilding) home.buildings.push({ id: f.cfg.uniqueBuilding, hp: 100, maxHp: 100 });
        home.recomputeShipyardCache();

        /* 赠送的邻近星系（含唯一出口星，形成早期走廊） */
        const bonus = cfg.start.homeBonusStars;
        const sorted = home.links
          .map(id => galaxy.get(id))
          .filter(Boolean)
          .sort((a, b) => b.strategicValue + b.base.metal - (a.strategicValue + a.base.metal));
        for (let i = 0; i < Math.min(bonus, sorted.length); i++) {
          const s = sorted[i];
          s.owner = f.id;
          s.devLevel = 1;
          s.buildings = [{ id: 'mine', hp: 100, maxHp: 100 }];
          s.queue = [];
          s.recomputeShipyardCache();
        }

        /* 探索：初始已知母星及其邻居 */
        home.explored[f.id] = true;
        for (const nId of home.links) galaxy.get(nId).explored[f.id] = true;
      }
      galaxy.recomputeAllStrategic();
    }

    /* ---------------- 每帧/每步更新 ---------------- */
    /** 每天更新：外交关系衰减、战争疲劳 */
    updateDaily(dt) {
      const D = SW.AIConfig.diplomacy;
      for (const f of this.list) {
        if (f.defeated) continue;
        for (const o of this.list) {
          if (o.id === f.id || o.defeated) continue;
          if (f.contacts[o.id] && !f.atWar[o.id]) {
            /* 接壤边境越长，摩擦越大 */
            const borders = this._sharedBorder(f.id, o.id);
            const friction = D.borderFrictionPerDay * (0.6 + Math.min(2.4, borders * 0.28));
            f.setRelation(o.id, f.relationWith(o.id) - friction * dt);
          }
          if (f.atWar[o.id]) {
            f.warWeariness[o.id] = Math.min(1, (f.warWeariness[o.id] || 0) + D.warWearinessPerDay * dt);
          } else {
            f.warWeariness[o.id] = Math.max(0, (f.warWeariness[o.id] || 0) - D.warWearinessPerDay * 0.5 * dt);
          }
        }
      }
    }

    /** 两个势力之间接壤的星系对数量 */
    _sharedBorder(aId, bId) {
      const galaxy = this.game.galaxy;
      if (!galaxy) return 1;
      let n = 0;
      const a = galaxy.starsOf(aId);
      for (const s of a) for (const nid of s.links) {
        const nb = galaxy.get(nid);
        if (nb && nb.owner === bId) n++;
      }
      return n;
    }

    /* ---------------- 统计 ---------------- */
    recount(galaxy, fleets) {
      for (const f of this.list) {
        f.stats.starsOwned = galaxy.starsOf(f.id).length;
      }
    }

    /** 综合军力（所有舰队战斗力之和） */
    totalPower(fleetSystem) {
      const out = {};
      for (const f of this.list) out[f.id] = 0;
      for (const fl of fleetSystem.fleets) {
        if (fl.factionId && out[fl.factionId] !== undefined) out[fl.factionId] += fl.power;
      }
      return out;
    }

    /* ---------------- 胜负 ---------------- */
    checkDefeat(galaxy) {
      for (const f of this.list) {
        if (f.defeated) continue;
        const stars = galaxy.starsOf(f.id).length;
        if (stars === 0) {
          f.defeated = true;
          f.defeatedDay = this.game ? this.game.time.day : 0;
          return f;
        }
      }
      return null;
    }

    /** 检查银河征服胜利（占领超过 65% 恒星且其他势力全部灭亡） */
    checkVictory(galaxy) {
      const alive = this.alive;
      if (alive.length !== 1) {
        // 也允许"占领绝大部分银河"提前判定
        const total = galaxy.stars.length;
        for (const f of alive) {
          if (galaxy.starsOf(f.id).length / total >= 0.80) return f;
        }
        return null;
      }
      return alive[0];
    }

    serialize() { return this.list.map(f => f.serialize()); }
    deserialize(arr) {
      for (const d of arr) {
        const f = this.byId[d.id];
        if (f) f.deserialize(d);
      }
    }
  }

  SW.FactionManager = FactionManager;
})(window.SW);
