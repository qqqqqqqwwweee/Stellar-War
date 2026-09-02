/* ===========================================================
 *  CombatSystem —— 自动战斗
 *  战略层：舰队整体行动；战术层：进入战斗后按「堆叠单位」运行轻量舰船 AI
 *  目标优先级：按舰船角色与武器类型选择目标（鱼雷打大舰、驱逐拦截小舰等）
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const CFG = () => SW.CombatConfig;
  const W = () => SW.WeaponConfig;

  let BATTLE_SEQ = 1;

  /** 舰体大小分类 */
  function sizeClass(size) {
    if (size <= SW.SizeClass.small.max) return 'small';
    if (size <= SW.SizeClass.medium.max) return 'medium';
    if (size <= SW.SizeClass.large.max) return 'large';
    return 'capital';
  }

  class Battle {
    constructor(id, starId) {
      this.id = id;
      this.starId = starId;
      this.day = 0;
      this.sides = {};      // factionId -> { factionId, fleets: [], power: 0, pd: 0 }
      this.intensity = 0;
      this.lastShotAt = 0;
      this.notified = false;
      this.peakPower = 0;
      this.effectsEnabled = true;
    }
  }

  class CombatSystem {
    constructor(game) {
      this.game = game;
      this.battles = [];
      this.byStar = {};      // starId -> Battle
      this.starFleets = {};  // starId -> Fleet[]（每步重建的索引，避免 O(star×fleet) 扫描）
      this._acc = 0;
      this._scanAcc = 0;
      this.shotBudget = 0;
      this.stats = { battles: 0, shipsDestroyed: 0 };
    }

    _isStationaryFleet(fleet, starId) {
      return !!(fleet && starId && !fleet.isEmpty() && fleet.starId === starId && !fleet.move);
    }

    _isFleetInBattle(battle, fleet) {
      if (!battle || !this._isStationaryFleet(fleet, battle.starId)) return false;
      for (const key in battle.sides) {
        const side = battle.sides[key];
        if (side && side.fleets && side.fleets.indexOf(fleet) >= 0) return true;
      }
      return false;
    }

    _isHostileFaction(aId, bId) {
      if (!aId || !bId || aId === bId) return false;
      const a = this.game.factions.get(aId);
      const b = this.game.factions.get(bId);
      return !!(a && b && (a.isEnemy(b.id) || b.isEnemy(a.id)));
    }

    _starDefensePower(star) {
      if (!star || star.defenseHp <= 0) return 0;
      return star.defenseHp * 0.30 + (star.defenseDamage || 0) * 3.5;
    }

    /** 抵达瞬间重新评估，弱势远征军先撤退，不让扫描创建一场必死战斗。 */
    _screenUnderstrengthAttacks(index) {
      let changed = false;
      const ratio = Math.max(1, Number(CFG().arrivalForceRatio) || 1.18);
      for (const starId in index) {
        const star = this.game.galaxy.get(starId);
        if (!star) continue;
        const groups = {};
        for (const fleet of index[starId]) (groups[fleet.factionId] = groups[fleet.factionId] || []).push(fleet);
        for (const factionId in groups) {
          const attackers = groups[factionId].filter(f => f.mission === 'attack');
          if (!attackers.length) continue;
          const ownPower = groups[factionId].reduce((sum, f) => sum + f.power, 0);
          let enemyPower = 0;
          for (const otherId in groups) {
            if (this._isHostileFaction(factionId, otherId)) {
              enemyPower += groups[otherId].reduce((sum, f) => sum + f.power, 0);
            }
          }
          if (star.owner !== factionId && this._isHostileFaction(factionId, star.owner)) enemyPower += this._starDefensePower(star);
          if (enemyPower <= 0 || ownPower >= enemyPower * ratio) continue;

          for (const fleet of attackers) {
            const dest = this._retreatDestination(fleet);
            fleet.attackTargetStarId = null;
            fleet.rallyStarId = null;
            fleet.attackPlanDay = -1;
            fleet.cooldown = Math.max(fleet.cooldown || 0, 24);
            if (dest && dest !== star.id && this.game.fleets.orderMove(fleet, dest, 'retreat')) {
              changed = true;
            } else {
              /* 没有可用航道时至少解除进攻状态，下一次扫描不会把它当成远征军。 */
              fleet.mission = 'retreat';
            }
          }
        }
      }
      return changed;
    }

    /** 重建「星系 -> 停靠舰队」索引（O(舰队数)，非常廉价） */
    rebuildIndex() {
      const idx = {};
      for (const f of this.game.fleets.fleets) {
        if (!this._isStationaryFleet(f, f.starId)) continue;
        (idx[f.starId] = idx[f.starId] || []).push(f);
      }
      this.starFleets = idx;
      return idx;
    }

    /* ---------------- 战斗检测 ---------------- */
    scan() {
      const game = this.game;
      let idx = this.rebuildIndex();
      if (this._screenUnderstrengthAttacks(idx)) idx = this.rebuildIndex();
      const groups = {};   // starId -> {factionId -> [fleets]}
      for (const starId in idx) {
        const list = idx[starId];
        const g = {};
        for (const f of list) (g[f.factionId] = g[f.factionId] || []).push(f);
        groups[starId] = g;
      }

      for (const starId in groups) {
        const star = game.galaxy.get(starId);
        if (!star) continue;
        const factionIds = Object.keys(groups[starId]);
        /* 判断是否存在互相敌对的两方（含星系防御方） */
        let hostile = false;
        for (let i = 0; i < factionIds.length && !hostile; i++) {
          for (let j = i + 1; j < factionIds.length; j++) {
            const a = game.factions.get(factionIds[i]);
            const b = game.factions.get(factionIds[j]);
            if (a && b && (a.isEnemy(b.id) || b.isEnemy(a.id))) { hostile = true; break; }
          }
        }
        /* 无对手但星系有防御 -> 攻城战 */
        if (!hostile && star.owner !== null && star.defenseHp > 0 && factionIds.length) {
          for (const fid of factionIds) {
            const f = game.factions.get(fid);
            const owner = game.factions.get(star.owner);
            if (f && owner && (f.isEnemy(star.owner) || owner.isEnemy(fid))) { hostile = true; break; }
          }
        }
        if (hostile) this._ensureBattle(starId, groups[starId], star);
      }

      /* 清理已结束的战斗 */
      for (let i = this.battles.length - 1; i >= 0; i--) {
        const b = this.battles[i];
        const star = game.galaxy.get(b.starId);
        const g = groups[b.starId] || {};
        for (const key of Object.keys(b.sides)) {
          if (key !== '__defense' && (!g[key] || !g[key].some(f => this._isStationaryFleet(f, b.starId)))) delete b.sides[key];
        }
        const ids = Object.keys(b.sides);
        const hasFleetSide = ids.some(key => key !== '__defense');
        if (!star || !hasFleetSide || (ids.length < 2 && star.defenseHp <= 0)) { this._endBattle(b); continue; }
        // 重新校验敌对关系
        let still = false;
        for (let x = 0; x < ids.length && !still; x++) {
          for (let y = x + 1; y < ids.length; y++) {
            if (ids[y] === '__defense') continue;
            const a = game.factions.get(ids[x]); const b2 = game.factions.get(ids[y]);
            if (ids[x] === '__defense') { still = true; break; }
            if (a && b2 && (a.isEnemy(b2.id) || b2.isEnemy(a.id))) { still = true; break; }
          }
        }
        if (!still) this._endBattle(b);
      }
    }

    _ensureBattle(starId, group, star) {
      let b = this.byStar[starId];
      if (!b) {
        b = new Battle('B' + (BATTLE_SEQ++), starId);
        this.battles.push(b);
        this.byStar[starId] = b;
        this.stats.battles++;
        if (!b.notified) {
          b.notified = true;
          const ids = Object.keys(group);
          const f0 = this.game.factions.get(ids[0]);
          const f1 = this.game.factions.get(ids[1]);
          const names = ids.map(i => { const f = this.game.factions.get(i); return f ? f.name : '未知'; }).join(' 对 ');
          this.game.events.record(this.game, '【战争】' + names + '在「' + star.name + '」爆发战斗。', 'war', { starId: starId, priority: 2 });
          this.game.events.emit('battleStart', { battle: b, starId: starId, priority: 2 });
          if (f0 && f0.stats.firstBattleDay < 0) f0.stats.firstBattleDay = this.game.time.day;
          if (f1 && f1.stats.firstBattleDay < 0) f1.stats.firstBattleDay = this.game.time.day;
        }
      }
      /* 重建 sides */
      b.sides = {};
      for (const fid in group) {
        b.sides[fid] = { factionId: fid, fleets: group[fid], power: 0, pd: 0 };
      }
      if (star.owner !== null && star.defenseHp > 0) {
        b.sides['__defense'] = { factionId: '__defense', fleets: [], power: 0, pd: 0, isStarDefense: true, ownerId: star.owner };
      }
      this._recalcSides(b, star);
      b.peakPower = Math.max(b.peakPower, this._totalPower(b));
      return b;
    }

    _recalcSides(b, star) {
      for (const key in b.sides) {
        const s = b.sides[key];
        if (s.isStarDefense) {
          s.power = (star.defenseDamage || 0) * 3 + star.defenseHp * 0.25;
          s.pd = 0;
          continue;
        }
        let p = 0, pd = 0;
        for (const f of s.fleets) {
          if (!this._isStationaryFleet(f, b.starId)) continue;
          p += f.power;
          pd += this._fleetPD(f);
        }
        s.power = p;
        s.pd = pd;
      }
    }

    _fleetPD(fleet) {
      let pd = 0;
      const faction = this.game.factions.get(fleet.factionId);
      const mult = faction ? (1 + (faction.mods.pd || 0)) : 1;
      for (const u of fleet.units) {
        const cfg = SW.ShipConfig[u.shipId];
        const eff = u.maxHp > 0 ? U.clamp(u.hp / (u.count * u.maxHp), 0, 1) : 1;
        for (const w of cfg.weapons) {
          const wc = W()[w.type];
          if (wc && wc.pd === 2) pd += w.count * w.damage * w.rate * 0.02 * u.count * eff;
        }
      }
      return pd * mult;
    }

    _totalPower(b) {
      let t = 0;
      for (const k in b.sides) t += b.sides[k].power;
      return t;
    }

    _endBattle(b) {
      U.remove(this.battles, b);
      if (this.byStar[b.starId] === b) delete this.byStar[b.starId];
      this.game.events.emit('battleEnd', { battle: b, starId: b.starId });
    }

    /* ---------------- 主循环 ---------------- */
    update(dt) {
      const game = this.game;
      const tickDays = SW.GalaxyConfig.time.combatTickDays;
      const SI = SW.AIConfig.systemIntervals;
      this._acc += dt;
      /* 特效预算按现实秒补充，而不是按银河天补充；16x 也不能把屏幕打成弹幕。 */
      const speed = Math.max(1, Number(game.time && game.time.speed) || 1);
      const realSeconds = dt / Math.max(0.001, (SW.GalaxyConfig.time.daysPerRealSecond || 1) * speed);
      const maxShots = Math.max(1, Number(CFG().maxVisualShotsPerSecond) || 10);
      const burst = Math.max(1, Number(CFG().visualBurst) || 4);
      this.shotBudget = Math.min(maxShots * burst, this.shotBudget + realSeconds * maxShots);

      /* 索引每步重建；战斗检测按节流间隔执行 */
      this.rebuildIndex();
      this._scanAcc += dt;
      if (this._scanAcc >= SI.combatScan) { this._scanAcc = 0; this.scan(); }

      let guard = 0;
      while (this._acc >= tickDays && guard < 40) {
        this._acc -= tickDays;
        guard++;
        for (let i = this.battles.length - 1; i >= 0; i--) {
          this._tick(this.battles[i], tickDays);
        }
      }

      /* 占领进度：只处理有舰队停靠的星系 */
      for (const starId in this.starFleets) {
        const star = game.galaxy.get(starId);
        if (star) this._updateCapture(star, dt);
      }
    }

    _updateCapture(star, dt) {
      const game = this.game;
      if (star.owner === null) star.defenseMaxHp = 0;
      const fleets = this.starFleets[star.id];
      if (!fleets || !fleets.length) { star.capture = null; return; }

      /* 找出对该星系有占领意图的势力（敌方） */
      let captor = null, captorPower = 0;
      for (const f of fleets) {
        if (f.factionId === star.owner) continue;
        if (star.owner !== null) {
          const fo = game.factions.get(f.factionId);
          const ow = game.factions.get(star.owner);
          if (fo && ow && !fo.isEnemy(ow.id) && !ow.isEnemy(fo.id)) continue;
        }
        if (f.power > captorPower) { captorPower = f.power; captor = f.factionId; }
      }
      if (!captor) { star.capture = null; return; }

      /* 敌方防御力量是否已清除 */
      const blockers = fleets.filter(f => f.factionId === star.owner || (star.owner !== null && f.factionId !== captor));
      const hostileBlockers = blockers.filter(f => {
        if (f.factionId === star.owner) return true;
        const a = game.factions.get(f.factionId); const b = game.factions.get(captor);
        return a && b && (a.isEnemy(b) || b.isEnemy(a));
      });
      const defenseAlive = star.owner !== null && star.defenseHp > 0;
      if (hostileBlockers.length || defenseAlive) {
        if (star.capture && star.capture.factionId !== captor) star.capture = null;
        return;
      }

      const cap = SW.GalaxyConfig.capture;
      const total = cap.baseDays + star.devLevel * cap.perDevLevel;
      if (!star.capture || star.capture.factionId !== captor) {
        star.capture = { factionId: captor, progress: 0, total: total };
      } else {
        star.capture.total = total;
      }
      star.capture.progress += dt;
      if (star.capture.progress >= star.capture.total) {
        this._capture(star, captor);
      }
    }

    _capture(star, factionId) {
      const game = this.game;
      const prev = star.owner;
      const faction = game.factions.get(factionId);
      star.capture = null;
      star.owner = factionId;
      star.explored[factionId] = true;
      for (const nId of star.links) game.galaxy.get(nId).explored[factionId] = true;

      /* 占领后的破坏：随机摧毁 0~2 个建筑，开发等级可能下降 */
      let destroyed = 0;
      const rng = game.rng;
      if (star.buildings.length && rng.chance(0.55)) {
        const n = rng.chance(0.25) ? 2 : 1;
        for (let i = 0; i < n && star.buildings.length; i++) {
          star.buildings.pop(); destroyed++;
        }
      }
      if (!star.isHome && rng.chance(0.30) && star.devLevel > 1) star.devLevel--;
      star.recomputeShipyardCache();
      /* 新占领的防御体系按新统治者的标准重新部署并填满。 */
      game.economy.recomputeDefense(star, faction, true);
      game.economy.recomputeAll();
      game.galaxy.invalidateDistanceCache();

      if (faction) faction.stats.starsTaken++;
      const prevF = prev ? game.factions.get(prev) : null;
      if (prevF) prevF.stats.starsLost++;

      /* 占领完成：停留在此的所有舰队都要重新评估任务。
       * 若不清理，被第三方抢先占领时其它势力的舰队会永久卡在 attack 状态，
       * 占满扩张队列名额，导致整个银河的扩张彻底停摆。 */
      for (const f of game.fleets.fleetsAt(star.id)) {
        f.mission = 'idle';
        f.targetStarId = null;
        f.stuckDays = 0;
      }

      const isCapital = star.isHome;
      const msg = prevF
        ? (isCapital
          ? '【银河事件】' + faction.name + '攻陷了' + prevF.name + '的母星系「' + star.name + '」！'
          : faction.name + '占领了' + (prevF ? prevF.name + '的' : '') + '星系「' + star.name + '」。')
        : faction.name + '殖民了星系「' + star.name + '」。';
      game.events.record(game, msg, isCapital ? 'capital' : 'war', { starId: star.id, factionId: factionId, priority: isCapital ? 4 : 1 });
      if (isCapital) {
        game.events.notify('【银河事件】' + prevF.name + '首都「' + star.name + '」陷落！', 'capital', { starId: star.id, x: star.x, y: star.y, priority: 4 });
        game.events.emit('capitalFallen', { star: star, factionId: factionId, loserId: prev, priority: 4 });
      }
      game.events.emit('starCaptured', { star: star, factionId: factionId, prevOwner: prev, priority: isCapital ? 4 : 1 });

      /* 母星陷落后重新指定首都 */
      if (isCapital && prevF && !prevF.defeated) {
        const others = game.galaxy.starsOf(prevF.id);
        if (others.length) {
          const best = U.max(others, s => s.devLevel * 10 + s.strategicValue);
          if (best) { star.isHome = false; star.homeOf = null; best.isHome = true; best.homeOf = prevF.id; prevF.homeStarId = best.id; }
        }
      }
    }

    /* ---------------- 单个战斗 tick ---------------- */
    _pruneBattleSides(b) {
      for (const key of Object.keys(b.sides)) {
        const side = b.sides[key];
        if (!side || side.isStarDefense) continue;
        side.fleets = (side.fleets || []).filter(f => this._isStationaryFleet(f, b.starId));
        if (!side.fleets.length) delete b.sides[key];
      }
    }

    _tick(b, tickDays) {
      const game = this.game;
      const star = game.galaxy.get(b.starId);
      if (!star || this.byStar[b.starId] !== b) { this._endBattle(b); return; }
      this._pruneBattleSides(b);
      b.day += tickDays;
      if (b.day > CFG().maxBattleDays) { this._endBattle(b); return; }

      const keys = Object.keys(b.sides);
      if (keys.length < 2) { this._endBattle(b); return; }

      this._recalcSides(b, star);
      b.intensity = this._totalPower(b);

      /* 每方选择目标：敌对且战力最高的一方 */
      const targets = {};
      for (const k of keys) {
        let best = null, bestP = -1;
        for (const o of keys) {
          if (o === k) continue;
          if (k !== '__defense' && o !== '__defense') {
            const a = game.factions.get(k); const bb = game.factions.get(o);
            if (!a || !bb || !(a.isEnemy(bb.id) || bb.isEnemy(a.id))) continue;
          }
          // 星系防御与来犯者天然敌对
          const p = b.sides[o].power;
          if (p > bestP) { bestP = p; best = o; }
        }
        targets[k] = best;
      }

      /* 交火 */
      for (const k of keys) {
        const t = targets[k];
        if (!t) continue;
        const side = b.sides[k];
        const enemy = b.sides[t];
        if (side.isStarDefense) {
          this._starDefenseShoot(b, star, side, enemy, tickDays, t);
        } else {
          this._fleetShoot(b, star, side, enemy, tickDays, t);
        }
      }

      /* 护盾回充 */
      for (const k of keys) {
        if (k === '__defense') {
          if (star.starShieldMax > 0) star.starShield = Math.min(star.starShieldMax, star.starShield + star.starShieldMax * 0.02 * tickDays);
          continue;
        }
        for (const f of b.sides[k].fleets) {
          for (const u of f.units) {
            if (u.shield < u.maxShield * u.count) {
              u.shield = Math.min(u.maxShield * u.count, u.shield + u.maxShield * u.count * CFG().shieldRegenPerDay * tickDays);
            }
          }
        }
      }

      /* 清理死亡单位 */
      for (const k of keys) {
        if (k === '__defense') continue;
        for (const f of b.sides[k].fleets) {
          this._cleanupDead(f, k);
        }
      }

      /* 撤退判定 */
      this._retreatCheck(b, star);
    }

    _emitShot(b, star, weapon, scale, sourceFleet, targetFleet, fromStar) {
      if (!b || !star || b.starId !== star.id || this.byStar[star.id] !== b) return false;
      if (fromStar) {
        if (!this._isFleetInBattle(b, targetFleet)) return false;
      } else {
        if (!this._isFleetInBattle(b, sourceFleet)) return false;
        if (targetFleet && !this._isFleetInBattle(b, targetFleet)) return false;
      }
      if (this.shotBudget < 1) return false;
      const wc = W()[weapon];
      if (!wc) return false;
      this.shotBudget -= 1;
      this.game.events.emit('combatShot', {
        battleId: b.id, starId: star.id, weapon: weapon, color: wc.color,
        sourceFleetId: sourceFleet ? sourceFleet.id : null,
        targetFleetId: targetFleet ? targetFleet.id : null,
        scale: U.clamp(scale || 1, 0.25, 3), fromStar: !!fromStar
      });
      return true;
    }

    _fleetShoot(b, star, side, enemy, tickDays, enemyKey) {
      const game = this.game;
      const faction = game.factions.get(side.factionId);
      const enemyIsStar = enemy.isStarDefense;
      const enemyFaction = enemyIsStar ? game.factions.get(enemy.ownerId) : game.factions.get(enemy.factionId);

      for (const fleet of side.fleets) {
        if (!this._isFleetInBattle(b, fleet)) continue;
        for (const u of fleet.units) {
          if (u.count <= 0) continue;
          const cfg = SW.ShipConfig[u.shipId];
          const aliveFrac = U.clamp(u.hp / (u.count * u.maxHp), 0, 1);
          const effCount = u.count * aliveFrac;
          if (effCount <= 0.01) continue;

          for (const w of cfg.weapons) {
            const wc = W()[w.type];
            if (!wc) continue;
            if (wc.pd === 2) continue;    // 纯防御武器不参与输出

            let raw = effCount * w.count * w.damage * w.rate * tickDays * (CFG().battleDamageMultiplier || 1);
            raw *= faction ? (faction.weaponMult(w.type) * faction.shipMod(u.shipId, 'damage') * faction.m('shipDamage')) : 1;

            /* 目标选择：优先符合武器尺寸偏好 */
            let target = null;
            if (enemyIsStar) {
              target = star;
            } else {
              target = this._pickTarget(enemy.fleets, wc, w.type);
            }
            if (!target) continue;

            if (enemyIsStar) {
              const damaged = this._damageStar(b, star, raw, w.type, enemyFaction, enemy.pd, fleet);
              if (!damaged) continue;
            } else {
              /* 入侵舰队即使正在清剿守军，也会分出一部分火力压制星系防御，
               * 否则防御设施只能等敌方舰队全灭后才会受到任何伤害。 */
              const siegeRatio = star.owner !== null && star.owner !== side.factionId && star.defenseHp > 0
                ? U.clamp(CFG().siegeFireRatio || 0, 0, 0.9)
                : 0;
              if (siegeRatio > 0) {
                this._damageStar(b, star, raw * siegeRatio, w.type,
                  game.factions.get(star.owner), 0, fleet);
              }
              const fleetRaw = raw * (1 - siegeRatio);
              if (fleetRaw > 0 && !this._damageUnit(b, star, target, fleetRaw, w.type, enemy.pd, fleet, u)) continue;
            }

            /* 视觉特效（节流） */
            if (game.rng.next() < 0.65) this._emitShot(b, star, w.type, raw / 60, fleet, target && target.fleet, false);
          }
        }
      }
    }

    _starDefenseShoot(b, star, side, enemy, tickDays, enemyKey) {
      if (star.defenseHp <= 0) return;
      const dps = (star.defenseDamage || 0);
      if (dps <= 0) return;
      /* 防御设施对一个「目标单位」集中开火（系数可调，避免星系炮台秒杀整个舰队） */
      const raw = dps * tickDays * 1.6 * (CFG().battleDamageMultiplier || 1);
      const target = this._pickTarget(enemy.fleets, null, 'railgun');
      if (!target || !this._isFleetInBattle(b, target.fleet)) return;
      if (!this._damageUnit(b, star, target, raw, 'railgun', enemy.pd, null, null)) return;
      if (this.game.rng.next() < 0.55) this._emitShot(b, star, 'railgun', 1.2, null, target.fleet, true);
    }

    /** 选择目标单位：返回 {fleet, unit} */
    _pickTarget(enemyFleets, weaponCfg, weaponType) {
      let best = null, bestScore = -Infinity;
      for (const f of enemyFleets) {
        if (!f || !f.starId || f.move || f.isEmpty()) continue;
        for (const u of f.units) {
          if (u.count <= 0 || u.hp <= 0) continue;
          const cfg = SW.ShipConfig[u.shipId];
          const eff = u.hp / (u.count * u.maxHp);
          let score = cfg.power * u.count * (0.4 + 0.6 * eff);

          if (weaponCfg) {
            const p = weaponCfg.sizePref;
            const sc = sizeClass(cfg.size);
            // 武器偏好：在尺寸区间内则加成
            if (cfg.size >= p[0] && cfg.size <= p[1]) score *= 1.8;
            if (weaponType === 'torpedo') {
              if (sc === 'capital') score *= 3.0;
              else if (sc === 'large') score *= 2.2;
              else if (sc === 'small') score *= 0.18;
            }
            if (weaponType === 'superWeapon') {
              if (sc === 'large' || sc === 'capital') score *= 2.0;
              else score *= 0.5;
            }
            if (weaponType === 'fighter' || weaponType === 'ion') {
              if (sc === 'small') score *= 1.4;
            }
          }
          score *= (0.8 + 0.4 * this.game.rng.next());
          if (score > bestScore) { bestScore = score; best = { fleet: f, unit: u }; }
        }
      }
      return best;
    }

    /** 对堆叠单位造成伤害 */
    _damageUnit(b, star, target, raw, weaponType, enemyPD, srcFleet, srcUnit) {
      if (!b || !star || b.starId !== star.id || !target || !target.fleet || !target.unit) return false;
      if (!this._isFleetInBattle(b, target.fleet)) return false;
      if (target.fleet.units.indexOf(target.unit) < 0) return false;
      if (srcFleet && !this._isFleetInBattle(b, srcFleet)) return false;
      const wc = W()[weaponType] || W().laser;
      let dmg = raw;

      /* 点防御拦截 */
      if (wc.pd === 1 && enemyPD > 0) {
        const intercept = U.clamp(enemyPD * CFG().pdEfficiency, 0, 0.85);
        dmg *= (1 - intercept);
      }

      const u = target.unit;
      const faction = this.game.factions.get(target.fleet.factionId);
      const armorMod = faction ? faction.m('shipArmor') * faction.shipMod(u.shipId, 'armor') : 1;

      let remain = dmg;
      let shieldDamage = 0;
      let hullDamage = 0;
      /* 护盾阶段 */
      if (u.shield > 0) {
        const loss = Math.min(u.shield, remain * wc.vsShield);
        u.shield -= loss;
        shieldDamage = loss;
        remain -= loss / wc.vsShield;
      }
      /* 装甲/结构阶段 */
      if (remain > 0) {
        const armor = (SW.ShipConfig[u.shipId].armor) * armorMod;
        const red = armor / (armor + CFG().armorK);
        const hull = remain * (1 - red) * wc.vsArmor;
        u.hp -= hull;
        hullDamage = hull;
        if (wc.pd !== 2 && this.game.rng.next() < 0.05) {
          // 少量视觉反馈
        }
      }

      /* 超级主炮溅射 */
      if (weaponType === 'superWeapon') {
        const splash = raw * CFG().superWeaponSplash;
        for (const f of this._enemyFleetsOf(target.fleet, b)) {
          for (const uu of f.units) {
            if (uu === u) continue;
            uu.hp -= splash * 0.25;
          }
        }
      }

      this.game.events.emit('combatHit', {
        battleId: b.id, starId: star.id, weapon: weaponType,
        sourceFleetId: srcFleet ? srcFleet.id : null,
        targetFleetId: target.fleet.id, shieldDamage: shieldDamage, hullDamage: hullDamage
      });

      if (u.hp <= 0) {
        this._destroyUnit(target.fleet, u, b);
      }
      return true;
    }

    _enemyFleetsOf(fleet, battle) {
      const out = [];
      for (const f of this.game.fleets.fleets) {
        if (f.starId !== fleet.starId || f.factionId === fleet.factionId || f.move || f.isEmpty()) continue;
        if (battle && !this._isFleetInBattle(battle, f)) continue;
        out.push(f);
      }
      return out;
    }

    _destroyUnit(fleet, u, battle) {
      const game = this.game;
      const faction = game.factions.get(fleet.factionId);
      const wasCapital = SW.ShipConfig[u.shipId].capital;
      const name = u.name;
      const lost = u.count;
      U.remove(fleet.units, u);
      fleet.recomputePower();
      if (faction) faction.stats.shipsLost += lost;
      this.stats.shipsDestroyed += lost;
      /* 击杀统计给攻击者（粗略：给战场上所有敌方） */
      for (const f of this._enemyFleetsOf(fleet, battle)) {
        const ef = game.factions.get(f.factionId);
        if (ef) ef.stats.shipsKilled += lost;
        break;
      }
      if (wasCapital) {
        const txt = u.shipId === 'flagship'
          ? '【银河事件】' + faction.name + '的超级旗舰「' + name + '」在「' + (game.galaxy.get(fleet.starId) || {}).name + '」被击毁！'
          : (u.shipId === 'titan'
            ? '【银河事件】' + faction.name + '的泰坦「' + name + '」被击毁！'
            : faction.name + '的航母「' + name + '」被击毁。');
        game.events.record(game, txt, u.shipId === 'flagship' ? 'flagship' : 'capital', { starId: fleet.starId, factionId: fleet.factionId, priority: u.shipId === 'flagship' ? 5 : 4 });
        game.events.notify(txt, u.shipId === 'flagship' ? 'flagship' : 'capital', { starId: fleet.starId, x: (game.galaxy.get(fleet.starId) || {}).x, y: (game.galaxy.get(fleet.starId) || {}).y, priority: u.shipId === 'flagship' ? 5 : 4 });
        game.events.emit('capitalDestroyed', { fleet: fleet, shipId: u.shipId, name: name, factionId: fleet.factionId, starId: fleet.starId, priority: 4 });
        if (u.shipId === 'titan') faction.stats.titansLost++;
        if (u.shipId === 'flagship') faction.stats.flagshipLost++;
      }
      game.events.emit('explosion', { starId: fleet.starId, fleetId: fleet.id, scale: wasCapital ? 3 : 1 });
    }

    /** 对星系防御造成伤害 */
    _damageStar(b, star, raw, weaponType, ownerFaction, pd, srcFleet) {
      if (!b || !star || b.starId !== star.id || this.byStar[star.id] !== b) return false;
      if (srcFleet && !this._isFleetInBattle(b, srcFleet)) return false;
      if (!Number.isFinite(raw) || raw <= 0) return false;
      const wc = W()[weaponType] || W().laser;
      let dmg = raw;
      const armorMod = ownerFaction ? ownerFaction.m('defense') : 1;
      let remain = dmg;
      if (star.starShield > 0) {
        const loss = Math.min(star.starShield, remain * wc.vsShield);
        star.starShield -= loss;
        remain -= loss / wc.vsShield;
      }
      if (remain > 0) {
        const armor = 40 * armorMod;
        const red = armor / (armor + CFG().armorK);
        star.defenseHp -= remain * (1 - red) * wc.vsArmor;
      }
      if (star.defenseHp <= 0) {
        star.defenseHp = 0;
        const game = this.game;
        game.events.record(game, '「' + star.name + '」的防御体系被彻底摧毁。', 'war', { starId: star.id, priority: 2 });
        /* 摧毁一个建筑 */
        if (star.buildings.length) {
          const destroyed = game.buildings.damageBuildings(star, 9999);
          if (destroyed) {
            game.events.record(game, '「' + star.name + '」的' + SW.BuildingConfig[destroyed.id].name + '被摧毁。', 'war', { starId: star.id, priority: 1 });
          }
        }
        game.economy.recomputeDefense(star, ownerFaction, false);
      }
      return true;
    }

    _cleanupDead(fleet, factionKey) {
      for (let i = fleet.units.length - 1; i >= 0; i--) {
        const u = fleet.units[i];
        if (u.hp <= 0 || u.count <= 0) { this._destroyUnit(fleet, u); continue; }
        /* 部分损失：按剩余 HP 比例减少数量 */
        const newCount = Math.max(1, Math.ceil(u.hp / u.maxHp));
        if (newCount < u.count) {
          const lost = u.count - newCount;
          u.count = newCount;
          const faction = this.game.factions.get(fleet.factionId);
          if (faction) faction.stats.shipsLost += lost;
          this.stats.shipsDestroyed += lost;
        }
      }
      fleet.recomputePower();
    }

    _retreatCheck(b, star) {
      const game = this.game;
      const keys = Object.keys(b.sides).filter(k => k !== '__defense');
      if (keys.length < 2) return;
      for (const k of keys) {
        const side = b.sides[k];
        const faction = game.factions.get(k);
        if (!faction || faction.defeated) continue;
        let enemyP = 0;
        for (const o of keys) if (o !== k) enemyP += b.sides[o].power;
        if (b.sides['__defense']) enemyP += b.sides['__defense'].power * 0.5;
        const mine = side.power;
        const ratio = mine / Math.max(1, enemyP);
        if (ratio < CFG().retreatMorale && b.day > 3) {
          for (const f of side.fleets) {
            if (f.mission === 'retreat' || f.cooldown > 0) continue;
            /* 撤退到最近的己方星系 */
            const dest = this._retreatDestination(f);
            if (dest && dest !== star.id) {
              f.mission = 'retreat';
              f.cooldown = 40;
              game.fleets.orderMove(f, dest, 'retreat');
              game.events.record(game, faction.name + '的' + f.name + '从「' + star.name + '」撤退。', 'war', { starId: star.id, factionId: k, priority: 1 });
            }
          }
        }
      }
    }

    _retreatDestination(fleet) {
      const galaxy = this.game.galaxy;
      const mine = galaxy.starsOf(fleet.factionId);
      if (!mine.length) return null;
      const here = galaxy.get(fleet.starId);
      if (!here) return mine[0].id;
      let best = null, bd = Infinity;
      for (const s of mine) {
        if (s.id === fleet.starId) continue;
        const d = U.dist2(s.x, s.y, here.x, here.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best ? best.id : null;
    }

    serialize() {
      return { battles: this.battles.map(b => ({ id: b.id, starId: b.starId, day: b.day })), stats: this.stats };
    }
    deserialize(d) {
      if (!d) return;
      this.stats = d.stats || this.stats;
      this.battles = [];
      this.byStar = {};
      this.scan();
    }
  }

  SW.CombatSystem = CombatSystem;
  SW.Battle = Battle;
})(window.SW);
