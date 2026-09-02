/* ===========================================================
 *  TechnologySystem —— 科技研究
 *  研究进度以「每日投入的研究点」推进（可多队列溢出为储备）
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  class TechnologySystem {
    constructor(game) {
      this.game = game;
    }

    /** 开始研究 */
    start(faction, techId) {
      const t = SW.TechById[techId];
      if (!t) return false;
      if (faction.isResearched(techId)) return false;
      if (t.faction && t.faction !== faction.id) return false;
      for (const p of (t.prereq || [])) if (!faction.isResearched(p)) return false;
      if (faction.tech.current) return false;
      faction.tech.current = { id: techId, progress: 0, cost: t.cost };
      return true;
    }

    /** 每日推进 */
    update(dt) {
      const game = this.game;
      for (const f of game.factions.list) {
        if (f.defeated) continue;
        const cur = f.tech.current;
        if (!cur) continue;
        const spend = Math.min(f.res.research, f.income.research * dt);
        cur.progress += spend;
        f.res.research -= spend;
        if (cur.progress >= cur.cost) {
          this.complete(f, cur.id);
        }
      }
    }

    complete(faction, techId) {
      const t = SW.TechById[techId];
      faction.tech.completed[techId] = true;
      faction.tech.current = null;
      faction.recomputeMods();
      const game = this.game;

      let msg = faction.name + '完成科技研究：' + t.name + '。';
      let priority = 1;
      if (t.unlocks && t.unlocks.ships && t.unlocks.ships.length) {
        for (const sid of t.unlocks.ships) {
          const s = SW.ShipConfig[sid];
          if (sid === 'titan') { msg = faction.name + '掌握了「泰坦工程学」，巨型战舰即将进入银河。'; priority = 4; }
          else if (sid === 'flagship') { msg = faction.name + '启动了「超级旗舰计划」——银河的终局兵器即将诞生。'; priority = 5; }
          else if (sid === 'carrier') { msg = faction.name + '研发出航母作战体系，舰载机联队成型。'; priority = 3; }
          else { msg = faction.name + '解锁新型战舰：' + s.name + '。'; priority = 2; }
        }
      }
      game.events.record(game, msg, 'tech', { factionId: faction.id, priority: priority });
      if (priority >= 2) game.events.notify('【科技突破】' + msg, 'tech', { factionId: faction.id, priority: priority });
      game.events.emit('techCompleted', { faction: faction, tech: t });

      /* 解锁建筑/舰船后立刻让 AI 重新评估 */
      faction.ai.timers.production = 0;
      faction.ai.timers.economy = 0;
      return t;
    }

    /** 估算每日研究投入 */
    dailyRate(faction) { return faction.income.research; }

    /** 剩余天数 */
    etaDays(faction) {
      const c = faction.tech.current;
      if (!c) return 0;
      const rate = this.dailyRate(faction);
      if (rate <= 0) return Infinity;
      return (c.cost - c.progress) / rate;
    }
  }

  SW.TechnologySystem = TechnologySystem;
})(window.SW);
