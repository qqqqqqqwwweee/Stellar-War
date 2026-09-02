/* ===========================================================
 *  ProductionSystem —— 舰船生产
 *  - 每个星系的船坞拥有多条生产线
 *  - 舰船以「堆叠」形式存在（性能考虑），泰坦/航母/旗舰为独立命名个体
 *  - 泰坦上限 5，超级旗舰上限 1
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class ProductionSystem {
    constructor(game) {
      this.game = game;
      /** 星系生产线：starId -> [{shipId, remaining, total, capitalName}] */
      this.lines = {};
    }

    /* ---------------- 成本 ---------------- */
    shipCost(shipId, faction) {
      const s = SW.ShipConfig[shipId];
      const mult = faction ? faction.m('shipCost') : 1;
      const shipMult = faction ? faction.shipMod(shipId, 'cost') : 1;
      return {
        metal: Math.round((s.cost.metal || 0) * mult * shipMult),
        darkMatter: Math.round((s.cost.darkMatter || 0) * mult * shipMult),
        materials: Math.round((s.cost.materials || 0) * mult * shipMult)
      };
    }
    buildDays(shipId, star, faction) {
      const s = SW.ShipConfig[shipId];
      let days = s.buildDays;
      days /= (faction ? faction.m('buildSpeed') : 1);
      days /= (faction ? faction.shipMod(shipId, 'build') : 1);
      if (star) {
        days /= (star.shipyardSpeed || 1);
        if (star.feature === 'forgeWorld') days /= 1.25;
      }
      return Math.max(1, days);
    }

    /** 该星系能否建造该舰种 */
    canBuildAt(star, shipId, faction) {
      if (!star || star.owner !== faction.id) return false;
      const need = SW.StarSystem.dockLevelFor(shipId);
      const actualLevel = typeof star.dedicatedShipyardLevel === 'function'
        ? star.dedicatedShipyardLevel() : (star.shipyardLevel || 0);
      if (actualLevel < need) return false;
      if (!faction.isResearched(SW.ShipConfig[shipId].tech || '')) {
        if (SW.ShipConfig[shipId].tech) return false;
      }
      return this.capitalRoom(faction, shipId) > 0;
    }

    /** 战略舰剩余可建造数量 */
    capitalRoom(faction, shipId) {
      const cfg = SW.ShipConfig[shipId];
      if (!cfg.maxPerFaction) return 999;
      return cfg.maxPerFaction - this.countCapital(faction, shipId);
    }

    countCapital(faction, shipId) {
      const fleets = this.game.fleets;
      let n = fleets.countCapitalAlive(faction.id, shipId);
      // 加上正在建造的
      for (const key in this.lines) {
        for (const l of this.lines[key]) {
          if (l.factionId === faction.id && l.shipId === shipId) n++;
        }
      }
      return n;
    }

    /** 该星系的空闲生产线数量 */
    freeLines(star) {
      const arr = this.lines[star.id] || [];
      return Math.max(0, (star.shipyardSlots || 0) - arr.length);
    }

    /* ---------------- 下单 ---------------- */
    order(star, shipId, faction) {
      if (!this.canBuildAt(star, shipId, faction)) return false;
      if (this.freeLines(star) <= 0) return false;
      const cost = this.shipCost(shipId, faction);
      if (!faction.canAfford(cost)) return false;
      faction.spend(cost);
      const days = this.buildDays(shipId, star, faction);
      const cfg = SW.ShipConfig[shipId];
      let name = null;
      if (cfg.capital) {
        const tag = faction.id === 'A' ? 'ISS' : faction.id === 'B' ? 'HLV' : faction.id === 'C' ? 'VSS' : 'IES';
        name = SW.NameGen.capital(this.game.rng, tag);
      }
      (this.lines[star.id] = this.lines[star.id] || []).push({
        shipId: shipId, factionId: faction.id, remaining: days, total: days, name: name
      });
      return true;
    }

    /* ---------------- 每日推进 ---------------- */
    update(dt) {
      const game = this.game;
      const events = game.events;
      for (const starId in this.lines) {
        const star = game.galaxy.get(starId);
        if (!star) { delete this.lines[starId]; continue; }
        const arr = this.lines[starId];
        for (let i = arr.length - 1; i >= 0; i--) {
          const l = arr[i];
          const faction = game.factions.get(l.factionId);
          if (!faction || faction.defeated || star.owner !== l.factionId) { arr.splice(i, 1); continue; }
          // 星系被围困（有敌方舰队）则暂停生产
          if (game.fleets.hasEnemyFleetAt(star.id, l.factionId)) continue;
          l.remaining -= dt;
          if (l.remaining <= 0) {
            arr.splice(i, 1);
            this.deliver(star, faction, l);
          }
        }
        if (!arr.length) delete this.lines[starId];
      }
    }

    /** 建造完成：加入驻扎舰队 */
    deliver(star, faction, line) {
      const game = this.game;
      const events = game.events;
      const fleet = game.fleets.getOrCreateGarrison(star.id, faction.id);
      fleet.addShips(line.shipId, 1, line.name);
      faction.stats.shipsBuilt++;

      const cfg = SW.ShipConfig[line.shipId];
      if (cfg.capital) {
        if (line.shipId === 'titan') {
          faction.stats.titansBuilt++;
          events.record(game, faction.name + '建成泰坦「' + line.name + '」，驶入银河战场。', 'capital', { factionId: faction.id, starId: star.id, priority: 4 });
          events.notify('【银河事件】' + faction.name + '完成泰坦「' + line.name + '」。', 'capital', { factionId: faction.id, starId: star.id, x: star.x, y: star.y, priority: 4 });
          events.emit('capitalBuilt', { faction: faction, star: star, shipId: line.shipId, name: line.name, priority: 4 });
        } else if (line.shipId === 'flagship') {
          faction.stats.flagshipBuilt++;
          faction.stats.flagshipName = line.name;
          events.record(game, '【银河事件】' + faction.name + '完成了「' + line.name + '」超级旗舰！', 'flagship', { factionId: faction.id, starId: star.id, priority: 5 });
          events.notify('【银河事件】' + faction.name + '完成超级旗舰「' + line.name + '」。', 'flagship', { factionId: faction.id, starId: star.id, x: star.x, y: star.y, priority: 5 });
          events.emit('flagshipBuilt', { faction: faction, star: star, name: line.name, priority: 5 });
        } else if (line.shipId === 'carrier') {
          events.record(game, faction.name + '建成航母「' + line.name + '」。', 'capital', { factionId: faction.id, starId: star.id, priority: 3 });
          events.notify('【银河事件】' + faction.name + '服役新航母「' + line.name + '」。', 'capital', { factionId: faction.id, starId: star.id, x: star.x, y: star.y, priority: 3 });
        }
      }
    }

    /* ---------------- 序列化 ---------------- */
    serialize() {
      const out = {};
      for (const k in this.lines) if (this.lines[k].length) out[k] = this.lines[k];
      return out;
    }
    deserialize(d) { this.lines = d || {}; }
  }

  SW.ProductionSystem = ProductionSystem;
})(window.SW);
