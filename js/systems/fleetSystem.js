/* ===========================================================
 *  FleetSystem —— 舰队编成、命名、移动、驻扎
 *  性能设计：舰船以「堆叠 unit」存储，战略层舰队整体行动
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  let FLEET_SEQ = 1;

  class Fleet {
    constructor(id, factionId, starId, game) {
      this.id = id;
      this.factionId = factionId;
      this.starId = starId;             // 停靠中的恒星（移动中为 null）
      this.units = [];                  // [{shipId, count, hp, maxHp, shield, maxShield, name?}]
      this.mission = 'idle';            // idle | move | attack | defend | claim | retreat | reinforce | rally | patrol
      this.targetStarId = null;
      this.rallyStarId = null;          // AI 集结点（仅用于 rally 计划）
      this.attackTargetStarId = null;   // AI 远征计划目标，抵达后仍保留以便去重/复评
      this.attackPlanDay = -1;
      this.homeStarId = starId;
      this.name = '';
      this.role = 'main';               // recon | rapid | main | expedition | defense | carrier | titan | flagship
      this.move = null;                 // {path:[], seg, t, segDays}
      this.createdDay = game ? game.time.day : 0;
      this.power = 0;
      this.morale = 1;
      this.selected = false;
      this.lastBattleDay = -1;
      this.cooldown = 0;                // 撤退冷却
      this.trail = [];
    }

    /* ---------------- 编成 ---------------- */
    addShips(shipId, count, name) {
      const cfg = SW.ShipConfig[shipId];
      if (!cfg) return;
      const faction = SW._game ? SW._game.factions.get(this.factionId) : null;
      const hpMult = faction ? faction.m('shipHp') * faction.shipMod(shipId, 'hp') : 1;
      const shMult = faction ? faction.m('shipShield') * faction.shipMod(shipId, 'shield') : 1;
      const maxHp = cfg.hp * hpMult;
      const maxShield = cfg.shield * shMult;

      if (cfg.capital) {
        for (let i = 0; i < count; i++) {
          this.units.push({
            shipId: shipId, count: 1, hp: maxHp, maxHp: maxHp,
            shield: maxShield, maxShield: maxShield,
            name: name || SW.NameGen.capital(SW._game ? SW._game.rng : new SW.U.RNG(1), 'ISS')
          });
        }
      } else {
        let u = this.units.find(x => x.shipId === shipId && !x.name);
        if (!u) {
          u = { shipId: shipId, count: 0, hp: 0, maxHp: maxHp, shield: 0, maxShield: maxShield };
          this.units.push(u);
        }
        u.count += count;
        u.maxHp = maxHp; u.maxShield = maxShield;
        u.hp = Math.min(u.maxHp, (u.hp || 0) + maxHp * count);
        u.shield = Math.min(u.maxShield, (u.shield || 0) + maxShield * count);
      }
      this.recomputePower();
    }

    removeShips(shipId, count) {
      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        if (u.shipId !== shipId) continue;
        const take = Math.min(count, u.count);
        u.count -= take;
        count -= take;
        if (u.count <= 0) this.units.splice(i, 1);
        if (count <= 0) break;
      }
      this.recomputePower();
    }

    shipCount(shipId) {
      let n = 0;
      for (const u of this.units) if (u.shipId === shipId) n += u.count;
      return n;
    }
    totalShips() { let n = 0; for (const u of this.units) n += u.count; return n; }
    isEmpty() { return this.units.length === 0; }

    hasCapital() { return this.units.some(u => SW.ShipConfig[u.shipId].capital); }
    titanCount() { return this.shipCount('titan'); }
    flagshipCount() { return this.shipCount('flagship'); }

    recomputePower() {
      let p = 0;
      for (const u of this.units) {
        const cfg = SW.ShipConfig[u.shipId];
        const hpR = u.maxHp > 0 ? U.clamp(u.hp / u.maxHp, 0, 1) : 1;
        p += u.count * cfg.power * (0.35 + 0.65 * hpR);
      }
      this.power = Math.round(p);
      return this.power;
    }

    /* ---------------- 速度 ---------------- */
    speed() {
      if (!this.units.length) return 0;
      let sp = Infinity;
      for (const u of this.units) sp = Math.min(sp, SW.ShipConfig[u.shipId].speed);
      const f = SW._game ? SW._game.factions.get(this.factionId) : null;
      let mult = f ? f.m('fleetSpeed') : 1;
      if (this.starId) {
        const st = SW._game ? SW._game.galaxy.get(this.starId) : null;
        if (st && st.feature === 'nexusPoint') mult *= 1.3;
        if (st && st.logisticsBonus) mult *= (1 + st.logisticsBonus);
      }
      return sp * mult;
    }

    /** 世界坐标（渲染用） */
    position(galaxy) {
      if (this.starId) {
        const s = galaxy.get(this.starId);
        return s ? { x: s.x, y: s.y } : { x: 0, y: 0 };
      }
      if (this.move && this.move.path.length > 1) {
        const a = galaxy.get(this.move.path[this.move.seg]);
        const b = galaxy.get(this.move.path[this.move.seg + 1]);
        if (!a || !b) return { x: 0, y: 0 };
        const t = U.clamp(this.move.t, 0, 1);
        return { x: U.lerp(a.x, b.x, t), y: U.lerp(a.y, b.y, t) };
      }
      return { x: 0, y: 0 };
    }

    serialize() {
      return {
        id: this.id, factionId: this.factionId, starId: this.starId,
        units: this.units.map(u => ({
          shipId: u.shipId, count: u.count, hp: u.hp, maxHp: u.maxHp,
          shield: u.shield, maxShield: u.maxShield, name: u.name
        })),
        mission: this.mission, targetStarId: this.targetStarId, homeStarId: this.homeStarId,
        rallyStarId: this.rallyStarId, attackTargetStarId: this.attackTargetStarId, attackPlanDay: this.attackPlanDay,
        name: this.name, role: this.role,
        move: this.move ? { path: this.move.path.slice(), seg: this.move.seg, t: this.move.t, segDays: this.move.segDays } : null,
        createdDay: this.createdDay, power: this.power, morale: this.morale,
        lastBattleDay: this.lastBattleDay, cooldown: this.cooldown
      };
    }
    static deserialize(d, game) {
      const f = new Fleet(d.id, d.factionId, d.starId, game);
      f.units = (d.units || []).map(u => ({
        shipId: u.shipId, count: u.count, hp: u.hp, maxHp: u.maxHp,
        shield: u.shield, maxShield: u.maxShield, name: u.name
      }));
      f.mission = d.mission || 'idle'; f.targetStarId = d.targetStarId || null; f.homeStarId = d.homeStarId;
      f.rallyStarId = d.rallyStarId || null;
      f.attackTargetStarId = d.attackTargetStarId || null;
      f.attackPlanDay = Number.isFinite(Number(d.attackPlanDay)) ? Number(d.attackPlanDay) : -1;
      f.name = d.name; f.role = d.role;
      f.move = d.move ? { path: d.move.path.slice(), seg: d.move.seg, t: d.move.t, segDays: d.move.segDays } : null;
      f.createdDay = d.createdDay || 0; f.power = d.power || 0; f.morale = d.morale != null ? d.morale : 1;
      f.lastBattleDay = d.lastBattleDay || -1; f.cooldown = d.cooldown || 0;
      f.recomputePower();
      return f;
    }
  }

  /* ============================================================ */

  class FleetSystem {
    constructor(game) {
      this.game = game;
      this.fleets = [];
      this.byId = {};
      this.fleetNames = {};   // factionId -> used name counter
    }

    /* ---------------- 创建 ---------------- */
    create(factionId, starId, role, nameHint) {
      const f = new Fleet('F' + (FLEET_SEQ++), factionId, starId, this.game);
      f.role = role || 'main';
      const faction = this.game.factions.get(factionId);
      f.name = nameHint || SW.NameGen.fleet(this.game.rng, faction ? faction.cfg.adjective : '');
      this.fleets.push(f);
      this.byId[f.id] = f;
      return f;
    }

    get(id) { return this.byId[id]; }

    /** 取得或创建某星系的驻扎舰队 */
    getOrCreateGarrison(starId, factionId) {
      for (const f of this.fleets) {
        if (f.factionId === factionId && f.starId === starId && !f.move && f.role !== 'expedition') return f;
      }
      return this.create(factionId, starId, 'defense');
    }

    remove(fleet) {
      U.remove(this.fleets, fleet);
      delete this.byId[fleet.id];
    }

    fleetsAt(starId) { return this.fleets.filter(f => f.starId === starId); }
    fleetsOf(factionId) { return this.fleets.filter(f => f.factionId === factionId); }

    hasEnemyFleetAt(starId, factionId) {
      for (const f of this.fleets) {
        if (f.starId !== starId) continue;
        if (f.factionId === factionId) continue;
        const a = this.game.factions.get(f.factionId);
        const b = this.game.factions.get(factionId);
        if (a && b && (a.isEnemy(b.id) || b.isEnemy(a.id))) return true;
      }
      return false;
    }

    /** 敌对舰队（返回数组） */
    enemiesAt(starId, factionId) {
      const out = [];
      for (const f of this.fleets) {
        if (f.starId !== starId || f.factionId === factionId) continue;
        const a = this.game.factions.get(f.factionId);
        const b = this.game.factions.get(factionId);
        if (a && b && (a.isEnemy(b.id) || b.isEnemy(a.id))) out.push(f);
      }
      return out;
    }

    /**
     * 各星系可调动的空闲战力（不含移动中与专职防守的舰队）
     * 扩张 / 进攻 AI 用它来挑选真正有兵可派的出发点
     */
    availablePowerByStar(factionId) {
      const out = {};
      for (const f of this.fleets) {
        if (f.factionId !== factionId) continue;
        if (!f.starId || f.move) continue;
        if (f.mission === 'defend') continue;
        if (f.mission === 'retreat') continue;
        if (f.mission === 'rally' || f.mission === 'attack' || f.mission === 'claim' || f.mission === 'reinforce') continue;
        out[f.starId] = (out[f.starId] || 0) + f.power;
      }
      return out;
    }

    countCapitalAlive(factionId, shipId) {
      let n = 0;
      for (const f of this.fleets) {
        if (f.factionId !== factionId) continue;
        n += f.shipCount(shipId);
      }
      return n;
    }

    titansOf(factionId) {
      const out = [];
      for (const f of this.fleets) {
        if (f.factionId !== factionId) continue;
        for (const u of f.units) if (u.shipId === 'titan') out.push({ fleet: f, unit: u });
      }
      return out;
    }

    /* ---------------- 移动 ---------------- */
    orderMove(fleet, targetStarId, mission) {
      if (!fleet.starId) return false;
      const galaxy = this.game.galaxy;
      const path = galaxy.path(fleet.starId, targetStarId);
      if (!path || path.length < 2) return false;
      fleet.move = { path: path, seg: 0, t: 0, segDays: 0 };
      fleet.starId = null;
      fleet.targetStarId = targetStarId;
      if (mission) fleet.mission = mission;
      this._prepareSegment(fleet);
      return true;
    }

    _prepareSegment(fleet) {
      const galaxy = this.game.galaxy;
      const a = galaxy.get(fleet.move.path[fleet.move.seg]);
      const b = galaxy.get(fleet.move.path[fleet.move.seg + 1]);
      const d = U.dist(a.x, a.y, b.x, b.y);
      const spd = fleet.speed() * SW.GalaxyConfig.movement.worldUnitsPerDay;
      fleet.move.segDays = Math.max(SW.GalaxyConfig.movement.minTravelDays, d / Math.max(1, spd));
    }

    update(dt) {
      const galaxy = this.game.galaxy;
      /* 战力重算节流：不必每个模拟步都刷 */
      this._pAcc = (this._pAcc || 0) + dt;
      const recalcPower = this._pAcc >= SW.AIConfig.systemIntervals.powerRecalc;
      if (recalcPower) this._pAcc = 0;

      for (let i = this.fleets.length - 1; i >= 0; i--) {
        const f = this.fleets[i];
        if (f.isEmpty()) { this.remove(f); continue; }
        if (f.cooldown > 0) f.cooldown -= dt;

        /* 维修 */
        this._repair(f, dt);

        /* 移动 */
        if (f.move) {
          const m = f.move;
          m.t += dt / Math.max(0.0001, m.segDays);
          while (m.t >= 1) {
            m.t -= 1;
            m.seg++;
            if (m.seg >= m.path.length - 1) {
              const destId = m.path[m.path.length - 1];
              f.starId = destId;
              f.move = null;
              this._onArrive(f, destId);
              break;
            }
            this._prepareSegment(f);
          }
        }
        /* 战力重算按节流间隔执行（战斗中由 CombatSystem 立即刷新） */
        if (recalcPower) f.recomputePower();
      }
    }

    _repair(f, dt) {
      const faction = this.game.factions.get(f.factionId);
      if (!faction) return;
      let rate = SW.CombatConfig.hullRepairInFleetPerDay * (1 + faction.mods.repair);
      if (f.starId) {
        const st = this.game.galaxy.get(f.starId);
        if (st && st.owner === f.factionId) {
          for (const b of st.buildings) {
            const cfg = SW.BuildingConfig[b.id];
            if (cfg && cfg.repair) rate += cfg.repair;
          }
        }
      }
      if (rate <= 0) return;
      for (const u of f.units) {
        if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * rate * dt);
        if (u.shield < u.maxShield) u.shield = Math.min(u.maxShield, u.shield + u.maxShield * (rate + 0.25) * dt * 3);
      }
    }

    _onArrive(fleet, starId) {
      const game = this.game;
      fleet.targetStarId = null;
      // 合流：与同势力同星系的驻扎舰队合并，避免舰队无限膨胀
      if (fleet.role !== 'expedition' || fleet.units.length === 0) {
        const same = this.fleets.find(o => o !== fleet && o.factionId === fleet.factionId && o.starId === starId && !o.move &&
          (!fleet.attackTargetStarId || !o.attackTargetStarId || fleet.attackTargetStarId === o.attackTargetStarId));
        if (same) { this.merge(same, fleet); return; }
      }
      game.onFleetArrive(fleet, starId);
    }

    merge(target, source) {
      for (const u of source.units) {
        if (u.name) { target.units.push(u); continue; }
        let t = target.units.find(x => x.shipId === u.shipId && !x.name);
        if (!t) { target.units.push({ shipId: u.shipId, count: u.count, hp: u.hp, maxHp: u.maxHp, shield: u.shield, maxShield: u.maxShield }); continue; }
        t.count += u.count;
        t.hp = Math.min(t.maxHp, t.hp + u.hp);
        t.shield = Math.min(t.maxShield, t.shield + u.shield);
      }
      if (target.role === 'defense' && source.role !== 'defense') target.role = source.role;
      if (!target.attackTargetStarId && source.attackTargetStarId) target.attackTargetStarId = source.attackTargetStarId;
      if (!target.rallyStarId && source.rallyStarId) target.rallyStarId = source.rallyStarId;
      if (target.attackPlanDay < 0 && source.attackPlanDay >= 0) target.attackPlanDay = source.attackPlanDay;
      target.recomputePower();
      this.remove(source);
    }

    /** 拆分出一支分舰队 */
    split(source, ratio, role) {
      const nf = this.create(source.factionId, source.starId, role || source.role);
      let any = false;
      for (let i = source.units.length - 1; i >= 0; i--) {
        const u = source.units[i];
        if (u.name) continue;      // 命名舰不拆
        const take = Math.floor(u.count * ratio);
        if (take <= 0) continue;
        u.count -= take;
        const hpR = u.maxHp > 0 ? u.hp / u.maxHp : 1;
        const shR = u.maxShield > 0 ? u.shield / u.maxShield : 1;
        nf.units.push({ shipId: u.shipId, count: take, hp: u.maxHp * take * hpR, maxHp: u.maxHp, shield: u.maxShield * take * shR, maxShield: u.maxShield });
        any = true;
        if (u.count <= 0) source.units.splice(i, 1);
      }
      source.recomputePower();
      nf.recomputePower();
      if (!any || nf.isEmpty()) { this.remove(nf); return null; }
      return nf;
    }

    /** 从若干舰队中抽调战力组成新舰队 */
    assemble(factionId, starId, targetPower, role, options) {
      const filter = options && typeof options.filter === 'function' ? options.filter : null;
      const available = this.fleets.filter(f => f.factionId === factionId && f.starId === starId && !f.move && f.mission !== 'defend' &&
        (!filter || filter(f)));
      if (!available.length) return null;
      const fleet = this.create(factionId, starId, role || 'main');
      let sum = 0;
      for (const src of available) {
        if (sum >= targetPower) break;
        for (let i = src.units.length - 1; i >= 0; i--) {
          const u = src.units[i];
          if (u.name) continue;
          const cfg = SW.ShipConfig[u.shipId];
          const need = targetPower - sum;
          const take = Math.min(u.count, Math.max(1, Math.ceil(need / Math.max(1, cfg.power))));
          if (take <= 0) continue;
          u.count -= take;
          const hpR = u.maxHp > 0 ? u.hp / u.maxHp : 1;
          const shR = u.maxShield > 0 ? u.shield / u.maxShield : 1;
          let t = fleet.units.find(x => x.shipId === u.shipId && !x.name);
          if (!t) { t = { shipId: u.shipId, count: 0, hp: 0, maxHp: u.maxHp, shield: 0, maxShield: u.maxShield }; fleet.units.push(t); }
          t.count += take;
          t.hp += u.maxHp * take * hpR;
          t.shield += u.maxShield * take * shR;
          sum += take * cfg.power;
          if (u.count <= 0) src.units.splice(i, 1);
        }
        src.recomputePower();
        if (src.isEmpty()) this.remove(src);
      }
      fleet.recomputePower();
      if (fleet.isEmpty()) { this.remove(fleet); return null; }
      return fleet;
    }

    /* ---------------- 序列化 ---------------- */
    serialize() { return this.fleets.map(f => f.serialize()); }
    deserialize(arr) {
      this.fleets = (arr || []).map(d => Fleet.deserialize(d, this.game));
      this.byId = {};
      for (const f of this.fleets) this.byId[f.id] = f;
    }
  }

  SW.Fleet = Fleet;
  SW.FleetSystem = FleetSystem;
})(window.SW);
