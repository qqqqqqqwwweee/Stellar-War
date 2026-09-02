/* ===========================================================
 *  ProductionAI —— 造舰决策（含泰坦 / 航母 / 超级旗舰）
 *  决策频率：aiConfig.intervals.production
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const C = () => SW.AIConfig.production;

  class ProductionAI {
    constructor(game) {
      this.game = game;
      this.lastDecision = null;
    }

    run(faction) {
      const game = this.game;
      if (faction.defeated) {
        this.lastDecision = { emergency: false, reasons: [], orders: 0, spentMetal: 0, budgetMetal: 0 };
        return this.lastDecision;
      }
      const prod = game.production;
      const state = this._emergencyState(faction);
      const cap = this.fleetCap(faction);
      const allowedCap = this._allowedFleetCap(cap, state.allowEmergencyOverage);
      const cur = this._currentForce(faction);
      const decision = {
        emergency: state.emergency,
        reasons: state.reasons,
        warPressure: state.warPressure,
        stockPressure: state.stockPressure,
        stockPressureTriggered: state.stockPressureTriggered,
        orders: 0,
        spentMetal: 0,
        budgetMetal: 0,
        targetCap: cap,
        allowedCap: allowedCap,
        orderLimit: this._orderLimit(state)
      };
      this.lastDecision = decision;

      /* 两项都达到允许的软上限才停止，避免 ships/power 一项先满就误停。 */
      if (cur.ships >= allowedCap.ships && cur.power >= allowedCap.power) return decision;
      this.force = cur;
      this.targetCap = cap;
      this.capLimit = allowedCap;

      const addRegularResult = (result) => {
        if (!result) return;
        decision.orders += result.orders || 0;
        decision.spentMetal += result.spentMetal || 0;
        decision.budgetMetal = Math.max(decision.budgetMetal, result.budgetMetal || 0);
      };
      const refreshForce = () => { this.force = this._currentForce(faction); };

      /* 濒危时先用便宜快速舰填补空档；平时保留战略舰优先级。 */
      if (state.emergency) {
        addRegularResult(this._regularShips(faction, prod, state));
        refreshForce();
        decision.orders += this._capitalShips(faction, prod);
      } else {
        decision.orders += this._capitalShips(faction, prod);
        refreshForce();
        addRegularResult(this._regularShips(faction, prod, state));
      }
      return decision;
    }

    /** 舰队规模软上限：由领土与战争状态决定 */
    fleetCap(faction) {
      const C = SW.GalaxyConfig.fleetCap;
      const ownedStars = this.game && this.game.galaxy && this.game.galaxy.starsOf
        ? this.game.galaxy.starsOf(faction.id).length : 0;
      const stars = Math.max(1, Number(faction.stats && faction.stats.starsOwned) || 0, ownedStars);
      let war = 0;
      for (const k in faction.atWar) if (faction.atWar[k]) war = 1;
      const mult = war ? C.warMult : 1;
      return {
        ships: Math.round((C.baseShips + stars * C.shipsPerStar) * mult),
        power: Math.round((C.basePower + stars * C.powerPerStar) * mult)
      };
    }

    _allowedFleetCap(cap, emergency) {
      const cfg = SW.GalaxyConfig.fleetCap || {};
      const key = emergency ? 'emergencyOverageRatio' : 'normalOverageRatio';
      const overage = Number.isFinite(cfg[key]) ? Math.max(0, cfg[key]) : 0;
      return {
        ships: Math.ceil(cap.ships * (1 + overage)),
        power: Math.ceil(cap.power * (1 + overage))
      };
    }

    _currentForce(faction) {
      let ships = 0, power = 0;
      for (const f of this.game.fleets.fleetsOf(faction.id)) {
        ships += f.totalShips();
        power += f.power;
      }
      /* 正在建造的也计入 */
      const lines = this.game.production.lines;
      for (const k in lines) for (const l of lines[k]) {
        if (l.factionId !== faction.id) continue;
        ships++;
        power += SW.ShipConfig[l.shipId].power;
      }
      return { ships: ships, power: power };
    }

    /* ---------------- 战略舰 ---------------- */
    _capitalShips(faction, prod) {
      const game = this.game;
      const unlocked = faction.unlockedShips();
      let orders = 0;
      const starsOwned = Math.max(1, Number(faction.stats && faction.stats.starsOwned) || 0,
        game.galaxy && game.galaxy.starsOf ? game.galaxy.starsOf(faction.id).length : 0);

      /* 超级旗舰：唯一，且需要极高经济 */
      if (unlocked.indexOf('flagship') >= 0 && prod.capitalRoom(faction, 'flagship') > 0) {
        const need = C().flagshipMinIncome;
        const ready = faction.income.metal >= need.metal &&
          faction.income.darkMatter >= need.darkMatter &&
          faction.income.materials >= need.materials;
        if (ready && starsOwned >= 6) {
          const star = this._bestDock(faction, 'flagship');
          if (star && prod.canBuildAt(star, 'flagship', faction)) {
            const cost = prod.shipCost('flagship', faction);
            if (faction.canAfford(cost)) {
              if (prod.order(star, 'flagship', faction)) {
                orders++;
                game.events.record(game, faction.name + '开始建造超级旗舰——银河终局兵器。', 'flagship', { factionId: faction.id, priority: 5 });
                game.events.notify('【银河事件】' + faction.name + '开始建造超级旗舰。', 'flagship', { factionId: faction.id, priority: 5 });
              }
            }
          }
        }
      }

      /* 泰坦：最多 5 艘 */
      if (unlocked.indexOf('titan') >= 0 && prod.capitalRoom(faction, 'titan') > 0) {
        const need = C().titanMinIncome;
        const want = Math.min(prod.capitalRoom(faction, 'titan'), this._desiredTitans(faction));
        let building = this._countBuilding(faction, 'titan');
        for (let i = 0; i < want - building; i++) {
          const ready = faction.income.metal >= need.metal * (1 + building * 0.4) &&
            faction.income.darkMatter >= need.darkMatter * (1 + building * 0.4) &&
            faction.income.materials >= need.materials * (1 + building * 0.4);
          if (!ready) break;
          const star = this._bestDock(faction, 'titan');
          if (!star || !prod.canBuildAt(star, 'titan', faction)) break;
          const cost = prod.shipCost('titan', faction);
          if (!faction.canAfford(cost)) break;
          if (prod.order(star, 'titan', faction)) {
            building++;
            orders++;
          }
        }
      }

      /* 航母 */
      if (unlocked.indexOf('carrier') >= 0 && prod.capitalRoom(faction, 'carrier') > 0) {
        const desire = faction.cfg.ai.techFocus * 0.8 + 0.4;
        const want = Math.min(prod.capitalRoom(faction, 'carrier'), Math.round(starsOwned / 8 * desire) + 1);
        let building = this._countBuilding(faction, 'carrier');
        const have = prod.countCapital(faction, 'carrier');
        for (let i = 0; i < want - have - building; i++) {
          if (faction.income.darkMatter < 18) break;
          const star = this._bestDock(faction, 'carrier');
          if (!star || !prod.canBuildAt(star, 'carrier', faction)) break;
          const cost = prod.shipCost('carrier', faction);
          if (!faction.canAfford(cost)) break;
          if (!prod.order(star, 'carrier', faction)) break;
          building++;
          orders++;
        }
      }
      return orders;
    }

    _desiredTitans(faction) {
      const ownedStars = Math.max(1, Number(faction.stats && faction.stats.starsOwned) || 0,
        this.game.galaxy && this.game.galaxy.starsOf ? this.game.galaxy.starsOf(faction.id).length : 0);
      const base = Math.floor(ownedStars / 9) + 1;
      const rush = faction.cfg.ai.titanRush;
      return U.clamp(Math.round(base * (0.6 + rush)), 0, SW.ShipConfig.titan.maxPerFaction);
    }

    _countBuilding(faction, shipId) {
      let n = 0;
      const lines = this.game.production.lines;
      for (const k in lines) for (const l of lines[k]) if (l.factionId === faction.id && l.shipId === shipId) n++;
      return n;
    }

    _bestDock(faction, shipId) {
      const need = SW.StarSystem.dockLevelFor(shipId);
      const stars = this.game.galaxy.starsOf(faction.id)
        .filter(s => (s.shipyardLevel || 0) >= need && s.strategicValue >= 0)
        .sort((a, b) => (b.shipyardLevel - a.shipyardLevel) || (b.devLevel - a.devLevel) || (b.strategicValue - a.strategicValue));
      // 不要在遭围攻的星系开工
      for (const s of stars) {
        if (this.game.fleets.hasEnemyFleetAt(s.id, faction.id)) continue;
        if (this.game.production.freeLines(s) <= 0) continue;
        return s;
      }
      return null;
    }

    /* ---------------- 常规舰 ---------------- */
    _regularShips(faction, prod, state) {
      const game = this.game;
      const emergency = !!(state && state.emergency);
      const cfg = C();
      const result = { emergency: emergency, orders: 0, spentMetal: 0, budgetMetal: 0 };
      const unlocked = faction.unlockedShips().filter(id => !SW.ShipConfig[id].capital);
      if (!unlocked.length) return result;

      const threshold = cfg.spendingThreshold || {};
      const pressureCfg = cfg.stockPressure || {};
      const pressureLevel = U.clamp(Number(state && state.stockPressure) || 0, 0, 1);
      const minimumMetal = emergency
        ? Math.min(Number(threshold.metal) || 0, 45)
        : (Number(threshold.metal) || 0);
      const pressureMetalThreshold = pressureLevel > 0
        ? Math.min(minimumMetal, Number(pressureCfg.pressureMetalThreshold) || 45)
        : minimumMetal;
      if (faction.res.metal < pressureMetalThreshold) return result;

      /* 计算当前舰队构成 */
      const composition = {};
      let total = 0;
      for (const f of game.fleets.fleetsOf(faction.id)) {
        for (const u of f.units) {
          composition[u.shipId] = (composition[u.shipId] || 0) + u.count;
          total += u.count;
        }
      }

      /* 战争压力 -> 提高造舰预算 */
      const war = this._warPressure(faction);
      const reserveDays = emergency ? (Number(cfg.emergencyReserveDays) || 18) : (Number(cfg.reserveDays) || 45);
      const reserve = this._minimumReserve(faction, reserveDays);
      const ratio = emergency ? (Number(cfg.emergencyBuildRatio) || 0) : (Number(cfg.normalBudgetRatio) || 0);
      const normalCapitalReserve = U.clamp(Number(cfg.keepReserveForCapital) || 0, 0, 0.9);
      const pressureCapitalReserve = Number(pressureCfg.capitalReserveRatio);
      const capitalReserve = emergency ? 0.05 :
        pressureLevel > 0 && Number.isFinite(pressureCapitalReserve)
          ? Math.min(normalCapitalReserve, U.clamp(pressureCapitalReserve, 0, 0.9))
          : normalCapitalReserve;
      const spendableMetal = Math.max(0, faction.res.metal - reserve.metal);
      const boost = !emergency
        ? Math.max(0, Number(pressureCfg.budgetBoost) || 0) * pressureLevel
        : 0;
      const maxBudgetRatio = Number.isFinite(Number(pressureCfg.maxBudgetRatio))
        ? U.clamp(Number(pressureCfg.maxBudgetRatio), 0, 1.5) : 1;
      const effectiveRatio = emergency
        ? U.clamp(ratio, 0, maxBudgetRatio)
        : U.clamp(ratio * (1 + boost), 0, maxBudgetRatio);
      const budgetMetal = spendableMetal * effectiveRatio * (1 - capitalReserve);
      result.budgetMetal = budgetMetal;
      if (budgetMetal <= 0) return result;
      let spent = 0;
      let committedMetal = 0;
      const committed = { darkMatter: 0, materials: 0 };

      const mix = cfg.shipMix || {};
      const highTierMinSize = Math.max(1, Number(mix.highTierMinSize) || 5);
      const highTierMaxRatio = U.clamp(Number(mix.highTierMaxRatio) || 0, 0, 1);
      const highTierMinFleet = Math.max(0, Number(mix.highTierMinFleet) || 0);
      const initialHighShips = Math.max(0, Math.floor(Number(mix.initialHighShips) || 0));
      let highTotal = 0;
      for (const id in composition) {
        if (SW.ShipConfig[id] && SW.ShipConfig[id].size >= highTierMinSize) highTotal += composition[id];
      }
      const highLimit = total >= highTierMinFleet
        ? Math.max(1, Math.floor(total * highTierMaxRatio))
        : initialHighShips;

      /* 剩余可建造额度（受软上限约束） */
      let roomShips = this.capLimit.ships - this.force.ships;
      let roomPower = this.capLimit.power - this.force.power;
      if (roomShips <= 0 && roomPower <= 0) return result;

      /* 选择优先级最高的若干舰种下單 */
      const ranked = this._rankShips(faction, unlocked, composition, total, war, emergency);

      const stars = game.galaxy.starsOf(faction.id)
        .filter(s => (s.shipyardSlots || 0) > 0)
        .sort((a, b) => (b.shipyardLevel - a.shipyardLevel) || (b.shipyardSpeed - a.shipyardSpeed));

      const maxOrders = this._orderLimit({ emergency: emergency, stockPressure: pressureLevel });
      const lowTierMaxSize = Number(mix.lowTierMaxSize) || 2;
      const lowRanked = ranked.filter(shipId => SW.ShipConfig[shipId].size <= lowTierMaxSize);
      const lowOrderRatio = U.clamp(Number(mix.lowTierOrderRatio) || 0, 0, 1);
      const lowOrderSlots = lowRanked.length
        ? Math.max(1, Math.ceil(maxOrders * lowOrderRatio))
        : 0;
      const orderSequence = [];
      for (let i = 0; i < lowOrderSlots; i++) orderSequence.push(lowRanked[i % lowRanked.length]);
      for (const shipId of ranked) {
        if (SW.ShipConfig[shipId].size > lowTierMaxSize) orderSequence.push(shipId);
      }
      const upkeepCfg = SW.GalaxyConfig.upkeep || {};
      for (const shipId of orderSequence) {
        if (result.orders >= maxOrders) break;
        if (roomShips <= 0 && roomPower <= 0) break;
        if (SW.ShipConfig[shipId].size >= highTierMinSize && highTotal >= highLimit) continue;
        const cost = prod.shipCost(shipId, faction);
        const futureMetalReserve = (cost.metal || 0) * (Number(upkeepCfg.metalPerCost) || 0) * reserveDays;
        const commitment = (cost.metal || 0) + futureMetalReserve;
        if (commitment <= 0 || committedMetal + commitment > budgetMetal) continue;
        // 单一舰种上限
        const cap = Math.max(6, Math.round(total * C().maxShipsPerTypeRatio));
        let count = composition[shipId] || 0;
        for (const star of stars) {
          if (result.orders >= maxOrders) break;
          if (committedMetal + commitment > budgetMetal) break;
          if (count >= cap) break;
          if (roomShips <= 0 && roomPower <= 0) break;
          if (!prod.canBuildAt(star, shipId, faction)) continue;
          if (prod.freeLines(star) <= 0) continue;
          if (game.fleets.hasEnemyFleetAt(star.id, faction.id)) continue;
          if (!faction.canAfford(cost)) continue;
          if (((cost.darkMatter || 0) > 0 &&
              faction.res.darkMatter - committed.darkMatter - cost.darkMatter < reserve.darkMatter) ||
            ((cost.materials || 0) > 0 &&
              faction.res.materials - committed.materials - cost.materials < reserve.materials)) continue;
          if (prod.order(star, shipId, faction)) {
            spent += cost.metal;
            committedMetal += commitment;
            committed.darkMatter += cost.darkMatter || 0;
            committed.materials += cost.materials || 0;
            result.orders++;
            result.spentMetal = spent;
            count++;
            if (SW.ShipConfig[shipId].size >= highTierMinSize) highTotal++;
            roomShips--;
            roomPower -= SW.ShipConfig[shipId].power;
          }
        }
      }
      return result;
    }

    _orderLimit(state) {
      const cfg = C();
      const emergency = !!(state && state.emergency);
      if (emergency) return Number(cfg.emergencyMaxOrdersPerRun) || Number(cfg.maxOrdersPerRun) || 1;
      const base = Number(cfg.maxOrdersPerRun) || 1;
      const pressureCfg = cfg.stockPressure || {};
      const pressure = U.clamp(Number(state && state.stockPressure) || 0, 0, 1);
      const pressureLimit = Number(cfg.pressureMaxOrdersPerRun) || base;
      const extra = Math.max(0, Number(pressureCfg.extraOrders) || 0);
      return Math.max(base, Math.min(pressureLimit, base + Math.round(extra * pressure)));
    }

    _stockPressure(faction) {
      const cfg = C().stockPressure || {};
      const starts = cfg.startRatio || {};
      const triggers = cfg.triggerRatio || {};
      const caps = SW.ResourceConfig && SW.ResourceConfig.cap ? SW.ResourceConfig.cap : {};
      const ratios = {};
      let level = 0;
      let triggered = false;
      for (const key of ['metal', 'darkMatter', 'materials']) {
        const cap = Number(caps[key]) || 0;
        const stock = Number(faction.res && faction.res[key]) || 0;
        const ratio = cap > 0 ? U.clamp(stock / cap, 0, 1) : 0;
        const start = U.clamp(Number(starts[key]) || 0.38, 0, 0.98);
        const trigger = Math.max(start + 0.01, U.clamp(Number(triggers[key]) || 0.50, start + 0.01, 1));
        const pressure = ratio <= start ? 0 : U.clamp((ratio - start) / (trigger - start), 0, 1);
        ratios[key] = ratio;
        level = Math.max(level, pressure);
        if (ratio >= trigger) triggered = true;
      }
      return { level: level, triggered: triggered, ratios: ratios };
    }

    _minimumReserve(faction, days) {
      const cfg = C().minimumOperatingReserve || {};
      const upkeep = faction.upkeep || {};
      const reserveDays = Math.max(0, Number(days) || 0);
      return {
        metal: Math.max(Number(cfg.metal) || 0, (Number(upkeep.metal) || 0) * reserveDays),
        darkMatter: Math.max(Number(cfg.darkMatter) || 0, (Number(upkeep.darkMatter) || 0) * reserveDays),
        materials: Math.max(Number(cfg.materials) || 0, (Number(upkeep.materials) || 0) * reserveDays)
      };
    }

    _emergencyState(faction) {
      const game = this.game;
      const cfg = C();
      const warPressure = this._warPressure(faction);
      const stockPressure = this._stockPressure(faction);
      const stars = game.galaxy && game.galaxy.starsOf ? game.galaxy.starsOf(faction.id) : [];
      const reasons = [];
      const lost = Number(faction.stats && faction.stats.starsLost) || 0;
      const lossLimit = Math.max(1, Number(cfg.emergencyStarLosses) || 2);
      if (lost >= lossLimit || (stars.length <= 1 && lost > 0)) reasons.push('starLoss');
      if (faction.ai && faction.ai.posture === 'desperate') reasons.push('desperatePosture');
      if (warPressure >= (Number(cfg.emergencyWarPressure) || 0.75)) reasons.push('warPressure');

      let capitalThreat = false;
      let borderThreat = false;
      for (const star of stars) {
        if (!this._isThreatenedStar(star, faction)) continue;
        if (star.isHome) capitalThreat = true;
        if (this._isBorderStar(star, faction)) borderThreat = true;
      }
      if (capitalThreat) reasons.push('besiegedCapital');
      if (borderThreat) reasons.push('threatenedBorder');

      const reserve = this._minimumReserve(faction, Number(cfg.reserveDays) || 45);
      const stockMultiplier = Math.max(1, Number(cfg.emergencyStockMultiplier) || 2.2);
      const threshold = cfg.spendingThreshold || {};
      const stockRich = ['metal', 'darkMatter', 'materials'].some((key) => {
        const stock = Number(faction.res[key]) || 0;
        const floor = Number(threshold[key]) || 0;
        return stock >= Math.max(floor, reserve[key] * stockMultiplier);
      });
      return {
        emergency: reasons.length > 0,
        /* 只有真实战事、失星或被围才获得临时 emergency overage；
         * 单纯库存富余仍会提高消费预算，但不把超编变成常态。 */
        allowEmergencyOverage: reasons.some(reason =>
          reason === 'starLoss' || reason === 'desperatePosture' || reason === 'warPressure' ||
          reason === 'besiegedCapital' || reason === 'threatenedBorder'),
        reasons: reasons,
        warPressure: warPressure,
        stockRich: stockRich,
        stockPressure: stockPressure.level,
        stockPressureTriggered: stockPressure.triggered,
        stockPressureRatios: stockPressure.ratios
      };
    }

    _isThreatenedStar(star, faction) {
      if (!star || !this.game.fleets) return false;
      if (typeof this.game.fleets.enemiesAt === 'function') {
        return this.game.fleets.enemiesAt(star.id, faction.id).length > 0;
      }
      return typeof this.game.fleets.hasEnemyFleetAt === 'function' &&
        this.game.fleets.hasEnemyFleetAt(star.id, faction.id);
    }

    _isBorderStar(star, faction) {
      if (!star || !this.game.galaxy || typeof this.game.galaxy.get !== 'function') return false;
      for (const id of (star.links || [])) {
        const neighbor = this.game.galaxy.get(id);
        if (neighbor && neighbor.owner !== faction.id) return true;
      }
      return false;
    }

    /** 依据当前构成与局势为舰种排序 */
    _rankShips(faction, unlocked, composition, total, war, emergency) {
      const desire = C().desiredComposition;
      const mix = C().shipMix || {};
      const lowTierMaxSize = Number(mix.lowTierMaxSize) || 2;
      const highTierMinSize = Number(mix.highTierMinSize) || 5;
      const scores = unlocked.map(id => {
        const cfg = SW.ShipConfig[id];
        const want = (desire[id] || 1);
        const have = composition[id] || 0;
        const ratio = total > 0 ? have / total : 0;
        const wantRatio = want / this._sumDesire(unlocked);
        let s = (wantRatio - ratio) * 100;

        /* 性价比：每点战力的金属成本 */
        const cost = cfg.cost.metal + cfg.cost.darkMatter * 2.5 + cfg.cost.materials * 12;
        const eff = cfg.power / Math.max(1, cost);
        s += eff * 120;

        /* 战争时偏好大型舰 */
        if (war > 0.3) s += cfg.size * 3 * war;
        /* 早期偏好小型舰 */
        if (faction.ai.phase === 'early') s += (4 - cfg.size) * 4;
        if (cfg.size <= lowTierMaxSize) s += Number(mix.lowTierBias) || 0;
        else if (cfg.size >= highTierMinSize) s -= Number(mix.highTierPenalty) || 0;
        else s += Number(mix.mediumTierBias) || 0;
        /* 势力特色舰种加成 */
        if (faction.cfg.uniqueUnit && faction.cfg.uniqueUnit.ship === id) s += 12;
        /* 反制：敌人多大型舰 -> 造鱼雷舰 */
        if (id === 'torpedoBoat') s += this._enemyCapitalThreat(faction) * 20;
        /* 敌人多小型舰 -> 造驱逐 */
        if (id === 'destroyer') s += 4;
        if (emergency) {
          /* 濒危时优先便宜、快速的小舰，仍保留舰种配比和效率评分。 */
          const sizeLimit = Number(C().emergencyMaxShipSize) || 3;
          const sizeWeight = Number(C().emergencySizeWeight) || 0;
          const costWeight = Number(C().emergencyCostWeight) || 0;
          const timeWeight = Number(C().emergencyBuildTimeWeight) || 0;
          s += (sizeLimit - cfg.size) * sizeWeight;
          s -= (cfg.cost.metal || 0) * costWeight;
          s -= (cfg.buildDays || 0) * timeWeight;
        }
        return { id: id, score: s };
      });
      scores.sort((a, b) => b.score - a.score);
      return scores.map(x => x.id);
    }

    _sumDesire(list) {
      let s = 0;
      for (const id of list) s += (C().desiredComposition[id] || 1);
      return Math.max(1, s);
    }

    _enemyCapitalThreat(faction) {
      let n = 0;
      for (const o of this.game.factions.list) {
        if (o.id === faction.id || o.defeated) continue;
        if (!faction.isEnemy(o.id) && !o.isEnemy(faction.id)) continue;
        for (const f of this.game.fleets.fleetsOf(o.id)) {
          n += f.shipCount('battleship') + f.shipCount('dreadnought') * 2 + f.shipCount('titan') * 5;
        }
      }
      return U.clamp(n / 20, 0, 1);
    }

    _warPressure(faction) {
      let n = 0;
      for (const oid in faction.atWar) if (faction.atWar[oid]) n++;
      return U.clamp(n * 0.5 + faction.ai.threatLevel * 0.5, 0, 1.5);
    }
  }

  SW.ProductionAI = ProductionAI;
})(window.SW);
