/* ===========================================================
 *  ResearchAI —— 科技路线选择
 *  决策时机：研究完成时 或 aiConfig.intervals.research
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const C = () => SW.AIConfig.research;

  class ResearchAI {
    constructor(game) { this.game = game; }

    /** 若当前无研究，则挑选一个 */
    choose(faction) {
      if (faction.tech.current) return null;
      const options = faction.researchable();
      if (!options.length) return null;

      const war = this._warPressure(faction);
      const phase = faction.ai.phase;
      let best = null, bestScore = -Infinity;

      for (const t of options) {
        const s = this._score(t, faction, war, phase);
        if (s > bestScore) { bestScore = s; best = t; }
      }
      if (!best) return null;
      this.game.technology.start(faction, best.id);
      return best;
    }

    _score(t, faction, war, phase) {
      const C2 = C();
      let s = (C2.categoryBase[t.cat] || 1) * 10;

      /* 性格加成 */
      const p = C2.personality[faction.cfg.personality] || {};
      s += (p[t.cat] || 0) * 12;

      /* 战争紧迫：武器与舰船优先 */
      if (war > 0) {
        if (t.cat === 'weapons') s += war * 14 * C2.warUrgency;
        if (t.cat === 'ships') s += war * 16 * C2.warUrgency;
        if (t.cat === 'defense') s += war * 8;
      }

      /* 阶段：早期重工业经济，中期重舰船，后期重旗舰 */
      if (phase === 'early') { if (t.cat === 'industry' || t.cat === 'economy') s += 10; if (t.tier > 3) s -= 8; }
      if (phase === 'mid') { if (t.cat === 'ships') s += 8; if (t.cat === 'weapons') s += 5; }
      if (phase === 'late') { if (t.id === 'tech_flagship') s += 40; if (t.id === 'tech_titan') s += 30; if (t.cat === 'carriers') s += 8; }

      /* 解锁关键内容加权 */
      if (t.unlocks) {
        if (t.unlocks.ships) {
          for (const sid of t.unlocks.ships) {
            const cfg = SW.ShipConfig[sid];
            if (sid === 'titan') s += 45 * faction.cfg.ai.titanRush;
            else if (sid === 'flagship') s += 70 * faction.cfg.ai.titanRush;
            else if (sid === 'carrier') s += 14;
            else s += 10 + cfg.tier * 4;
          }
        }
        if (t.unlocks.buildings) s += 8;
      }

      /* 前置深度：解锁更多后续科技的先手价值 */
      let unlocksCount = 0;
      for (const o of SW.TechList) {
        if ((o.prereq || []).indexOf(t.id) >= 0) unlocksCount++;
      }
      s += unlocksCount * 3;

      /* 成本：越贵越往后排（但不要永远选便宜的） */
      s -= Math.pow(t.cost / 300, 0.75) * 6;

      /* 专属科技优先 */
      if (t.faction === faction.id) s += 18;

      /* 使用游戏 RNG，保证相同种子下研究路线可复现并可随存档恢复。 */
      s *= (0.75 + this.game.rng.next() * 0.5);
      return s;
    }

    _warPressure(faction) {
      let n = 0;
      for (const oid in faction.atWar) if (faction.atWar[oid]) n++;
      return U.clamp(n * 0.6 + faction.ai.threatLevel * 0.4, 0, 1.5);
    }
  }

  SW.ResearchAI = ResearchAI;
})(window.SW);
