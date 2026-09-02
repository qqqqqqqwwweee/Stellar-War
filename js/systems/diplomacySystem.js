/* ===========================================================
 *  DiplomacySystem —— 外交关系、宣战、停战、阵营
 *  规则简单：接触 -> 摩擦 -> 宣战 -> 战争疲劳 -> 停战
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const D = () => SW.AIConfig.diplomacy;

  class DiplomacySystem {
    constructor(game) { this.game = game; }

    update(dt) {
      const game = this.game;
      const galaxy = game.galaxy;
      for (const f of game.factions.list) {
        if (f.defeated) continue;
        for (const o of game.factions.list) {
          if (o.id === f.id || o.defeated) continue;
          /* 接触检测：领土距离 <= 1 跳 */
          if (!f.contacts[o.id]) {
            if (this._borderContact(f.id, o.id, galaxy)) {
              f.contacts[o.id] = true;
              o.contacts[f.id] = true;
              game.events.record(game, f.name + '与' + o.name + '在边境发生第一次接触。', 'diplomacy', { factionId: f.id, priority: 1 });
            }
          }
        }
      }
    }

    _borderContact(aId, bId, galaxy) {
      const a = galaxy.starsOf(aId);
      for (const s of a) {
        for (const nId of s.links) {
          const n = galaxy.get(nId);
          if (n && n.owner === bId) return true;
        }
      }
      return false;
    }

    /** AI 决定宣战 */
    considerWar(faction) {
      const game = this.game;
      if (faction.defeated) return false;

      /* 宣战阈值：性格越激进越容易开战 */
      let thr = D().warDeclarationThreshold * (1 - faction.cfg.ai.aggression * 0.5);

      /* 无地可扩时，战争成为唯一出路 —— 阈值大幅放宽 */
      let neutral = 0;
      for (const s of game.galaxy.stars) if (s.owner === null) neutral++;
      if (neutral === 0) thr += 38;
      else if (neutral < 14) thr += 20;
      else if (neutral < 34) thr += 8;

      const myPower = this._power(faction.id);

      for (const o of game.factions.list) {
        if (o.id === faction.id || o.defeated) continue;
        if (faction.atWar[o.id]) continue;
        if (!faction.contacts[o.id]) continue;
        if ((faction.truceUntil[o.id] || 0) > game.time.day) continue;

        /* 军力优势会显著推动开战 */
        const itsPower = this._power(o.id);
        let t = thr;
        if (myPower > itsPower * 1.5) t += 22;
        else if (myPower > itsPower * 1.15) t += 10;
        else if (myPower < itsPower * 0.7) t -= 12;   // 打不过就忍

        /* 边境摩擦：接壤越长，关系恶化越快 */
        const rel = faction.relationWith(o.id);
        if (rel <= t) {
          this.declareWar(faction, o);
          return true;
        }
      }
      return false;
    }

    _power(factionId) {
      let p = 0;
      for (const f of this.game.fleets.fleets) if (f.factionId === factionId) p += f.power;
      return p;
    }

    declareWar(a, b) {
      const game = this.game;
      a.atWar[b.id] = true;
      b.atWar[a.id] = true;
      a.setRelation(b.id, -100);
      b.setRelation(a.id, -100);
      const msg = '【银河事件】' + a.name + '向' + b.name + '正式宣战！';
      game.events.record(game, msg, 'war', { factionId: a.id, priority: 4 });
      game.events.notify(msg, 'war', { factionId: a.id, priority: 4 });
      game.events.emit('warDeclared', { a: a.id, b: b.id, priority: 4 });
    }

    makePeace(a, b) {
      const game = this.game;
      delete a.atWar[b.id];
      delete b.atWar[a.id];
      a.setRelation(b.id, -20);
      b.setRelation(a.id, -20);
      a.truceUntil[b.id] = game.time.day + D().truceMinDays;
      b.truceUntil[a.id] = game.time.day + D().truceMinDays;
      a.warWeariness[b.id] = 0;
      b.warWeariness[a.id] = 0;
      const msg = a.name + '与' + b.name + '签署了停战协议。';
      game.events.record(game, msg, 'diplomacy', { factionId: a.id, priority: 2 });
      game.events.notify(msg, 'diplomacy', { factionId: a.id, priority: 2 });
    }

    considerPeace(faction) {
      const game = this.game;
      for (const oid in faction.atWar) {
        if (!faction.atWar[oid]) continue;
        const o = game.factions.get(oid);
        if (!o || o.defeated) { delete faction.atWar[oid]; continue; }
        const weary = faction.warWeariness[oid] || 0;
        const oWeary = o.warWeariness[faction.id] || 0;
        const need = SW.AIConfig.diplomacy.peaceWearinessNeed;
        /* 一方彻底打不动了，另一方也厌倦，就停战 */
        if (weary > need && oWeary > need * 0.7 && (faction.truceUntil[oid] || 0) < game.time.day) {
          this.makePeace(faction, o);
          return true;
        }
      }
      return false;
    }

    /** 所有战争对 */
    activeWars() {
      const out = [];
      const seen = new Set();
      for (const f of this.game.factions.list) {
        for (const oid in f.atWar) {
          if (!f.atWar[oid]) continue;
          const k = f.id < oid ? f.id + oid : oid + f.id;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push([f.id, oid]);
        }
      }
      return out;
    }

    serialize() { return { wars: this.activeWars() }; }
  }

  SW.DiplomacySystem = DiplomacySystem;
})(window.SW);
