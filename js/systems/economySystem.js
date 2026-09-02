/* ===========================================================
 *  EconomySystem —— 资源产出、维护费、恒星开发升级、建筑建造队列
 *  产出公式：
 *    星系产出 = (基础资源 × 类型加成 × 特性加成 + 建筑 flat)
 *              × (1 + 开发等级 × yieldPerLevel + 建筑 mult)
 *              × 势力修正 × 全局系数
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const KEYS = ['metal', 'darkMatter', 'materials', 'research'];

  class EconomySystem {
    constructor(game) {
      this.game = game;
    }

    /*
     * 资源节奏按资源分别取值。旧配置没有 tempo 时回退到 globalMult，
     * 因而旧存档和外部测试仍可只提供原有配置字段。
     */
    resourceMultiplier(key) {
      const cfg = SW.ResourceConfig || {};
      const global = cfg.globalMult || {};
      const tempo = cfg.tempo || {};
      const base = Number.isFinite(global[key]) ? global[key] : 1;
      const day = this.game && this.game.time && Number.isFinite(this.game.time.day)
        ? this.game.time.day : 0;
      const bands = tempo.phaseDays || {};
      const phase = day < (Number.isFinite(bands.early) ? bands.early : Infinity)
        ? 'early' : day < (Number.isFinite(bands.mid) ? bands.mid : Infinity) ? 'mid' : 'late';
      const phaseCfg = tempo.phaseMult && tempo.phaseMult[phase];
      const phaseMult = phaseCfg && Number.isFinite(phaseCfg[key]) ? phaseCfg[key] : 1;
      return Math.max(0, base * phaseMult);
    }

    /* ---------------- 星系产出 ---------------- */
    starYield(star, faction) {
      const out = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
      if (!faction) return out;
      if (star.devLevel <= 0 && !star.isHome) {
        // 未开发的星系仍贡献极小部分（前哨采集）
      }
      const devMult = 1 + star.devLevel * SW.GalaxyConfig.devLevel.yieldPerLevel;
      const f = faction;

      const flatBonus = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
      const multBonus = { metal: 0, darkMatter: 0, materials: 0, research: 0 };

      for (const b of star.buildings) {
        const cfg = SW.BuildingConfig[b.id];
        if (!cfg || !cfg.yield) continue;
        const hpRatio = b.maxHp > 0 ? U.clamp(b.hp / b.maxHp, 0, 1) : 1;
        for (const k in cfg.yield) {
          flatBonus[k] += (cfg.yield[k].flat || 0) * hpRatio;
          multBonus[k] += (cfg.yield[k].mult || 0) * hpRatio;
        }
      }

      for (const k of KEYS) {
        const base = star.base[k] || 0;
        const v = (base + flatBonus[k]) * devMult * (1 + multBonus[k]);
        out[k] = v * f.m(k) * this.resourceMultiplier(k);
      }
      // 特性：造船加成 / 后勤加成 不影响产出
      return out;
    }

    /** 星系维护费 */
    starUpkeep(star) {
      const out = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
      for (const b of star.buildings) {
        const cfg = SW.BuildingConfig[b.id];
        if (!cfg || !cfg.upkeep) continue;
        for (const k in cfg.upkeep) out[k] += cfg.upkeep[k];
      }
      return out;
    }

    /** 舰队维护费：舰船越多，净收入越少（防止舰队无限膨胀） */
    fleetUpkeep(faction) {
      const cfg = SW.GalaxyConfig.upkeep;
      const out = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
      for (const fl of this.game.fleets.fleets) {
        if (fl.factionId !== faction.id) continue;
        for (const u of fl.units) {
          const sc = SW.ShipConfig[u.shipId];
          const mult = sc.capital ? cfg.capitalMult : 1;
          out.metal += u.count * (sc.cost.metal || 0) * cfg.metalPerCost * mult;
          out.darkMatter += u.count * (sc.cost.darkMatter || 0) * cfg.darkMatterPerCost * mult;
        }
      }
      return out;
    }

    /* ---------------- 势力收入 ---------------- */
    recomputeIncome(faction) {
      const galaxy = this.game.galaxy;
      const inc = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
      const up = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
      for (const s of galaxy.stars) {
        if (s.owner !== faction.id) continue;
        const y = this.starYield(s, faction);
        for (const k of KEYS) inc[k] += y[k];
        const u = this.starUpkeep(s);
        for (const k of KEYS) up[k] += u[k];
      }
      /* 舰队维护费 */
      const fu = this.fleetUpkeep(faction);
      for (const k of KEYS) up[k] += fu[k];
      // 基础收入（防止完全停摆）
      inc.metal += 3;
      inc.research += 1.2;
      // 维护费从收入扣除
      for (const k of KEYS) inc[k] = Math.max(0, inc[k] - up[k]);
      faction.income = { metal: inc.metal, darkMatter: inc.darkMatter, materials: inc.materials, research: inc.research };
      faction.upkeep = up;
      return faction.income;
    }

    recomputeAll() {
      for (const f of this.game.factions.list) this.recomputeIncome(f);
    }

    /* ---------------- 星系防御值 ----------------
     * @param fill=true 时把防御与护盾回满（用于新占领 / 初始化）
     */
    recomputeDefense(star, faction, fill) {
      let hp = 0, dmg = 0, shield = 0;
      const DEV = SW.GalaxyConfig.devLevel;
      hp += star.devLevel * DEV.defensePerLevel;
      dmg += star.devLevel * 1.2;
      for (const b of star.buildings) {
        const cfg = SW.BuildingConfig[b.id];
        if (!cfg || !cfg.defense) continue;
        hp += cfg.defense.hp || 0;
        dmg += cfg.defense.damage || 0;
        shield += cfg.starShield || 0;
      }
      if (faction) {
        hp *= faction.m('defense');
        dmg *= faction.m('defense');
        shield *= faction.m('defense');
      }
      star.defenseMaxHp = Math.max(1, Math.round(hp));
      star.starShieldMax = Math.round(shield);
      if (fill) {
        star.defenseHp = star.defenseMaxHp;
        star.starShield = star.starShieldMax;
      } else {
        /* 只做上限收敛，绝不把被打穿的防御"回满"
         * （否则攻方永远无法突破，星系永不失守） */
        star.defenseHp = Math.min(star.defenseHp, star.defenseMaxHp);
        star.starShield = Math.min(star.starShield, star.starShieldMax);
      }
      star.defenseDamage = dmg;
      return star.defenseMaxHp;
    }

    /* ---------------- 开发等级升级 ---------------- */
    devUpgradeCost(star) {
      const arr = SW.GalaxyConfig.devLevel.upgradeCost;
      return arr[Math.min(star.devLevel, arr.length - 1)];
    }
    devUpgradeDays(star) {
      const arr = SW.GalaxyConfig.devLevel.upgradeDays;
      return arr[Math.min(star.devLevel, arr.length - 1)];
    }
    canUpgradeDev(star, faction) {
      if (star.devLevel >= SW.GalaxyConfig.devLevel.max) return false;
      const cost = this.devUpgradeCost(star);
      return faction.canAfford({ metal: cost.metal, materials: cost.materials });
    }
    queueDevUpgrade(star, faction) {
      if (!this.canUpgradeDev(star, faction)) return false;
      const lvl = star.devLevel;
      if (star.queue.some(q => q.kind === 'dev' && q.level === lvl)) return false;
      const cost = this.devUpgradeCost(star);
      faction.spend({ metal: cost.metal, materials: cost.materials });
      const days = this.devUpgradeDays(star) / faction.m('buildSpeed');
      star.queue.push({ kind: 'dev', level: lvl, remaining: days, total: days });
      return true;
    }

    /* ---------------- 建筑建造 ---------------- */
    buildingCost(buildingId, faction) {
      const cfg = SW.BuildingConfig[buildingId];
      const mult = faction ? faction.m('shipCost') : 1;
      return {
        metal: Math.round((cfg.cost.metal || 0) * mult),
        darkMatter: Math.round((cfg.cost.darkMatter || 0) * mult),
        materials: Math.round((cfg.cost.materials || 0) * mult)
      };
    }
    queueBuilding(star, buildingId, faction) {
      if (!star.canBuild(buildingId)) return false;
      const cost = this.buildingCost(buildingId, faction);
      if (!faction.canAfford(cost)) return false;
      faction.spend(cost);
      const cfg = SW.BuildingConfig[buildingId];
      const days = cfg.buildDays / faction.m('buildSpeed');
      star.queue.push({
        kind: 'building', id: buildingId,
        upgradeFrom: cfg.shipyard && cfg.shipyard.dedicated ? (cfg.shipyard.upgradeFrom || null) : null,
        remaining: days, total: days
      });
      return true;
    }

    /* ---------------- 每日推进 ---------------- */
    update(dt) {
      const game = this.game;
      const galaxy = game.galaxy;
      const ev = game.events;

      for (const star of galaxy.stars) {
        if (star.owner === null) continue;
        const faction = game.factions.get(star.owner);
        if (!faction) continue;

        /* 建造队列 */
        if (star.queue.length) {
          const q = star.queue[0];
          q.remaining -= dt;
          if (q.remaining <= 0) {
            star.queue.shift();
            if (q.kind === 'dev') {
              star.devLevel = U.clamp(star.devLevel + 1, 0, SW.GalaxyConfig.devLevel.max);
              ev.record(game, faction.name + '将「' + star.name + '」升级为' + star.devName + '。', 'build', { starId: star.id, factionId: faction.id });
            } else if (q.kind === 'building') {
              const cfg = SW.BuildingConfig[q.id];
              if (cfg && cfg.shipyard && cfg.shipyard.dedicated && cfg.shipyard.upgradeFrom) {
                /* 专用船坞升级占用原建筑位，完成时一次性替换全部旧专用船坞。 */
                for (let i = star.buildings.length - 1; i >= 0; i--) {
                  if (star.isDedicatedShipyard(star.buildings[i].id)) star.buildings.splice(i, 1);
                }
              }
              star.buildings.push({ id: q.id, hp: 100, maxHp: 100 });
              star.recomputeShipyardCache();
              /* 新建筑只扩大防御上限，当前损伤交给非围攻时的自然修复。 */
              this.recomputeDefense(star, faction, false);
            }
          }
        }

        /* 被围攻时防御设施无法自愈（否则永远打不下来） */
        const besieged = this._isBesieged(star);

        /* 防御设施自愈 */
        if (!besieged && star.defenseHp < star.defenseMaxHp) {
          star.defenseHp = Math.min(star.defenseMaxHp, star.defenseHp + star.defenseMaxHp * 0.02 * dt);
        }
        if (!besieged && star.starShieldMax > 0 && star.starShield < star.starShieldMax) {
          star.starShield = Math.min(star.starShieldMax, star.starShield + star.starShieldMax * 0.05 * dt);
        }
        /* 被摧毁建筑缓慢修复 */
        for (const b of star.buildings) {
          if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + 8 * dt);
        }
      }

      /* 资源入账 */
      for (const f of game.factions.list) {
        if (f.defeated) continue;
        for (const k of KEYS) f.addRes(k, f.income[k] * dt);
      }
    }

    /** 该星系是否有敌方舰队压境 */
    _isBesieged(star) {
      const idx = this.game.combat.starFleets[star.id];
      if (!idx) return false;
      for (const f of idx) {
        if (f.factionId === star.owner) continue;
        const a = this.game.factions.get(f.factionId);
        const b = star.owner ? this.game.factions.get(star.owner) : null;
        if (!b) return true;             // 中立星系被武装舰队进入
        if (a && (a.isEnemy(b.id) || b.isEnemy(a.id))) return true;
      }
      return false;
    }

    /** 每隔一段时间重算收入（避免每步都算） */
    periodicRecompute() { this.recomputeAll(); }
  }

  SW.EconomySystem = EconomySystem;
})(window.SW);
