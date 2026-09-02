/* ===========================================================
 *  MilitaryAI —— 舰队调度、防守、增援、进攻、撤退
 *  决策频率：aiConfig.intervals.military
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;
  const C = () => SW.AIConfig.military;

  class MilitaryAI {
    constructor(game) { this.game = game; }

    run(faction) {
      const game = this.game;
      if (faction.defeated) return;
      const galaxy = game.galaxy;
      const mine = galaxy.starsOf(faction.id);
      if (!mine.length) return;

      const myPower = game.fleets.fleetsOf(faction.id).reduce((a, f) => a + f.power, 0);
      faction.stats.peakPower = Math.max(faction.stats.peakPower, myPower);

      this._updateThreat(faction, myPower);

      /* 0) 解卡：清理无法继续执行任务的舰队（否则会占满扩张/进攻名额） */
      this._unstick(faction, mine);

      /* 1) 处理正在交战/被围攻的星系：增援 */
      this._reinforce(faction, mine);

      /* 2) 边境防守：保证要地有驻军 */
      this._garrison(faction, mine, myPower);

      /* 3) 进攻：有优势就打 */
      this._offense(faction, mine, myPower);

      /* 4) 闲置舰队回归前线/整编 */
      this._reorganize(faction, mine);
    }

    /**
     * 解卡：舰队可能因为目标星系被第三方抢先占领、或战力不足攻不下来
     * 而永久停在敌方星系上。这些"僵尸远征军"会占满扩张队列名额，
     * 使整个银河停止演化。这里定期清理它们。
     */
    _unstick(faction, mine) {
      const game = this.game;
      const tick = SW.AIConfig.intervals.military;
      for (const f of game.fleets.fleetsOf(faction.id)) {
        if (f.move) { f.stuckDays = 0; continue; }
        if (f.mission !== 'attack' && f.mission !== 'claim') { f.stuckDays = 0; continue; }

        const st = f.starId ? game.galaxy.get(f.starId) : null;
        if (!st) { f.mission = 'idle'; f.stuckDays = 0; continue; }

        /* 目标已经是自己的 / 目标归属一个并未交战的势力 -> 任务作废 */
        if (st.owner === faction.id) { this._release(f); continue; }
        if (st.owner !== null) {
          const owner = game.factions.get(st.owner);
          if (owner && !faction.isEnemy(owner.id) && !owner.isEnemy(faction.id)) { this._release(f); continue; }
        }

        /* 僵持过久：撤回整编 */
        f.stuckDays = (f.stuckDays || 0) + tick;
        if (f.stuckDays > 180) {
          const dest = this._nearestOwned(f, mine);
          if (dest && dest !== f.starId) {
            game.fleets.orderMove(f, dest, 'retreat');
            f.cooldown = 30;
          } else this._release(f);
        }
      }
    }

    _release(f) {
      f.mission = 'idle';
      f.targetStarId = null;
      f.rallyStarId = null;
      f.attackTargetStarId = null;
      f.attackPlanDay = -1;
      f.stuckDays = 0;
    }

    _nearestOwned(fleet, mine) {
      if (!mine.length) return null;
      const p = fleet.position(this.game.galaxy);
      let best = null, bd = Infinity;
      for (const s of mine) {
        const d = U.dist2(p.x, p.y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best ? best.id : null;
    }

    /* ---------------- 威胁评估 ---------------- */
    /**
     * 威胁只统计「靠近我方边境」的敌军。
     * 否则四方混战时所有人都会算出极高的威胁值并集体龟缩，银河陷入僵局。
     */
    _updateThreat(faction, myPower) {
      const game = this.game;
      const galaxy = game.galaxy;
      const mine = galaxy.starsOf(faction.id);
      const near = mine.length ? galaxy.hopsFrom(mine.map(s => s.id), 3) : {};

      let threat = 0;
      for (const f of game.fleets.fleets) {
        if (f.factionId === faction.id) continue;
        const o = game.factions.get(f.factionId);
        if (!o) continue;
        if (!faction.isEnemy(o.id) && !o.isEnemy(faction.id)) continue;
        const sid = f.starId || (f.move ? f.move.path[f.move.path.length - 1] : null);
        /* 边境附近的敌军全额计入，远处敌军只按 25% 折算为潜在威胁 */
        threat += f.power * (sid && near[sid] !== undefined ? 1 : 0.25);
      }
      /* 敌方超级旗舰 / 泰坦 提升威胁 */
      for (const o of game.factions.list) {
        if (o.id === faction.id || o.defeated) continue;
        if (!faction.isEnemy(o.id) && !o.isEnemy(faction.id)) continue;
        if (o.stats.flagshipBuilt > o.stats.flagshipLost) threat += 500 * C().superWeaponPanic;
        threat += (o.stats.titansBuilt - o.stats.titansLost) * 90;
      }
      faction.ai.threatLevel = myPower > 0 ? U.clamp(threat / Math.max(1, myPower), 0, 3) : 3;
      faction.ai.posture = this._posture(faction, myPower, threat);
    }

    _posture(faction, myPower, threat) {
      const ratio = threat > 0 ? myPower / threat : 3;
      const aggr = faction.cfg.ai.aggression;
      /* 攻击门槛随性格浮动：激进文明 0.6 倍即开打，保守文明需要 1.25 倍 */
      if (ratio > C().attackRatio * (1.3 - aggr)) return 'attack';
      if (ratio < C().defendRatio) return 'defend';
      return 'develop';
    }

    /* ---------------- 增援 ---------------- */
    _reinforce(faction, mine) {
      const game = this.game;
      const galaxy = game.galaxy;
      /* 被攻击的己方星系 */
      for (const s of mine) {
        const enemies = game.fleets.enemiesAt(s.id, faction.id);
        if (!enemies.length) continue;
        const enemyPower = enemies.reduce((a, f) => a + f.power, 0);
        const localPower = game.fleets.fleetsAt(s.id)
          .filter(f => f.factionId === faction.id)
          .reduce((a, f) => a + f.power, 0);
        const defPower = s.defenseHp * 0.5 + (s.defenseDamage || 0) * 6;
        if (localPower + defPower >= enemyPower * 1.1) continue;

        /* 从附近调兵 */
        const need = enemyPower * 1.25 - localPower - defPower;
        const hops = galaxy.hopsFrom([s.id], C().reinforceRadius);
        const donors = [];
        for (const id in hops) {
          if (id === s.id) continue;
          const st = galaxy.get(id);
          if (!st || st.owner !== faction.id) continue;
          for (const f of game.fleets.fleetsAt(id)) {
            if (f.factionId !== faction.id || f.move) continue;
            if (f.mission === 'defend' && st.isHome) continue;
            donors.push({ fleet: f, star: st, hops: hops[id] });
          }
        }
        donors.sort((a, b) => (a.hops - b.hops) || (b.fleet.power - a.fleet.power));
        let gathered = 0;
        for (const d of donors) {
          if (gathered >= need) break;
          const fl = d.fleet;
          if (fl.power < 5) continue;
          game.fleets.orderMove(fl, s.id, 'reinforce');
          gathered += fl.power;
        }
        if (gathered > 0) {
          game.events.record(game, faction.name + '向「' + s.name + '」紧急增援（战力 ' + Math.round(gathered) + '）。', 'war', { factionId: faction.id, starId: s.id, priority: 1 });
        }
      }
    }

    /* ---------------- 驻军 ---------------- */
    _garrison(faction, mine, myPower) {
      const game = this.game;
      const galaxy = game.galaxy;
      const borders = galaxy.borderStars(faction.id);
      const home = faction.homeStarId ? galaxy.get(faction.homeStarId) : null;

      /* 首都最低驻军 */
      if (home && home.owner === faction.id) {
        const local = game.fleets.fleetsAt(home.id).filter(f => f.factionId === faction.id).reduce((a, f) => a + f.power, 0);
        const want = myPower * C().capitalDefenseRatio * (0.5 + faction.cfg.ai.defenseFocus);
        if (local < want) this._requestDefense(faction, home, want - local);
      }

      /* 边境要地 */
      const important = mine
        .filter(s => s.isChoke || s.isHub || s.devLevel >= 3 || borders.some(b => b.links.indexOf(s.id) >= 0))
        .sort((a, b) => b.strategicValue - a.strategicValue)
        .slice(0, 6);

      for (const s of important) {
        const local = game.fleets.fleetsAt(s.id).filter(f => f.factionId === faction.id).reduce((a, f) => a + f.power, 0);
        const want = s.devLevel * C().garrisonPowerPerDev * (0.6 + faction.cfg.ai.defenseFocus) + (s.isChoke ? 25 : 0);
        if (local < want * 0.7) this._requestDefense(faction, s, want - local);
      }
    }

    _requestDefense(faction, star, amount) {
      const game = this.game;
      const galaxy = game.galaxy;
      const hops = galaxy.hopsFrom([star.id], 3);
      const donors = [];
      for (const id in hops) {
        if (id === star.id) continue;
        const st = galaxy.get(id);
        if (!st || st.owner !== faction.id) continue;
        for (const f of game.fleets.fleetsAt(id)) {
          if (f.factionId !== faction.id || f.move) continue;
          if (f.mission === 'claim') continue;
          donors.push({ fleet: f, hops: hops[id] });
        }
      }
      donors.sort((a, b) => (a.hops - b.hops) || (b.fleet.power - a.fleet.power));
      let got = 0;
      for (const d of donors) {
        if (got >= amount) break;
        if (d.fleet.power < 4) continue;
        game.fleets.orderMove(d.fleet, star.id, 'defend');
        got += d.fleet.power;
      }
      return got;
    }

    /* ---------------- 进攻 ---------------- */
    _offense(faction, mine, myPower) {
      const game = this.game;
      /* 龟缩状态不打；「发展」状态只要处于战争中也允许发动有限反击 */
      let atWar = false;
      for (const k in faction.atWar) if (faction.atWar[k]) atWar = true;
      if (faction.ai.posture === 'defend') return;
      if (faction.ai.posture === 'develop' && !atWar) return;
      if (myPower < C().minAttackPower) return;
      const galaxy = game.galaxy;
      this._cleanupAttackPlans(faction);

      /* 候选目标：敌方或中立的边境星系 */
      const borderSet = new Set();
      for (const s of mine) for (const n of s.links) borderSet.add(n);

      const maxTargetHops = Math.max(1, Number(C().remoteTargetHops) || 1);
      const hopMap = maxTargetHops > 1 && typeof galaxy.hopsFrom === 'function'
        ? galaxy.hopsFrom(mine.map(s => s.id), maxTargetHops) : {};
      const targets = [];
      const addTarget = (id, distance) => {
        const s = galaxy.get(id);
        if (!s || s.owner === faction.id) return;
        const owner = s.owner ? game.factions.get(s.owner) : null;
        const hostile = owner && (faction.isEnemy(owner.id) || owner.isEnemy(faction.id));
        if (owner && !hostile) return;
        const threat = this._targetAssessment(s, faction);
        const defense = threat.total;
        if (defense > myPower) return;
        const value = this._targetValue(s, faction, hostile, distance);
        targets.push({
          star: s, defense: defense, threat: threat, value: value,
          distance: distance, adjacent: distance <= 1,
          score: value / Math.max(1, defense)
        });
      };
      for (const id of borderSet) addTarget(id, 1);
      /* 没有可攻的边境目标时才考虑远处目标，且仍受航道跳数限制。 */
      if (!targets.length && maxTargetHops > 1) {
        for (const id in hopMap) {
          const distance = Number(hopMap[id]);
          if (distance > 1 && distance <= maxTargetHops) addTarget(id, distance);
        }
      }
      if (!targets.length) return;
      targets.sort((a, b) => b.score - a.score);

      const maxOffensives = 1 + Math.floor(faction.cfg.ai.aggression * 2.2);
      let launched = 0;
      for (const t of targets) {
        if (launched >= maxOffensives) break;
        const need = Math.max(C().minAttackPower, t.defense * (C().attackCommitRatio || C().attackRatio));
        /* 全局战力只是姿态指标；出击前还要证明扣除边境预留后确实凑得出这支舰队。 */
        if (myPower < need) continue;
        const fleet = this._launchAttack(faction, t.star, need);
        if (fleet) { launched++; break; }
        /* 已经建立集结计划就专注等待，不在同一轮再创建第二个小规模计划。 */
        if (this._attackPlanFleets(faction, t.star.id).length) break;
      }
    }

    _targetAssessment(star, faction) {
      const game = this.game;
      const ownerFaction = star.owner !== null ? game.factions.get(star.owner) : null;
      let staticDefense = 0;
      if (ownerFaction && (faction.isEnemy(ownerFaction.id) || ownerFaction.isEnemy(faction.id))) {
        staticDefense = star.defenseHp * 0.30 + (star.defenseDamage || 0) * 3.5;
      }
      let garrison = 0;
      for (const f of game.fleets.fleetsAt(star.id)) {
        if (f.factionId === faction.id || f.move) continue;
        const owner = game.factions.get(f.factionId);
        if (owner && (faction.isEnemy(owner.id) || owner.isEnemy(faction.id))) garrison += f.power;
      }
      let nearby = 0;
      /* 邻近同统治者星系的驻军会在真实战争中快速增援，不能只看当前星系。 */
      for (const nId of star.links) {
        const n = game.galaxy.get(nId);
        if (!n || n.owner === null || n.owner === faction.id) continue;
        if (n.owner !== star.owner) continue;
        for (const f of game.fleets.fleetsAt(nId)) {
          if (f.factionId === faction.id || f.move) continue;
          const owner = game.factions.get(f.factionId);
          if (owner && (faction.isEnemy(owner.id) || owner.isEnemy(faction.id))) nearby += f.power * 0.35;
        }
      }
      return { staticDefense: staticDefense, garrison: garrison, nearby: nearby, total: staticDefense + garrison + nearby };
    }

    _defenseOf(star, faction) {
      return this._targetAssessment(star, faction).total;
    }

    _targetValue(star, faction, hostile, distance) {
      const W = C().targetValueWeight;
      let v = 0;
      v += (star.base.metal * 0.6 + star.base.darkMatter * 1.6 + star.base.materials * 4.0 + star.base.research * 0.8) * W.resource * 0.3;
      if (star.isChoke) v += 40 * W.choke;
      if (star.isHub) v += 28 * W.hub;
      if (star.isHome) v += 120 * W.capital;
      v += star.devLevel * 8 * W.weakDefense;
      const hops = Number.isFinite(Number(distance)) ? Math.max(1, Number(distance)) : 1;
      const adjacentWeight = Number(W.adjacent) || 0;
      const hostileWeight = Number(W.hostile) || 0;
      const distanceWeight = Number(W.distance) || 0;
      if (hostile) v += 28 * hostileWeight;
      if (hops <= 1) v += 48 * adjacentWeight;
      else v -= (hops - 1) * 18 * distanceWeight;
      v += star.degree * 3;
      if (!hostile) v *= 1.15;   // 中立星系更容易拿
      return v;
    }

    _attackPlanFleets(faction, targetStarId) {
      return this.game.fleets.fleetsOf(faction.id).filter(f => f.attackTargetStarId === targetStarId &&
        (f.mission === 'rally' || f.mission === 'attack' || f.targetStarId === targetStarId));
    }

    _cleanupAttackPlans(faction) {
      const game = this.game;
      const now = game.time.day;
      const timeout = Math.max(1, Number(C().rallyTimeoutDays) || 180);
      for (const fleet of game.fleets.fleetsOf(faction.id)) {
        if (!fleet.attackTargetStarId) continue;
        const target = game.galaxy.get(fleet.attackTargetStarId);
        const owner = target && target.owner !== null ? game.factions.get(target.owner) : null;
        const expired = fleet.attackPlanDay >= 0 && now - fleet.attackPlanDay > timeout;
        const noLongerHostile = owner && owner.id !== faction.id && !faction.isEnemy(owner.id) && !owner.isEnemy(faction.id);
        if (!target || target.owner === faction.id || expired || noLongerHostile) this._release(fleet);
      }
    }

    _eligibleAttackFleet(fleet, targetStarId, stagingStarId) {
      if (!fleet || !fleet.starId || fleet.move) return false;
      if (fleet.mission === 'defend' || fleet.mission === 'retreat' || fleet.mission === 'reinforce' ||
        fleet.mission === 'attack' || fleet.mission === 'claim') return false;
      if (fleet.mission === 'rally') {
        return fleet.attackTargetStarId === targetStarId && (!stagingStarId || fleet.rallyStarId === stagingStarId);
      }
      return fleet.mission === 'idle';
    }

    _attackPotentialPower(faction, targetStarId) {
      const game = this.game;
      const mine = game.galaxy.starsOf(faction.id);
      const reserve = U.clamp(Number(C().postAttackReserveRatio != null ? C().postAttackReserveRatio : C().borderGuardRatio) || 0.35, 0, 0.8);
      let total = 0;
      for (const star of mine) {
        let planned = 0, idle = 0;
        for (const fleet of game.fleets.fleetsAt(star.id)) {
          if (fleet.factionId !== faction.id || fleet.move || fleet.isEmpty()) continue;
          if (fleet.mission === 'rally' && fleet.attackTargetStarId === targetStarId) planned += fleet.power;
          else if (this._eligibleAttackFleet(fleet, targetStarId)) idle += fleet.power;
        }
        total += planned + idle * (1 - reserve);
      }
      return total;
    }

    _pickAttackStagingStar(faction, star, need) {
      const game = this.game;
      const mine = game.galaxy.starsOf(faction.id);
      if (!mine.length) return null;
      const existing = this._attackPlanFleets(faction, star.id).find(f => f.rallyStarId);
      if (existing) {
        const planned = game.galaxy.get(existing.rallyStarId);
        if (planned && planned.owner === faction.id) return planned;
      }

      let best = null, bestScore = -Infinity;
      for (const candidate of mine) {
        if (!game.galaxy.path(candidate.id, star.id)) continue;
        const local = game.fleets.fleetsAt(candidate.id)
          .filter(f => this._eligibleAttackFleet(f, star.id, candidate.id))
          .reduce((sum, f) => sum + f.power, 0);
        const adjacent = candidate.links.indexOf(star.id) >= 0 ? 3 : 0;
        const distance = U.dist(candidate.x, candidate.y, star.x, star.y);
        const score = adjacent + Math.min(3, local / Math.max(1, need)) - distance * 0.001;
        if (score > bestScore) { bestScore = score; best = candidate; }
      }
      return best;
    }

    _markRally(fleet, target, staging, day) {
      fleet.mission = 'rally';
      fleet.rallyStarId = staging.id;
      fleet.attackTargetStarId = target.id;
      if (fleet.attackPlanDay < 0) fleet.attackPlanDay = day;
    }

    _rallyForAttack(faction, star, need, staging) {
      const game = this.game;
      const day = game.time.day;
      const reserve = U.clamp(Number(C().postAttackReserveRatio != null ? C().postAttackReserveRatio : C().borderGuardRatio) || 0.35, 0, 0.8);
      const stagingId = staging.id;
      const localCandidates = game.fleets.fleetsAt(stagingId)
        .filter(f => f.factionId === faction.id && this._eligibleAttackFleet(f, star.id, stagingId))
        .sort((a, b) => b.power - a.power);
      const localPower = localCandidates.reduce((sum, f) => sum + f.power, 0);
      const localQuota = localPower * (1 - reserve);
      let markedPower = 0;
      for (const fleet of localCandidates) {
        if (fleet.mission === 'rally' && fleet.attackTargetStarId === star.id) {
          markedPower += fleet.power;
          continue;
        }
        if (markedPower >= Math.min(need, localQuota)) break;
        this._markRally(fleet, star, staging, day);
        markedPower += fleet.power;
      }

      let stagedPower = game.fleets.fleetsAt(stagingId)
        .filter(f => f.factionId === faction.id && !f.move && f.mission === 'rally' &&
          f.attackTargetStarId === star.id && f.rallyStarId === stagingId)
        .reduce((sum, f) => sum + f.power, 0);
      let deficit = Math.max(0, need - stagedPower);
      const donors = game.galaxy.starsOf(faction.id)
        .filter(s => s.id !== stagingId)
        .map(sourceStar => {
          const candidates = game.fleets.fleetsAt(sourceStar.id)
            .filter(f => f.factionId === faction.id && this._eligibleAttackFleet(f, star.id, sourceStar.id))
            .sort((a, b) => b.power - a.power);
          return { star: sourceStar, candidates: candidates, remaining: candidates.reduce((sum, f) => sum + f.power, 0) * (1 - reserve) };
        })
        .filter(x => x.candidates.length && game.galaxy.path(x.star.id, stagingId))
        .sort((a, b) => U.dist(a.star.x, a.star.y, star.x, star.y) - U.dist(b.star.x, b.star.y, star.x, star.y));

      for (const donor of donors) {
        if (deficit <= 0) break;
        for (const source of donor.candidates.slice()) {
          if (deficit <= 0 || donor.remaining < 5) break;
          let candidate = source;
          if (candidate.power > donor.remaining + 0.01) {
            const ratio = U.clamp(donor.remaining / Math.max(1, candidate.power), 0.08, 0.88);
            candidate = game.fleets.split(source, ratio, 'rally');
            if (!candidate) continue;
          }
          this._markRally(candidate, star, staging, day);
          if (game.fleets.orderMove(candidate, stagingId, 'rally')) {
            deficit -= candidate.power;
            donor.remaining -= candidate.power;
          } else {
            this._release(candidate);
          }
        }
      }

      stagedPower = game.fleets.fleetsAt(stagingId)
        .filter(f => f.factionId === faction.id && !f.move && f.mission === 'rally' &&
          f.attackTargetStarId === star.id && f.rallyStarId === stagingId)
        .reduce((sum, f) => sum + f.power, 0);
      if (stagedPower < need) return null;

      const fleet = game.fleets.assemble(faction.id, stagingId, need, 'expedition', {
        filter: f => f.mission === 'rally' && f.attackTargetStarId === star.id && f.rallyStarId === stagingId
      });
      if (!fleet) return null;
      if (fleet.power < C().minAttackPower || fleet.power < need * 0.82) {
        this._markRally(fleet, star, staging, day);
        return null;
      }
      fleet.mission = 'attack';
      fleet.attackTargetStarId = star.id;
      fleet.rallyStarId = null;
      fleet.attackPlanDay = day;
      fleet.stuckDays = 0;
      if (!game.fleets.orderMove(fleet, star.id, 'attack')) {
        this._markRally(fleet, star, staging, day);
        return null;
      }
      /* 已经有足够兵力出击，释放尚未到达的同目标集结舰队，避免拆成多个小计划。 */
      for (const other of game.fleets.fleetsOf(faction.id)) {
        if (other !== fleet && other.attackTargetStarId === star.id && other.mission === 'rally') this._release(other);
      }
      game.events.record(game, faction.name + '集结' + fleet.name + '（战力 ' + Math.round(fleet.power) + '）向「' + star.name + '」发动进攻。', 'war', { factionId: faction.id, starId: star.id, priority: 2 });
      game.events.emit('offensiveLaunched', { faction: faction, star: star, fleet: fleet, priority: 2 });
      return fleet;
    }

    _launchAttack(faction, star, need) {
      const game = this.game;
      const mine = game.galaxy.starsOf(faction.id);
      if (!mine.length) return null;
      if (!star || need < C().minAttackPower) return null;
      const existing = this._attackPlanFleets(faction, star.id);
      if (existing.some(f => f.mission === 'attack')) return null;
      const potential = this._attackPotentialPower(faction, star.id);
      if (potential < need * 0.95) return null;
      const staging = this._pickAttackStagingStar(faction, star, need);
      if (!staging) return null;
      return this._rallyForAttack(faction, star, need, staging);
    }

    /* ---------------- 整编 ---------------- */
    _reorganize(faction, mine) {
      const game = this.game;
      /* 过大的驻扎舰队拆分成机动舰队 */
      for (const s of mine) {
        const fleets = game.fleets.fleetsAt(s.id).filter(f => f.factionId === faction.id && !f.move);
        const total = fleets.reduce((a, f) => a + f.power, 0);
        if (total > C().fleetMergePower && fleets.length < 3) {
          game.fleets.split(fleets[0], 0.45, 'main');
        }
      }
      /* 撤退舰队冷却结束后重新整编 */
      for (const f of game.fleets.fleetsOf(faction.id)) {
        if (f.mission === 'retreat' && f.cooldown <= 0 && !f.move) {
          f.mission = 'idle';
          f.targetStarId = null;
          f.rallyStarId = null;
          f.attackTargetStarId = null;
          f.attackPlanDay = -1;
        }
      }
    }
  }

  SW.MilitaryAI = MilitaryAI;
})(window.SW);
