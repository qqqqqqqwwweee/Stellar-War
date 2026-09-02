/* ===========================================================
 *  Game —— 游戏总控（编排所有子系统）
 *  固定步长模拟，AI 分频决策，事件驱动特效与镜头
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class Game {
    constructor(canvas) {
      SW._game = this;
      this.canvas = canvas;
      this.seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      this.rng = new SW.U.RNG(this.seed);

      /* 核心 */
      this.time = new SW.GameTimeManager(SW.GalaxyConfig.time);
      this.events = new SW.EventSystem();

      /* 地图与势力 */
      this.galaxy = new SW.GalaxyManager(this.rng, SW.GalaxyConfig);
      this.factions = new SW.FactionManager(this);

      /* 系统 */
      this.economy = new SW.EconomySystem(this);
      this.technology = new SW.TechnologySystem(this);
      this.buildings = new SW.BuildingSystem(this);
      this.production = new SW.ProductionSystem(this);
      this.fleets = new SW.FleetSystem(this);
      this.combat = new SW.CombatSystem(this);
      this.diplomacy = new SW.DiplomacySystem(this);
      this.save = new SW.SaveSystem(this);

      /* 渲染与 AI */
      this.effects = new SW.EffectsSystem();
      this.camera = new SW.CameraController(canvas, this);
      this.renderer = new SW.Renderer(canvas, this);
      this.ai = new SW.StrategicAI(this);

      /* 观战状态 */
      this.selection = null;
      this.viewFaction = null;      // null = 全知视角；否则为势力视角（战争迷雾）
      this.resourceView = 'A';      // 顶部资源栏观察的势力
      this.gameOver = null;
      this.perf = { fps: 60, ms: 0, steps: 0, ships: 0, particles: 0 };

      this._periodicAcc = 0;
      this._autosaveAcc = 0;
      this._dipAcc = 0;
      this._visAcc = 0;
      this._ecoAcc = 0;
      this._lastReal = 0;
      this._fpsAcc = 0; this._fpsCount = 0;

      this._bindEvents();
    }

    /* ================= 新游戏 ================= */
    newGame(options) {
      const opt = options || {};
      if (opt.seed != null) this.seed = opt.seed >>> 0;
      else this.seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      this.rng.setState(this.seed);

      U.resetIds();
      this.time = new SW.GameTimeManager(SW.GalaxyConfig.time);
      this.events.clear();
      this.effects.clear();

      this.galaxy.rng = this.rng;
      this.galaxy.generate(opt.starCount || SW.GalaxyConfig.starCount);
      this.factions.create();
      this.factions.setupStartingPositions(this.galaxy);

      /* 重置系统 */
      this.production = new SW.ProductionSystem(this);
      this.fleets = new SW.FleetSystem(this);
      this.combat = new SW.CombatSystem(this);
      this.ai = new SW.StrategicAI(this);
      this.camera.follow = null;
      this.camera.autoTarget = null;

      /* 初始舰队 */
      this._createStartingFleets();

      /* 初始科技（各势力开局给一点基础科技，保证立刻能造舰） */
      for (const f of this.factions.list) {
        f.tech.completed['tech_destroyer'] = true;
        f.recomputeMods();
      }

      /* 初始计算 */
      for (const s of this.galaxy.stars) {
        const f = s.owner ? this.factions.get(s.owner) : null;
        /* 新游戏的已归属星系从满防开始；中立星系不生成可用防御。 */
        this.economy.recomputeDefense(s, f, !!f);
      }
      this.economy.recomputeAll();
      this.renderer.markTerritoryDirty();
      this.renderer.buildBackground();

      this.gameOver = null;
      this.selection = null;
      this.viewFaction = null;
      this.resourceView = 'A';

      this.events.record(this, '银河纪元开启。四大文明在银河四角点燃了第一座反应堆。', 'milestone', { priority: 3 });
      this.events.notify('【银河事件】新的银河已经生成，战争即将开始。', 'milestone', { priority: 3 });
      this.camera.fitGalaxy();
      this.ai.periodic();
      return this;
    }

    _createStartingFleets() {
      const cfg = SW.GalaxyConfig.start;
      for (const f of this.factions.list) {
        const home = this.galaxy.get(f.homeStarId);
        if (!home) continue;
        /* 驻扎舰队 */
        const garrison = this.fleets.create(f.id, home.id, 'defense', f.cfg.adjective + '母星卫戍舰队');
        garrison.addShips('corvette', 6);
        garrison.addShips('destroyer', 3);
        if (f.id === 'B') garrison.addShips('corvette', 4);
        if (f.id === 'D') garrison.addShips('destroyer', 2);

        /* 探索舰队 */
        for (let i = 0; i < cfg.startingFleets - 1; i++) {
          const fl = this.fleets.create(f.id, home.id, 'recon');
          fl.addShips('corvette', 3);
          fl.addShips('destroyer', 1);
        }
      }
    }

    /* ================= 事件绑定 ================= */
    _bindEvents() {
      const E = this.events;

      E.on('combatShot', (ev) => {
        const star = this.galaxy.get(ev.starId);
        if (!star) return;
        const combat = this.combat;
        const battle = ev.battleId
          ? combat.battles.find(b => b && b.id === ev.battleId)
          : combat.byStar[star.id];
        if (!battle || battle.starId !== star.id || (ev.battleId && combat.byStar[star.id] !== battle)) return;
        const inBattle = (fleet) => {
          if (!fleet || fleet.starId !== star.id || fleet.move) return false;
          for (const key in battle.sides) {
            const side = battle.sides[key];
            if (side && side.fleets && side.fleets.indexOf(fleet) >= 0) return true;
          }
          return false;
        };
        const src = ev.sourceFleetId ? this.fleets.get(ev.sourceFleetId) : null;
        const tgt = ev.targetFleetId ? this.fleets.get(ev.targetFleetId) : null;
        if (ev.fromStar ? !inBattle(tgt) : !inBattle(src)) return;
        if (tgt && !inBattle(tgt)) return;
        /* 只在镜头附近生成特效 */
        const cam = this.camera;
        const vb = cam.viewBounds(40);
        if (star.x < vb.x0 || star.x > vb.x1 || star.y < vb.y0 || star.y > vb.y1) return;
        const tactical = this.renderer && this.renderer.isTacticalView && this.renderer.isTacticalView();
        const fleetPos = (fleet) => this.renderer && this.renderer.fleetVisualPosition
          ? this.renderer.fleetVisualPosition(fleet) : fleet.position(this.galaxy);
        const p0 = ev.fromStar ? { x: star.x, y: star.y } : (src ? fleetPos(src) : { x: star.x, y: star.y });
        const p1 = tgt ? fleetPos(tgt) : { x: star.x + (Math.random() - 0.5) * 40, y: star.y + (Math.random() - 0.5) * 40 };
        const jitter = tactical ? (SW.GalaxyConfig.camera.tactical.effectJitter || 5) : 16;
        const a = { x: p0.x + (Math.random() - 0.5) * jitter, y: p0.y + (Math.random() - 0.5) * jitter };
        const b = { x: p1.x + (Math.random() - 0.5) * jitter, y: p1.y + (Math.random() - 0.5) * jitter };
        if (ev.weapon === 'torpedo' || ev.weapon === 'missile') {
          this.effects.torpedo(a.x, a.y, b.x, b.y, ev.color, ev.weapon, star.id, battle.id);
        } else {
          const visual = SW.CombatConfig.visual || {};
          this.effects.beam(a.x, a.y, b.x, b.y, ev.color,
            (ev.weapon === 'superWeapon' ? 3.2 : 1.5) * (ev.scale || 1),
            ev.weapon === 'superWeapon' ? visual.superBeamLife : visual.beamLife,
            ev.weapon, star.id, battle.id);
        }
        if (Math.random() < 0.25) this.effects.shieldFlash(b.x, b.y, 10 + Math.random() * 10, '#5ce1e6');
      });

      E.on('combatHit', (ev) => {
        const star = this.galaxy.get(ev.starId);
        const battle = star && ev.battleId ? this.combat.battles.find(b => b && b.id === ev.battleId) : null;
        const fleet = ev.targetFleetId ? this.fleets.get(ev.targetFleetId) : null;
        if (!star || !battle || battle.starId !== star.id || this.combat.byStar[star.id] !== battle ||
          !fleet || fleet.starId !== star.id || fleet.move) return;
        let member = false;
        for (const key in battle.sides) {
          const side = battle.sides[key];
          if (side && side.fleets && side.fleets.indexOf(fleet) >= 0) { member = true; break; }
        }
        if (!member) return;
        const p = this.renderer && this.renderer.fleetVisualPosition
          ? this.renderer.fleetVisualPosition(fleet) : { x: star.x, y: star.y };
        if ((ev.shieldDamage || 0) > 0) {
          this.effects.shieldFlash(p.x, p.y, 12 + Math.min(12, ev.shieldDamage * 0.02), '#5ce1e6');
        }
        if ((ev.hullDamage || 0) > 0 && Math.random() < 0.18) {
          this.effects.text(p.x, p.y - 14, '命中', ev.weapon === 'superWeapon' ? '#fff0b5' : '#ffb0b8', 11);
        }
      });

      E.on('explosion', (ev) => {
        const star = this.galaxy.get(ev.starId);
        if (!star) return;
        const fleet = ev.fleetId ? this.fleets.get(ev.fleetId) : null;
        if (ev.fleetId && (!fleet || fleet.starId !== star.id || fleet.move)) return;
        const p = fleet && this.renderer && this.renderer.fleetVisualPosition
          ? this.renderer.fleetVisualPosition(fleet) : { x: star.x, y: star.y };
        const spread = this.renderer && this.renderer.isTacticalView && this.renderer.isTacticalView() ? 16 : 60;
        this.effects.explosion(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, ev.scale || 1);
      });

      E.on('capitalDestroyed', (ev) => {
        const star = this.galaxy.get(ev.starId);
        const fleet = ev.fleet && ev.fleet.id ? ev.fleet : (ev.fleetId ? this.fleets.get(ev.fleetId) : null);
        if (star && fleet && (fleet.starId !== star.id || fleet.move)) return;
        if (star) {
          const p = ev.fleet && this.renderer && this.renderer.fleetVisualPosition
            ? this.renderer.fleetVisualPosition(ev.fleet) : { x: star.x, y: star.y };
          this.effects.explosion(p.x, p.y, 6, '#ffd08a');
          this.effects.explosion(p.x, p.y, 4, '#ff7a4d');
          this.effects.text(p.x, p.y - 40, '「' + ev.name + '」被击毁！', '#ff9a8a', 18);
          this.camera.shake = 1.4;
        }
        if (this.camera.autoSpectate) this.camera.focusOn(star ? star.x : 0, star ? star.y : 0, this.camera.battleFocusZoom, 7);
      });

      E.on('flagshipBuilt', (ev) => {
        if (ev.star) {
          this.effects.text(ev.star.x, ev.star.y - 50, '超级旗舰「' + ev.name + '」服役！', '#ffe6a8', 20);
          this.effects.explosion(ev.star.x, ev.star.y, 3, '#ffe6a8');
        }
        if (this.camera.autoSpectate) this.camera.focusOn(ev.star.x, ev.star.y, this.camera.battleFocusZoom, 8);
      });

      E.on('capitalBuilt', (ev) => {
        if (ev.star && ev.shipId === 'titan') {
          this.effects.text(ev.star.x, ev.star.y - 40, '泰坦「' + ev.name + '」服役', '#ffd08a', 16);
        }
      });

      E.on('battleStart', (ev) => {
        const star = this.galaxy.get(ev.starId);
        if (star && this.camera.autoSpectate) {
          const p = ev.battle.peakPower || 0;
          if (p > 100 || star.isHome) this.camera.focusOn(star.x, star.y, this.camera.battleFocusZoom, 6);
        }
      });

      E.on('capitalFallen', (ev) => {
        const s = ev.star;
        this.effects.explosion(s.x, s.y, 8, '#ff5d6c');
        this.effects.text(s.x, s.y - 60, '首都陷落！', '#ff5d6c', 22);
        this.camera.shake = 2;
        if (this.camera.autoSpectate) this.camera.focusOn(s.x, s.y, this.camera.battleFocusZoom, 8);
        this.renderer.markTerritoryDirty();
      });

      E.on('starCaptured', (ev) => { this.renderer.markTerritoryDirty(); });
      E.on('warDeclared', (ev) => {
        this.effects.text(0, 0, '', '#fff', 1);
      });
    }

    /* ================= 主循环 ================= */
    update(dtReal) {
      const t0 = performance.now();

      /* FPS 统计 */
      this._fpsAcc += dtReal; this._fpsCount++;
      if (this._fpsAcc >= 0.5) {
        this.perf.fps = Math.round(this._fpsCount / this._fpsAcc);
        this._fpsAcc = 0; this._fpsCount = 0;
      }

      if (!this.gameOver) {
        const steps = this.time.advance(dtReal);
        const stepDays = SW.GalaxyConfig.time.stepDays;
        for (let i = 0; i < steps; i++) {
          this.step(stepDays);
          if (this.gameOver) break;
        }
        this.perf.steps = steps;
      }

      /* 表现层更新 */
      this.effects.update(dtReal);
      this.camera.update(dtReal);
      this.events.update(dtReal);

      /* 定期重算（每 1.5 秒） */
      this._periodicAcc += dtReal;
      if (this._periodicAcc >= 1.5) {
        this._periodicAcc = 0;
        this.ai.periodic();
        this._recountPerf();
      }

      /* 自动存档（每 90 秒） */
      this._autosaveAcc += dtReal;
      if (this._autosaveAcc >= 90) {
        this._autosaveAcc = 0;
        try { this.save.autosave(); } catch (e) { }
      }

      this.renderer.render(dtReal);
      this.perf.ms = performance.now() - t0;
    }

    /** 一个模拟步长 */
    step(dt) {
      this.time.stepGame(dt);

      /* 1) 经济与生产 */
      this.economy.update(dt);
      this.production.update(dt);

      /* 2) 科研 */
      this.technology.update(dt);

      /* 3) 舰队移动 */
      this.fleets.update(dt);

      /* 4) 战斗与占领（内部已做索引与节流） */
      this.combat.update(dt);

      /* 5) 外交（边境接触检测较昂贵，节流执行） */
      this.factions.updateDaily(dt);
      const SI = SW.AIConfig.systemIntervals;
      this._dipAcc += dt;
      if (this._dipAcc >= SI.diplomacyScan) { this._dipAcc = 0; this.diplomacy.update(dt); }

      /* 6) AI 决策 */
      this.ai.update(dt);

      /* 7) 胜负判定 */
      this._checkEndConditions();

      /* 8) 收入重算（建筑/占领变动不需要每步刷新） */
      this._ecoAcc += dt;
      if (this._ecoAcc >= SI.economyRecompute) { this._ecoAcc = 0; this.economy.recomputeAll(); }

      /* 9) 探索刷新（节流） */
      this._visAcc += dt;
      if (this._visAcc >= SI.vision) { this._visAcc = 0; this._updateVision(); }
    }

    _updateVision() {
      /* 每个势力：己方星系 + 相邻星系 + 有舰队处可见 */
      for (const s of this.galaxy.stars) {
        if (s.owner === null) continue;
        s.explored[s.owner] = true;
        s.lastSeen[s.owner] = this.time.day;
      }
      for (const fl of this.fleets.fleets) {
        if (!fl.starId) continue;
        const s = this.galaxy.get(fl.starId);
        if (!s) continue;
        s.explored[fl.factionId] = true;
        s.lastSeen[fl.factionId] = this.time.day;
        /* 雷达范围 */
        const range = 1 + (this.factions.get(fl.factionId) ? Math.round(this.factions.get(fl.factionId).mods.sensor || 0) : 0);
        if (range > 1) {
          const hops = this.galaxy.hopsFrom([s.id], range);
          for (const id in hops) { const st = this.galaxy.get(id); if (st) st.explored[fl.factionId] = true; }
        }
      }
    }

    _recountPerf() {
      let ships = 0;
      for (const f of this.fleets.fleets) ships += f.totalShips();
      this.perf.ships = ships;
      this.perf.particles = this.effects.particles.length + this.effects.beams.length;
      for (const f of this.factions.list) this.factions.recount(this.galaxy, this.fleets);
    }

    _checkEndConditions() {
      /* 势力灭亡 */
      const dead = this.factions.checkDefeat(this.galaxy);
      if (dead) {
        this.events.record(this, '【银河事件】' + dead.name + '失去了最后一个恒星系，文明宣告灭亡。', 'capital', { factionId: dead.id, priority: 5 });
        this.events.notify('【银河事件】' + dead.name + '已灭亡。', 'capital', { factionId: dead.id, priority: 5 });
        this.renderer.markTerritoryDirty();
        /* 清除其残余舰队 */
        for (const f of this.fleets.fleets.slice()) {
          if (f.factionId === dead.id) this.fleets.remove(f);
        }
        for (const key in this.production.lines) delete this.production.lines[key];
      }

      /* 胜利 */
      const winner = this.factions.checkVictory(this.galaxy);
      if (winner && !this.gameOver) this._declareVictory(winner);
    }

    _declareVictory(winner) {
      const w = this.factions.get(winner.id);
      const total = this.galaxy.stars.length;
      this.gameOver = {
        winnerId: w.id,
        day: this.time.day,
        stats: {
          stars: this.galaxy.starsOf(w.id).length,
          totalStars: total,
          years: Math.round(this.time.day / SW.GalaxyConfig.time.daysPerYear),
          shipsBuilt: w.stats.shipsBuilt,
          shipsLost: w.stats.shipsLost,
          shipsKilled: w.stats.shipsKilled,
          titansBuilt: w.stats.titansBuilt,
          titansLost: w.stats.titansLost,
          flagshipName: w.stats.flagshipName,
          flagshipBuilt: w.stats.flagshipBuilt,
          flagshipLost: w.stats.flagshipLost,
          techs: w.techCount
        }
      };
      const msg = '【银河征服】' + w.name + '统一了银河系！';
      this.events.record(this, msg, 'victory', { factionId: w.id, priority: 5 });
      this.events.notify(msg, 'victory', { factionId: w.id, priority: 5 });
      this.events.emit('victory', { faction: w, priority: 5 });
      this.time.setPaused(true);
    }

    /* ================= 交互回调 ================= */
    onFleetArrive(fleet, starId) {
      const star = this.galaxy.get(starId);
      if (!star) return;
      const faction = this.factions.get(fleet.factionId);
      /* 探索 */
      if (faction) {
        star.explored[faction.id] = true;
        for (const n of star.links) { const s = this.galaxy.get(n); if (s) s.explored[faction.id] = true; }
      }
      if (fleet.mission === 'claim' && star.owner !== fleet.factionId) {
        /* 留在该处等待占领判定 */
        fleet.mission = 'attack';
      }
      if ((fleet.mission === 'defend' || fleet.mission === 'reinforce') && fleet.mission !== 'rally') {
        fleet.mission = 'idle';
      }
      if (star.owner === fleet.factionId && fleet.mission !== 'rally') {
        fleet.mission = 'idle';
        fleet.targetStarId = null;
        fleet.attackTargetStarId = null;
        fleet.rallyStarId = null;
        fleet.attackPlanDay = -1;
      }
    }

    select(sel) {
      this.selection = sel;
      if (sel && sel.type === 'star') {
        const s = this.galaxy.get(sel.id);
        if (s && s.owner) this.resourceView = s.owner;
        if (s && this.combat.byStar[s.id]) this.camera.focusBattle(s.id);
      } else if (sel && sel.type === 'fleet') {
        const f = this.fleets.get(sel.id);
        if (f) {
          this.resourceView = f.factionId;
          if (f.starId && this.combat.byStar[f.starId]) this.camera.focusBattle(f.starId);
        }
      }
    }

    focusBattle(starId) {
      const star = this.galaxy.get(starId);
      if (!star) return false;
      this.selection = { type: 'star', id: star.id };
      if (star.owner) this.resourceView = star.owner;
      return this.camera.focusBattle(star.id);
    }

    doubleClickFleet(fleetId) {
      const f = this.fleets.get(fleetId);
      if (!f) return;
      this.camera.follow = f.id;
      this.camera.autoSpectate = false;
      this.camera.targetZoom = Math.max(this.camera.targetZoom, f.starId && this.combat.byStar[f.starId]
        ? this.camera.battleFocusZoom : 0.9);
    }
  }

  SW.Game = Game;
})(window.SW);
