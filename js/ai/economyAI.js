/* ===========================================================
 *  EconomyAI —— 恒星开发、建筑建造、资源平衡
 *  决策频率：aiConfig.intervals.economy（银河天）
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const C = () => SW.AIConfig.economy;

  class EconomyAI {
    constructor(game) { this.game = game; }

    run(faction) {
      const game = this.game;
      const galaxy = game.galaxy;
      const eco = game.economy;
      const stars = galaxy.starsOf(faction.id);
      if (!stars.length) return;

      const war = this._warPressure(faction);
      const shortage = game.buildings.shortage(faction);
      const income = faction.income.metal;
      let budget = faction.res.metal * (1 - C().reserveRatio);

      /* 1) 边境与母星优先加固 */
      const sorted = stars.slice().sort((a, b) => this._priority(b, faction, war) - this._priority(a, faction, war));

      for (const star of sorted) {
        if (budget <= 0) break;
        /* 建筑 */
        const border = this._isBorder(star, faction);
        const ctx = { war: war, border: border, shortage: shortage };
        if (star.queue.length === 0) {
          const before = faction.res.metal;
          if (game.buildings.tryBuild(star, faction, ctx)) {
            budget -= (before - faction.res.metal);
          }
        }
      }

      /* 2) 开发等级升级：优先高价值且已建满的星系 */
      const upCandidates = stars
        .filter(s => s.devLevel < SW.GalaxyConfig.devLevel.max)
        .filter(s => s.queue.length === 0 && s.freeSlots() <= 0)
        .sort((a, b) => (b.strategicValue + b.base.metal * 2) - (a.strategicValue + a.base.metal * 2));

      const maxUpgrades = 1 + Math.floor(income / C().upgradeDevWhenIncomeAbove);
      let done = 0;
      for (const star of upCandidates) {
        if (done >= maxUpgrades) break;
        if (!eco.canUpgradeDev(star, faction)) continue;
        if (faction.res.metal < eco.devUpgradeCost(star).metal * 1.4) continue;
        if (eco.queueDevUpgrade(star, faction)) done++;
      }

      /* 3) 母星保底升级（即使没建满） */
      const home = faction.homeStarId ? galaxy.get(faction.homeStarId) : null;
      if (home && home.owner === faction.id && home.devLevel < 3 && home.queue.length === 0) {
        if (eco.canUpgradeDev(home, faction) && faction.res.metal > 800) eco.queueDevUpgrade(home, faction);
      }
    }

    _priority(star, faction, war) {
      let v = star.strategicValue * 0.5 + star.base.metal * 1.2 + star.base.darkMatter * 2 + star.base.materials * 5;
      if (star.isHome) v += 40;
      if (this._isBorder(star, faction)) v += 12 + war * 40;
      if (star.isChoke) v += 18;
      if (star.queue.length) v -= 30;
      if (star.freeSlots() <= 0) v -= 25;
      return v;
    }

    _isBorder(star, faction) {
      for (const nId of star.links) {
        const n = this.game.galaxy.get(nId);
        if (n && n.owner !== faction.id) return true;
      }
      return false;
    }

    _warPressure(faction) {
      let n = 0;
      for (const oid in faction.atWar) if (faction.atWar[oid]) n++;
      return U.clamp(n / 2, 0, 1) * 0.6 + U.clamp(faction.ai.threatLevel, 0, 1) * 0.4;
    }
  }

  SW.EconomyAI = EconomyAI;
})(window.SW);
