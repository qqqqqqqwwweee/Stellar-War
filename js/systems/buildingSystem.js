/* ===========================================================
 *  BuildingSystem —— 建筑决策与建造
 *  负责：为某星系挑选下一个最优建筑（供经济 AI 调用）
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class BuildingSystem {
    constructor(game) {
      this.game = game;
      this.eco = game.economy;
    }

    /** 势力当前最缺的资源（返回 key 或 null） */
    shortage(faction) {
      const inc = faction.income;
      const score = {
        metal: inc.metal,
        darkMatter: inc.darkMatter,
        materials: inc.materials * 4.0,   // 高级材料按稀缺度加权
        research: inc.research
      };
      // 与舰队需求对比
      const need = this.fleetResourceDemand(faction);
      let worst = null, worstV = Infinity;
      for (const k in score) {
        const n = Math.max(0.01, need[k] || 0.01);
        const ratio = score[k] / n;
        if (ratio < worstV) { worstV = ratio; worst = k; }
      }
      return worstV < 1.0 ? worst : null;
    }

    /** 舰队对资源的需求权重（粗略） */
    fleetResourceDemand(faction) {
      return { metal: 1.0, darkMatter: 0.35, materials: 0.12, research: 0.6 };
    }

    /**
     * 为星系打分选择建筑
     * @returns {string|null} buildingId
     */
    chooseBuilding(star, faction, ctx) {
      const cand = [];
      for (const id of SW.BuildingOrder) {
        const cfg = SW.BuildingConfig[id];
        if (!cfg) continue;
        if (!star.canBuild(id)) continue;
        const cost = this.eco.buildingCost(id, faction);
        // 判断造得起（允许一点点透支排队）
        if (cost.metal > faction.res.metal * 1.6) continue;
        if (cost.darkMatter > faction.res.darkMatter + faction.income.darkMatter * 25) continue;
        if (cost.materials > faction.res.materials + faction.income.materials * 40) continue;
        cand.push({ id, score: this.scoreBuilding(id, cfg, star, faction, ctx) });
      }
      if (!cand.length) return null;
      cand.sort((a, b) => b.score - a.score);
      if (cand[0].score <= 0) return null;
      return cand[0].id;
    }

    scoreBuilding(id, cfg, star, faction, ctx) {
      const ctx2 = ctx || {};
      let s = 0;
      const war = ctx2.war || 0;            // 0~1 战争压力
      const border = ctx2.border ? 1 : 0;   // 是否边境
      const home = star.isHome ? 1 : 0;
      const dev = star.devLevel;

      /* 资源类：按该星系的资源底数放大收益 */
      if (cfg.yield) {
        const W = SW.AIConfig.economy.preferYieldWeight;
        for (const k in cfg.yield) {
          const base = (star.base[k] || 0);
          const w = W[k] || 1;
          const gain = ((cfg.yield[k].flat || 0) + base * (cfg.yield[k].mult || 0)) * w;
          s += gain * 0.30;
        }
      }

      /* 船坞：核心，尤其母星与铸造世界 */
      if (cfg.shipyard) {
        let v = 2.2 * cfg.shipyard.level * (0.6 + 0.4 * cfg.shipyard.slots);
        v *= (1 + war * 1.4);
        if (home) v *= 1.25;
        if (star.feature === 'forgeWorld') v *= 1.3;
        // 已经有很多船坞则递减
        const existing = star.buildings.filter(b => {
          const other = SW.BuildingConfig[b.id];
          return other && other.shipyard && other.shipyard.dedicated;
        }).length;
        v *= Math.pow(0.62, existing);
        s += v;
      }

      /* 防御 */
      if (cfg.defense) {
        let v = 0.9 + (cfg.defense.damage || 0) * 0.035;
        v *= (1 + border * 1.5 + war * 1.2 + home * 1.1);
        if (cfg.starShield) v += 0.8;
        const existing = star.buildings.filter(b => SW.BuildingConfig[b.id] && SW.BuildingConfig[b.id].defense).length;
        v *= Math.pow(0.8, existing);
        s += v * (0.5 + faction.cfg.ai.defenseFocus);
      }

      /* 科研 */
      if (cfg.yield && cfg.yield.research) {
        s *= (1 + faction.cfg.ai.techFocus * 0.8);
      }

      /* 维修 / 物流 */
      if (cfg.repair) s += 1.0 * (1 + war) * (0.4 + faction.cfg.ai.aggression);
      if (cfg.logistics) s += 0.7 + (star.isHub ? 1.2 : 0);
      if (cfg.sensorRange) s += border ? 1.1 : 0.35;

      /* 势力专属建筑：优先建造 */
      if (cfg.unique === faction.id) s *= 1.55;

      /* 开发等级低的星系先别造贵的 */
      s *= (0.55 + dev * 0.16);
      return s;
    }

    /** 尝试在星系建造一个建筑 */
    tryBuild(star, faction, ctx) {
      if (star.queue.length >= SW.AIConfig.economy.maxQueuePerStar) return false;
      const id = this.chooseBuilding(star, faction, ctx);
      if (!id) return false;
      return this.eco.queueBuilding(star, id, faction);
    }

    /** 建筑被摧毁（战斗后） */
    damageBuildings(star, amount) {
      let destroyed = null;
      for (const b of star.buildings) {
        const cfg = SW.BuildingConfig[b.id];
        const armor = cfg && cfg.defense ? 2.2 : 1.0;
        b.hp -= amount / armor;
        if (b.hp <= 0) destroyed = b;
      }
      // 只拆一个（避免一瞬间全没）
      if (destroyed) {
        U.remove(star.buildings, destroyed);
        star.recomputeShipyardCache();
      }
      return destroyed;
    }
  }

  SW.BuildingSystem = BuildingSystem;
})(window.SW);
