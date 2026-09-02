/* ===========================================================
 *  ExpansionAI —— 殖民扩张、抢占中立星系与战略要地
 *  决策频率：aiConfig.intervals.expansion
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const C = () => SW.AIConfig.expansion;

  class ExpansionAI {
    constructor(game) { this.game = game; }

    run(faction) {
      const game = this.game;
      if (faction.defeated) return;
      const galaxy = game.galaxy;
      const mine = galaxy.starsOf(faction.id);
      if (!mine.length) return;

      /* 统计正在进行的殖民 / 进攻行动 */
      let ongoing = 0;
      for (const f of game.fleets.fleets) {
        if (f.factionId !== faction.id) continue;
        if (f.mission === 'claim' || f.mission === 'attack') ongoing++;
      }
      /* 殖民队列由经济决定：早期 1 条，中后期逐步放开到上限 */
      let maxClaims = 1 + Math.floor(faction.income.metal / C().claimsPerIncome);
      maxClaims = Math.min(C().maxConcurrentClaims, Math.max(1, Math.round(maxClaims * (0.7 + faction.cfg.ai.expansion * 0.5))));
      if (ongoing >= maxClaims) return;

      const hops = galaxy.hopsFrom(mine.map(s => s.id), C().maxFrontierDistance);
      const power = game.fleets.fleetsOf(faction.id).reduce((a, f) => a + f.power, 0);
      const enemies = this._enemyPowerMap(faction);

      const candidates = [];
      for (const starId in hops) {
        const s = galaxy.get(starId);
        if (!s) continue;
        if (s.owner === faction.id) continue;
        const dist = hops[starId];
        const isEnemyStar = s.owner !== null;
        if (isEnemyStar) {
          const own = game.factions.get(s.owner);
          if (!own) continue;
          if (!faction.isEnemy(s.owner) && !own.isEnemy(faction.id)) continue;   // 和平时期不抢
        }
        candidates.push({ star: s, score: this._score(s, dist, faction, enemies, isEnemyStar) });
      }
      if (!candidates.length) return;
      candidates.sort((a, b) => b.score - a.score);

      for (const c of candidates) {
        if (ongoing >= maxClaims) break;
        if (c.score <= 0) break;
        if (this._alreadyTargeted(faction, c.star.id)) continue;

        const cost = this._requirement(c.star, faction);
        if (power * 0.55 < cost) continue;   // 兵力不足，暂缓

        const fleet = this._launch(faction, c.star, cost);
        if (fleet) ongoing++;
      }
    }

    _score(star, dist, faction, enemies, isEnemyStar) {
      const C2 = C();
      let s = 0;
      s += (star.base.metal + star.base.darkMatter * 2.0 + star.base.materials * 4.5 + star.base.research * 1.2) * C2.resourceWeight * 0.35;
      if (star.isChoke) s += 45 * C2.chokeWeight;
      if (star.isHub) s += 30 * C2.hubWeight;
      s += star.degree * 3.0;
      s += dist * C2.distanceWeight * 10;
      if (!isEnemyStar) s += 20 * C2.neutralBonus;
      /* 敌方威胁 */
      const threat = enemies[star.id] || 0;
      s += Math.pow(threat, 0.75) * C2.enemyThreatWeight * 6;
      /* 扩张性格 */
      s *= (0.5 + faction.cfg.ai.expansion);
      /* 己方战力不足时降低抢夺敌方星系的意愿 */
      if (isEnemyStar) s *= 0.75 + faction.cfg.ai.aggression * 0.6;
      return s;
    }

    /** 每个星系附近的敌方战力 */
    _enemyPowerMap(faction) {
      const game = this.game;
      const out = {};
      for (const f of game.fleets.fleets) {
        if (f.factionId === faction.id) continue;
        const o = game.factions.get(f.factionId);
        if (!o) continue;
        if (!faction.isEnemy(o.id) && !o.isEnemy(faction.id)) continue;
        if (!f.starId) continue;
        out[f.starId] = (out[f.starId] || 0) + f.power;
      }
      /* 敌方星系自身防御 */
      for (const s of game.galaxy.stars) {
        if (s.owner === null || s.owner === faction.id) continue;
        const o = game.factions.get(s.owner);
        if (!o) continue;
        if (!faction.isEnemy(s.owner) && !o.isEnemy(faction.id)) continue;
        out[s.id] = (out[s.id] || 0) + s.defenseHp * 0.6 + (s.defenseDamage || 0) * 4;
      }
      return out;
    }

    /**
     * 选择出击星系：优先离目标近、且空闲兵力足够的地方；
     * 若没有任何一处兵力足够，就用兵力最多的那个。
     */
    _pickStagingStar(faction, star, requirement) {
      const game = this.game;
      const mine = game.galaxy.starsOf(faction.id);
      if (!mine.length) return null;
      const avail = game.fleets.availablePowerByStar(faction.id);

      let best = null, bestScore = -Infinity, fallback = null, fallbackPower = 0;
      for (const s of mine) {
        const p = avail[s.id] || 0;
        if (p > fallbackPower) { fallbackPower = p; fallback = s; }
        if (p < Math.min(8, requirement * 0.5)) continue;
        const d = U.dist(s.x, s.y, star.x, star.y);
        /* 距离越近越好，兵力越足越好 */
        const score = -d * 0.001 + Math.min(3, p / Math.max(1, requirement));
        if (score > bestScore) { bestScore = score; best = s; }
      }
      return best || fallback;
    }

    /** 攻占该星系所需战力 */
    _requirement(star, faction) {
      const defense = star.owner === null ? 0 : (star.defenseHp * 0.28 + (star.defenseDamage || 0) * 3.2);
      const garrison = this.game.fleets.fleetsAt(star.id)
        .filter(f => f.factionId !== faction.id)
        .reduce((a, f) => a + f.power, 0);
      return Math.max(C().claimFleetPower, defense * 1.25 + garrison * 1.35);
    }

    _alreadyTargeted(faction, starId) {
      for (const f of this.game.fleets.fleets) {
        if (f.factionId === faction.id && f.targetStarId === starId) return true;
      }
      return false;
    }

    /** 组建并执行扩张舰队 */
    _launch(faction, star, requirement) {
      const game = this.game;
      /* 出发点必须「真的有兵」：在离目标最近的若干己方星系中挑兵力最多/足够的那个 */
      const base = this._pickStagingStar(faction, star, requirement);
      if (!base) return null;

      let fleet = game.fleets.assemble(faction.id, base.id, requirement, 'expedition');
      if (!fleet) return null;
      fleet.mission = 'claim';
      if (game.fleets.orderMove(fleet, star.id, 'claim')) {
        game.events.record(game, faction.name + '派遣' + fleet.name + '前往「' + star.name + '」' +
          (star.owner === null ? '建立殖民地。' : '发动进攻。'), 'expansion', { factionId: faction.id, starId: star.id, priority: 1 });
        return fleet;
      }
      return null;
    }
  }

  SW.ExpansionAI = ExpansionAI;
})(window.SW);
