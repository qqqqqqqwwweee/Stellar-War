/* ===========================================================
 *  StrategicAI —— 战略总控
 *  按各自频率调用 EconomyAI / ExpansionAI / MilitaryAI /
 *  ResearchAI / ProductionAI，并维护阶段与姿态
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const C = () => SW.AIConfig;

  class StrategicAI {
    constructor(game) {
      this.game = game;
      this.economy = new SW.EconomyAI(game);
      this.expansion = new SW.ExpansionAI(game);
      this.military = new SW.MilitaryAI(game);
      this.research = new SW.ResearchAI(game);
      this.production = new SW.ProductionAI(game);
      this._lastReal = {};
    }

    /** 每个模拟步调用（dt = 银河天） */
    update(dt) {
      const game = this.game;
      const iv = C().intervals;
      const now = performance.now ? performance.now() : Date.now();

      for (const f of game.factions.list) {
        if (f.defeated) continue;
        const T = f.ai.timers;

        /* 阶段判定 */
        const day = game.time.day;
        const th = C().strategic.phaseThresholds;
        f.ai.phase = day < th.early ? 'early' : (day < th.mid ? 'mid' : (day < th.late ? 'late' : 'end'));

        T.economy += dt;
        T.expansion += dt;
        T.military += dt;
        T.research += dt;
        T.production += dt;
        T.diplomacy += dt;
        T.strategic += dt;

        const throttle = (key) => {
          const k = f.id + '_' + key;
          const last = this._lastReal[k] || 0;
          if (now - last < C().minRealSeconds * 1000) return false;
          this._lastReal[k] = now;
          return true;
        };

        if (T.economy >= iv.economy && throttle('eco')) { T.economy = 0; this.economy.run(f); }
        if (T.expansion >= iv.expansion && throttle('exp')) { T.expansion = 0; this.expansion.run(f); }
        if (T.military >= iv.military && throttle('mil')) { T.military = 0; this.military.run(f); }
        if (T.production >= iv.production && throttle('prod')) { T.production = 0; this.production.run(f); }
        if (T.research >= iv.research && throttle('res')) { T.research = 0; this.research.choose(f); }
        if (T.diplomacy >= iv.diplomacy) {
          T.diplomacy = 0;
          game.diplomacy.considerWar(f);
          game.diplomacy.considerPeace(f);
        }

        /* 研究完成后立即续接 */
        if (f.tech.current === null) this.research.choose(f);
      }
    }

    /** 每秒左右执行的重计算 */
    periodic() {
      const game = this.game;
      game.economy.recomputeAll();
      for (const s of game.galaxy.stars) {
        const f = s.owner ? game.factions.get(s.owner) : null;
        game.economy.recomputeDefense(s, f, false);
      }
    }
  }

  SW.StrategicAI = StrategicAI;
})(window.SW);
