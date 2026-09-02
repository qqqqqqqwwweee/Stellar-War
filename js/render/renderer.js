/* ===========================================================
 *  Renderer —— Canvas 2D 银河渲染器
 *  图层：星云背景 -> 势力影响力 -> 超空间航道 -> 恒星 ->
 *        舰队 -> 特效 -> 高亮与标签
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.camera = game.camera;
      this.effects = game.effects;
      const cameraCfg = (SW.GalaxyConfig && SW.GalaxyConfig.camera) || {};
      this.tacticalConfig = cameraCfg.tactical || {};

      this.bg = null;               // 星云背景离屏画布
      this.bgScale = 1;
      this.territory = null;        // 势力领土离屏画布
      this.territoryDirty = true;
      this.territoryZoom = 0;
      this.t = 0;
      this.showLinks = true;
      this.showLabels = true;
      this.showTerritory = true;
      this.quality = 1;             // 1 = 高，0.5 = 省电

      this.hoverStar = null;
      this.hoverFleet = null;
    }

    /* ---------------- 初始化背景 ---------------- */
    buildBackground() {
      const R = SW.GalaxyConfig.radius;
      const size = 1024;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      const rng = new SW.U.RNG(20260831);

      /* 深空底色 */
      g.fillStyle = '#03060f';
      g.fillRect(0, 0, size, size);

      /* 银河光带 */
      const grad = g.createLinearGradient(0, size * 0.2, size, size * 0.8);
      grad.addColorStop(0, 'rgba(30,50,110,0.30)');
      grad.addColorStop(0.45, 'rgba(60,80,170,0.20)');
      grad.addColorStop(1, 'rgba(20,30,70,0.28)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);

      /* 星云团 */
      const nebulas = [
        { c: '#3d6bff', a: 0.16 }, { c: '#8a3dff', a: 0.14 }, { c: '#00c2b8', a: 0.10 },
        { c: '#ff3d7f', a: 0.09 }, { c: '#4d7bff', a: 0.13 }, { c: '#2ee6c0', a: 0.08 }
      ];
      for (let i = 0; i < 46; i++) {
        const n = nebulas[Math.floor(rng.next() * nebulas.length)];
        const x = rng.range(0, size), y = rng.range(0, size);
        const r = rng.range(60, 260);
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, U.rgba(n.c, n.a));
        rg.addColorStop(0.5, U.rgba(n.c, n.a * 0.45));
        rg.addColorStop(1, U.rgba(n.c, 0));
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }

      /* 远景恒星（尘埃点） */
      for (let i = 0; i < 2600; i++) {
        const x = rng.range(0, size), y = rng.range(0, size);
        const a = rng.range(0.08, 0.75);
        const s = rng.next() < 0.94 ? rng.range(0.5, 1.2) : rng.range(1.4, 2.4);
        const tint = rng.next();
        const col = tint < 0.7 ? '255,255,255' : (tint < 0.85 ? '180,210,255' : '255,220,180');
        g.fillStyle = 'rgba(' + col + ',' + a + ')';
        g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      }

      /* 少量亮星十字光芒 */
      for (let i = 0; i < 40; i++) {
        const x = rng.range(0, size), y = rng.range(0, size);
        const a = rng.range(0.25, 0.6);
        g.strokeStyle = 'rgba(200,225,255,' + a + ')';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x - 5, y); g.lineTo(x + 5, y);
        g.moveTo(x, y - 5); g.lineTo(x, y + 5);
        g.stroke();
      }

      this.bg = c;
      this.bgScale = size / (R * 2.4);
      return c;
    }

    /* ---------------- 领土层 ---------------- */
    buildTerritory() {
      const R = SW.GalaxyConfig.radius;
      const size = 700;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      const scale = size / (R * 2.3);
      const off = size / 2;

      g.globalCompositeOperation = 'lighter';
      for (const s of this.game.galaxy.stars) {
        if (!s.owner) continue;
        const f = SW.FactionById[s.owner];
        if (!f) continue;
        const x = s.x * scale + off, y = s.y * scale + off;
        const r = (46 + s.devLevel * 12) * scale * 1.9;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, U.rgba(f.color, 0.30));
        rg.addColorStop(0.45, U.rgba(f.color, 0.14));
        rg.addColorStop(1, U.rgba(f.color, 0));
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      this.territory = c;
      this.territoryDirty = false;
      this.territoryScale = scale;
      this.territoryOff = off;
      this.territorySize = size;
    }

    markTerritoryDirty() { this.territoryDirty = true; }

    /* ---------------- 主渲染 ---------------- */
    render(dt) {
      const ctx = this.ctx;
      const canvas = this.canvas;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      this.t += dt;
      this._tacticalFleetCount = 0;

      if (!this.bg) this.buildBackground();
      if (this.territoryDirty || !this.territory) this.buildTerritory();

      const dpr = this.dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      /* 1) 背景 */
      this._drawBackground(ctx, w, h);

      ctx.save();
      this.camera.applyTransform(ctx);

      const vb = this.camera.viewBounds(120);

      /* 2) 领土 */
      if (this.showTerritory) this._drawTerritory(ctx);

      /* 3) 航道 */
      this._drawLanes(ctx, vb);

      /* 4) 恒星 */
      this._drawStars(ctx, vb);

      /* 5) 战术近景（远景仍只显示舰队级图标） */
      this._drawTacticalBattles(ctx, vb);

      /* 6) 舰队 */
      this._drawFleets(ctx, vb);

      /* 7) 特效 */
      this._drawEffects(ctx);

      /* 8) 高亮 */
      this._drawHighlights(ctx);

      ctx.restore();
    }

    isTacticalView() {
      return this.camera.zoom >= this.camera.tacticalZoom;
    }

    _battleForFleet(fleet) {
      if (!fleet || !fleet.starId || fleet.move || !this.game.combat || !this.game.combat.byStar) return null;
      const battle = this.game.combat.byStar[fleet.starId];
      if (!battle || battle.starId !== fleet.starId || !battle.sides) return null;
      for (const key in battle.sides) {
        const side = battle.sides[key];
        if (side && side.fleets && side.fleets.indexOf(fleet) >= 0 && fleet.starId === battle.starId && !fleet.move) return battle;
      }
      return null;
    }

    _battleSideKeys(battle, includeDefense) {
      if (!battle || !battle.sides) return [];
      return Object.keys(battle.sides).filter((key) => {
        if (!includeDefense && key === '__defense') return false;
        const side = battle.sides[key];
        return key === '__defense' || (side && side.fleets && side.fleets.some(f => f && f.starId === battle.starId && !f.move && !f.isEmpty()));
      });
    }

    _tacticalAnchor(star, battle, sideKey) {
      if (sideKey === '__defense') return { x: star.x, y: star.y };
      const keys = this._battleSideKeys(battle, false);
      const index = Math.max(0, keys.indexOf(sideKey));
      const count = Math.max(1, keys.length);
      let angle;
      if (count === 1) angle = -Math.PI / 2;
      else if (count === 2) angle = index === 0 ? Math.PI : 0;
      else angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      const r = (this.tacticalConfig.arenaRadius || 150) * 0.48;
      return { x: star.x + Math.cos(angle) * r, y: star.y + Math.sin(angle) * r, angle: angle };
    }

    /** 渲染用舰队坐标；模拟层 Fleet.position 仍保持存档兼容的星系坐标。 */
    fleetVisualPosition(fleet) {
      const base = fleet && fleet.position ? fleet.position(this.game.galaxy) : { x: 0, y: 0 };
      if (!fleet || !fleet.starId || !this.isTacticalView()) return base;
      const battle = this._battleForFleet(fleet);
      if (!battle) return base;
      const star = this.game.galaxy.get(fleet.starId);
      if (!star) return base;
      for (const key of this._battleSideKeys(battle, false)) {
        const side = battle.sides[key];
        const index = side && side.fleets ? side.fleets.indexOf(fleet) : -1;
        if (index < 0) continue;
        const anchor = this._tacticalAnchor(star, battle, key);
        const cols = Math.min(3, Math.max(1, side.fleets.length));
        const col = index % cols;
        const row = Math.floor(index / cols);
        const lateral = (col - (cols - 1) / 2) * (this.tacticalConfig.fleetSpacing || 34);
        const radial = row * (this.tacticalConfig.fleetSpacing || 34) * 0.78;
        const tangent = { x: -Math.sin(anchor.angle || 0), y: Math.cos(anchor.angle || 0) };
        const direction = { x: Math.cos(anchor.angle || 0), y: Math.sin(anchor.angle || 0) };
        return {
          x: anchor.x + tangent.x * lateral + direction.x * radial,
          y: anchor.y + tangent.y * lateral + direction.y * radial
        };
      }
      return base;
    }

    _drawBackground(ctx, w, h) {
      const cam = this.camera;
      /* 深色底 */
      ctx.fillStyle = '#03060f';
      ctx.fillRect(0, 0, w, h);
      if (!this.bg) return;

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      const R = SW.GalaxyConfig.radius * 1.2;
      const size = this.bg.width;
      const worldPerPx = (SW.GalaxyConfig.radius * 2.4) / size;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.bg, -R, -R, R * 2, R * 2);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    _drawTerritory(ctx) {
      const R = SW.GalaxyConfig.radius * 1.15;
      const size = this.territorySize;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.territory, -R, -R, R * 2, R * 2);
      ctx.restore();
    }

    _drawLanes(ctx, vb) {
      const game = this.game;
      const cam = this.camera;
      const seen = new Set();
      const fog = game.viewFaction;
      ctx.save();
      ctx.lineCap = 'round';
      for (const s of game.galaxy.stars) {
        for (const nid of s.links) {
          const k = s.id < nid ? s.id + '|' + nid : nid + '|' + s.id;
          if (seen.has(k)) continue;
          seen.add(k);
          const b = game.galaxy.get(nid);
          if (!b) continue;
          if (!this._inView(s.x, s.y, b.x, b.y, vb)) continue;

          const explored = !fog || s.explored[fog] || b.explored[fog];
          const dx = b.x - s.x, dy = b.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy);

          /* 基础航道 */
          let color = '#2a5f8f', alpha = 0.42, width = 1.5;
          if (s.owner && s.owner === b.owner) {
            color = SW.FactionById[s.owner].color; alpha = 0.5; width = 2.0;
          }
          if (!explored) { color = '#22303f'; alpha = 0.22; width = 1.2; }

          ctx.strokeStyle = U.rgba(color, alpha);
          ctx.lineWidth = width / Math.max(0.35, cam.zoom) * 0.55 + 0.6;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          /* 能量流动（仅在缩放到一定程度且可见时） */
          if (explored && cam.zoom > 0.28 && len < 1400) {
            const speed = 0.00022;
            const n = Math.min(3, Math.max(1, Math.floor(len / 420)));
            for (let i = 0; i < n; i++) {
              const ph = ((this.t * speed * 1000) + i / n) % 1;
              const px = s.x + dx * ph, py = s.y + dy * ph;
              const glow = s.owner && s.owner === b.owner ? SW.FactionById[s.owner].glow : '#7fe6ff';
              const rr = (2.6 / Math.max(0.35, cam.zoom)) + 1.0;
              const g = ctx.createRadialGradient(px, py, 0, px, py, rr * 2.2);
              g.addColorStop(0, U.rgba(glow, 0.85));
              g.addColorStop(1, U.rgba(glow, 0));
              ctx.fillStyle = g;
              ctx.beginPath(); ctx.arc(px, py, rr * 2.2, 0, Math.PI * 2); ctx.fill();
            }
          }
        }
      }
      ctx.restore();
    }

    _drawStars(ctx, vb) {
      const game = this.game;
      const cam = this.camera;
      const fog = game.viewFaction;
      const t = this.t;

      for (const s of game.galaxy.stars) {
        if (s.x < vb.x0 || s.x > vb.x1 || s.y < vb.y0 || s.y > vb.y1) continue;
        const explored = !fog || s.explored[fog];
        const td = s.typeDef;
        const baseR = (td.radius || 8) * s.sizeScale;
        const r = Math.max(3.2, baseR * (0.55 + cam.zoom * 0.9));
        const tw = 0.86 + Math.sin(t * 1.6 + s.twinkle) * 0.14;

        if (!explored) {
          /* 未探索：暗淡轮廓 */
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#26313f';
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(120,140,170,0.35)';
          ctx.lineWidth = 1 / cam.zoom + 0.4;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.9, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          continue;
        }

        /* 恒星辉光 */
        const glowR = r * (3.6 + s.devLevel * 0.45) * tw;
        const g = ctx.createRadialGradient(s.x, s.y, r * 0.2, s.x, s.y, glowR);
        const gc = s.owner ? SW.FactionById[s.owner].color : td.color;
        g.addColorStop(0, U.rgba(gc, 0.55));
        g.addColorStop(0.32, U.rgba(gc, 0.20));
        g.addColorStop(1, U.rgba(gc, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y, glowR, 0, Math.PI * 2); ctx.fill();

        /* 核心 */
        ctx.fillStyle = td.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        /* 高光 */
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(s.x - r * 0.2, s.y - r * 0.22, r * 0.42, 0, Math.PI * 2); ctx.fill();

        /* 黑洞 / 中子星特殊表现 */
        if (s.type === 'blackHole') {
          ctx.strokeStyle = 'rgba(200,150,255,0.85)';
          ctx.lineWidth = 2 / cam.zoom + 0.8;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.7, 0, Math.PI * 2); ctx.stroke();
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#c58bff';
          ctx.lineWidth = 1.2 / cam.zoom + 0.5;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(s.x, s.y, r * (2.4 + i * 0.6), r * (0.7 + i * 0.2), t * 0.3 + i, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (s.type === 'pulsar' || s.type === 'neutron') {
          const a = 0.35 + Math.sin(t * 5 + s.twinkle) * 0.3;
          ctx.strokeStyle = U.rgba(td.color, a);
          ctx.lineWidth = 1.6 / cam.zoom + 0.6;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.1, 0, Math.PI * 2); ctx.stroke();
        }

        /* 势力环 */
        if (s.owner) {
          const f = SW.FactionById[s.owner];
          ctx.strokeStyle = U.rgba(f.color, 0.85);
          ctx.lineWidth = 1.8 / cam.zoom + 0.7;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.0, 0, Math.PI * 2); ctx.stroke();
          /* 开发等级刻度 */
          if (s.devLevel > 0) {
            ctx.save();
            ctx.strokeStyle = U.rgba(f.glow, 0.9);
            ctx.lineWidth = 2.2 / cam.zoom + 0.8;
            const rr = r * 2.6;
            const frac = s.devLevel / SW.GalaxyConfig.devLevel.max;
            ctx.beginPath();
            ctx.arc(s.x, s.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
            ctx.stroke();
            ctx.restore();
          }
        }

        /* 防御护盾环 */
        if (s.starShieldMax > 0 && s.starShield > 0) {
          const ratio = s.starShield / s.starShieldMax;
          ctx.strokeStyle = U.rgba('#5ce1e6', 0.25 + ratio * 0.35);
          ctx.lineWidth = 1.2 / cam.zoom + 0.5;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 3.1, 0, Math.PI * 2); ctx.stroke();
        }

        /* 母星标记 */
        if (s.isHome) {
          ctx.save();
          ctx.strokeStyle = s.owner ? SW.FactionById[s.owner].glow : '#ffd76a';
          ctx.lineWidth = 2.4 / cam.zoom + 0.8;
          const rr = r * 3.4;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const ang = -Math.PI / 2 + i * (Math.PI * 2 / 5);
            const px = s.x + Math.cos(ang) * rr, py = s.y + Math.sin(ang) * rr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }

        /* 战略枢纽 / 瓶颈 */
        if (cam.zoom > 0.35 && (s.isChoke || s.isHub)) {
          ctx.save();
          ctx.strokeStyle = s.isChoke ? 'rgba(255,180,80,0.55)' : 'rgba(120,230,255,0.45)';
          ctx.setLineDash([4 / cam.zoom + 2, 4 / cam.zoom + 2]);
          ctx.lineWidth = 1.2 / cam.zoom + 0.4;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * (s.isChoke ? 4.4 : 3.9), 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }

        /* 战斗闪烁 */
        const battle = game.combat.byStar[s.id];
        if (battle) {
          const pulse = 0.35 + Math.sin(t * 8) * 0.25;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,80,80,' + (0.4 + pulse * 0.5) + ')';
          ctx.lineWidth = 2.6 / cam.zoom + 0.8;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 4.6 + Math.sin(t * 6) * 3, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }

        /* 占领进度环 */
        if (s.capture) {
          const p = U.clamp(s.capture.progress / s.capture.total, 0, 1);
          const f = SW.FactionById[s.capture.factionId];
          ctx.save();
          ctx.strokeStyle = U.rgba(f ? f.color : '#fff', 0.9);
          ctx.lineWidth = 3.4 / cam.zoom + 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 3.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
          ctx.stroke();
          ctx.restore();
        }

        /* 标签 */
        if (this.showLabels && cam.zoom > 0.42) {
          const fs = Math.max(9, 12 / cam.zoom * 0.7 + 4);
          ctx.save();
          ctx.font = fs + 'px "Segoe UI","Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = s.owner ? U.rgba(SW.FactionById[s.owner].glow, 0.92) : 'rgba(190,205,225,0.8)';
          ctx.shadowColor = 'rgba(0,0,0,0.9)';
          ctx.shadowBlur = 4;
          const label = s.name + (s.isHome ? ' ★' : '');
          ctx.fillText(label, s.x, s.y - r * 2.6 - 6 / cam.zoom);
          ctx.restore();
        }
      }
    }

    _battleVisible(star, battle) {
      const fog = this.game.viewFaction;
      if (!fog) return true;
      if (star.explored && star.explored[fog]) return true;
      for (const key in battle.sides) {
        const side = battle.sides[key];
        if (key === fog || (side && side.fleets && side.fleets.some(f => f && f.factionId === fog))) return true;
      }
      return false;
    }

    _drawTacticalBattles(ctx, vb) {
      if (!this.isTacticalView() || !this.game.combat || !this.game.combat.battles) return;
      const radius = this.tacticalConfig.arenaRadius || 150;
      const candidates = [];
      for (const battle of this.game.combat.battles) {
        const star = this.game.galaxy.get(battle.starId);
        if (!star || this.game.combat.byStar[star.id] !== battle || battle.starId !== star.id) continue;
        if (!this._battleVisible(star, battle)) continue;
        if (star.x < vb.x0 - radius || star.x > vb.x1 + radius || star.y < vb.y0 - radius || star.y > vb.y1 + radius) continue;
        const distance = U.dist(star.x, star.y, this.camera.x, this.camera.y);
        const intensity = Math.min(300, battle.intensity || battle.peakPower || 0);
        candidates.push({ star: star, battle: battle, score: -distance + intensity * 0.18 });
      }
      candidates.sort((a, b) => b.score - a.score);
      const maxBattles = Math.max(1, this.tacticalConfig.maxBattles || 4);
      for (let i = 0; i < Math.min(maxBattles, candidates.length); i++) {
        this._drawTacticalBattle(ctx, candidates[i].star, candidates[i].battle);
      }
    }

    _drawTacticalBattle(ctx, star, battle) {
      const cam = this.camera;
      const radius = this.tacticalConfig.arenaRadius || 150;
      if (!star || !battle || battle.starId !== star.id ||
        !this.game.combat || this.game.combat.byStar[star.id] !== battle) return;
      const fleetKeys = this._battleSideKeys(battle, false);
      const allKeys = this._battleSideKeys(battle, true);
      if (!fleetKeys.length) return;

      /* 交战区底盘和方向线，让星系内部有明确的战术空间。 */
      ctx.save();
      const bg = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius);
      bg.addColorStop(0, 'rgba(255,80,100,0.12)');
      bg.addColorStop(0.68, 'rgba(80,120,220,0.055)');
      bg.addColorStop(1, 'rgba(20,30,70,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(star.x, star.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,100,120,0.62)';
      ctx.lineWidth = 1.4 / cam.zoom + 0.5;
      ctx.setLineDash([10 / cam.zoom, 8 / cam.zoom]);
      ctx.beginPath(); ctx.arc(star.x, star.y, radius * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      for (const key of fleetKeys) {
        const a = this._tacticalAnchor(star, battle, key);
        const faction = SW.FactionById[key];
        ctx.strokeStyle = U.rgba(faction ? faction.color : '#d7e6f7', 0.28);
        ctx.lineWidth = 1 / cam.zoom + 0.35;
        ctx.beginPath(); ctx.moveTo(star.x, star.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      }

      /* 星系防御平台：仍是轻量图形，但明确表示防守方参与战斗。 */
      if (battle.sides.__defense) {
        const platformCount = Math.min(8, Math.max(3, Math.ceil((battle.sides.__defense.power || 0) / 80)));
        for (let i = 0; i < platformCount; i++) {
          const angle = this.t * 0.16 + i * Math.PI * 2 / platformCount;
          const px = star.x + Math.cos(angle) * radius * 0.23;
          const py = star.y + Math.sin(angle) * radius * 0.23;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(angle + Math.PI / 4);
          ctx.fillStyle = 'rgba(159,216,255,0.82)';
          ctx.strokeStyle = 'rgba(220,245,255,0.95)';
          ctx.lineWidth = 1 / cam.zoom + 0.35;
          ctx.beginPath(); ctx.rect(-4 / cam.zoom, -4 / cam.zoom, 8 / cam.zoom, 8 / cam.zoom); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }

      /* 无需创建粒子也能持续看到低成本的交火轨迹；真实光束会叠加在其上。 */
      if (allKeys.length >= 2) {
        const colors = allKeys.map(key => key === '__defense' ? '#9fd8ff' : ((SW.FactionById[key] || {}).color || '#ff8a8a'));
        const tracerCount = Math.min(4, Math.max(2, allKeys.length * 2));
        for (let i = 0; i < tracerCount; i++) {
          const fromKey = allKeys[i % allKeys.length];
          const toKey = allKeys[(i + 1 + Math.floor(i / allKeys.length)) % allKeys.length];
          if (fromKey === toKey) continue;
          const p0 = fromKey === '__defense' ? { x: star.x, y: star.y } : this._tacticalAnchor(star, battle, fromKey);
          const p1 = toKey === '__defense' ? { x: star.x, y: star.y } : this._tacticalAnchor(star, battle, toKey);
          const phase = (this.t * 0.72 + i * 0.23) % 1;
          const tail = Math.max(0, phase - 0.14);
          const x0 = U.lerp(p0.x, p1.x, tail), y0 = U.lerp(p0.y, p1.y, tail);
          const x1 = U.lerp(p0.x, p1.x, phase), y1 = U.lerp(p0.y, p1.y, phase);
          ctx.globalAlpha = 0.28 + (1 - phase) * 0.45;
          ctx.strokeStyle = colors[i % colors.length];
          ctx.lineWidth = 1.6 / cam.zoom + 0.45;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          ctx.fillStyle = colors[i % colors.length];
          ctx.beginPath(); ctx.arc(x1, y1, 2.2 / cam.zoom + 0.7, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'rgba(255,190,120,0.75)';
      ctx.lineWidth = 1.3 / cam.zoom + 0.45;
      ctx.beginPath(); ctx.arc(star.x, star.y, radius * 0.29 + Math.sin(this.t * 5) * 3, 0, Math.PI * 2); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = Math.max(9, 12 / cam.zoom) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffb6bd';
      ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 5;
      ctx.fillText('战术交战区 · ' + Math.round(battle.intensity || battle.peakPower || 0), star.x, star.y - radius - 10 / cam.zoom);
      for (const key of fleetKeys) {
        const side = battle.sides[key];
        const a = this._tacticalAnchor(star, battle, key);
        const faction = SW.FactionById[key];
        const factionState = this.game.factions.get(key);
        ctx.fillStyle = faction ? (faction.glow || faction.color) : '#d7e6f7';
        ctx.fillText((factionState ? factionState.cfg.shortName : (faction ? faction.shortName : '未知势力')) + ' · ' + Math.round(side.power || 0), a.x, a.y - 22 / cam.zoom);
      }
      ctx.restore();
    }

    _tacticalShipEntries(fleet) {
      const limit = Math.max(1, this.tacticalConfig.maxShipGlyphsPerFleet || 18);
      const units = fleet.units.slice().sort((a, b) => {
        const ac = SW.ShipConfig[a.shipId] && SW.ShipConfig[a.shipId].capital ? 1 : 0;
        const bc = SW.ShipConfig[b.shipId] && SW.ShipConfig[b.shipId].capital ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return (SW.ShipConfig[b.shipId] || {}).tier - (SW.ShipConfig[a.shipId] || {}).tier;
      });
      const total = Math.max(1, fleet.totalShips());
      const out = [];
      let remaining = limit;
      for (const unit of units) {
        const cfg = SW.ShipConfig[unit.shipId];
        const count = Math.max(0, Number(unit.count) || 0);
        if (!cfg || count <= 0 || remaining <= 0) continue;
        const proportional = Math.max(1, Math.round(limit * count / total));
        const wanted = cfg.capital ? Math.min(count, 3) : proportional;
        const take = Math.min(count, wanted, remaining);
        for (let i = 0; i < take; i++) out.push({ unit: unit, cfg: cfg });
        remaining -= take;
      }
      return out;
    }

    _fleetRatios(fleet) {
      let hp = 0, maxHp = 0, shield = 0, maxShield = 0;
      for (const unit of fleet.units) {
        hp += Math.max(0, Number(unit.hp) || 0);
        maxHp += Math.max(0, (Number(unit.maxHp) || 0) * (Number(unit.count) || 0));
        shield += Math.max(0, Number(unit.shield) || 0);
        maxShield += Math.max(0, (Number(unit.maxShield) || 0) * (Number(unit.count) || 0));
      }
      return {
        hp: maxHp > 0 ? U.clamp(hp / maxHp, 0, 1) : 1,
        shield: maxShield > 0 ? U.clamp(shield / maxShield, 0, 1) : 0
      };
    }

    _drawTacticalFleet(ctx, fleet, p, battle, faction) {
      const cam = this.camera;
      const tc = this.tacticalConfig;
      const spacing = tc.shipSpacing || 15;
      const entries = this._tacticalShipEntries(fleet);
      const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, entries.length) * 1.35))));
      const rows = Math.ceil(Math.max(1, entries.length) / cols);
      const angle = Math.atan2((this.game.galaxy.get(fleet.starId) || {}).y - p.y, (this.game.galaxy.get(fleet.starId) || {}).x - p.x);

      ctx.save();
      ctx.strokeStyle = U.rgba(faction.glow, 0.62);
      ctx.lineWidth = 1.2 / cam.zoom + 0.45;
      ctx.setLineDash([5 / cam.zoom, 4 / cam.zoom]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 27 + Math.min(18, entries.length * 1.5), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < entries.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = p.x + (col - (cols - 1) / 2) * spacing;
        const y = p.y + (row - (rows - 1) / 2) * spacing * 0.72;
        this._drawShipGlyph(ctx, x, y, entries[i].cfg, entries[i].unit, faction, angle, cam.zoom);
      }

      const marker = Math.max(6, 9 + Math.sqrt(fleet.power) * 0.11);
      ctx.fillStyle = U.rgba(faction.color, 0.32);
      ctx.strokeStyle = faction.glow;
      ctx.lineWidth = 1.4 / cam.zoom + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, marker, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      const ratios = this._fleetRatios(fleet);
      const barW = 48 / cam.zoom, barH = 3.5 / cam.zoom;
      const barX = p.x - barW / 2, barY = p.y + (31 / cam.zoom);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(barX, barY, barW, barH * 2 + 2 / cam.zoom);
      ctx.fillStyle = '#ff7180'; ctx.fillRect(barX, barY, barW * ratios.hp, barH);
      ctx.fillStyle = '#5ce1e6'; ctx.fillRect(barX, barY + barH + 1 / cam.zoom, barW * ratios.shield, barH);

      ctx.textAlign = 'center';
      ctx.font = Math.max(8, 10 / cam.zoom) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = faction.glow;
      ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 4;
      const mission = this._missionTag(fleet.mission);
      ctx.fillText(fleet.name + ' · ' + fleet.totalShips() + '艘' + (mission ? ' · ' + mission : ''), p.x, barY + 13 / cam.zoom);
      ctx.restore();
    }

    _drawShipGlyph(ctx, x, y, cfg, unit, faction, angle, zoom) {
      const visual = cfg.visual || {};
      const shape = visual.shape || (cfg.capital ? 'titan' : 'needle');
      const scale = Number(visual.scale) > 0 ? Number(visual.scale) : 1;
      const baseSize = cfg.capital ? 9.2 + cfg.size * 0.45 : 3.2 + cfg.size * 0.72;
      const size = Math.max(3.1, baseSize * scale);
      const hp = unit.maxHp > 0 ? U.clamp(unit.hp / (unit.maxHp * unit.count), 0, 1) : 1;
      const shield = unit.maxShield > 0 ? U.clamp(unit.shield / (unit.maxShield * unit.count), 0, 1) : 0;
      const weaponCfg = SW.WeaponConfig[(cfg.attackStyle || {}).primary] || SW.WeaponConfig.laser;
      const weaponColor = (cfg.attackStyle || {}).color || weaponCfg.color;
      const poly = (points) => {
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
          const px = points[i][0] * size, py = points[i][1] * size;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle || 0);
      ctx.globalAlpha = 0.92;

      /* 推进器先画在舰体下面，数量与舰船级别相符。 */
      const engineCount = Math.max(1, Math.min(8, Math.round(visual.engines || 1)));
      ctx.strokeStyle = U.rgba(visual.engineColor || faction.glow, 0.8);
      ctx.lineWidth = Math.max(0.7, 1 / zoom + 0.25);
      for (let i = 0; i < engineCount; i++) {
        const ey = (i - (engineCount - 1) / 2) * size * 0.16;
        ctx.beginPath();
        ctx.moveTo(-size * (0.72 + (i % 2) * 0.08), ey);
        ctx.lineTo(-size * (1.18 + (i % 3) * 0.10), ey);
        ctx.stroke();
      }

      ctx.fillStyle = hp < 0.42 ? '#ff7180' : faction.color;
      ctx.strokeStyle = faction.glow;
      ctx.lineWidth = 1 / zoom + 0.35;
      switch (shape) {
        case 'needle':
          poly([[1.7, 0], [0.45, -0.35], [-0.92, -0.22], [-1.08, 0], [-0.92, 0.22], [0.45, 0.35]]); break;
        case 'arrowhead':
          poly([[1.55, 0], [0.12, -0.9], [-0.96, -0.58], [-0.55, 0], [-0.96, 0.58], [0.12, 0.9]]); break;
        case 'diamond':
          poly([[1.45, 0], [0.1, -0.88], [-1.22, 0], [0.1, 0.88]]); break;
        case 'winged':
          poly([[1.45, 0], [0.18, -0.28], [0.78, -0.98], [-0.82, -0.68], [-1.08, -0.22], [-0.4, 0], [-1.08, 0.22], [-0.82, 0.68], [0.78, 0.98], [0.18, 0.28]]); break;
        case 'torpedo':
          poly([[1.62, 0], [0.72, -0.42], [-0.78, -0.42], [-1.08, -0.2], [-1.08, 0.2], [-0.78, 0.42], [0.72, 0.42]]); break;
        case 'broadside':
          poly([[1.35, 0], [0.78, -0.76], [-0.72, -0.76], [-1.1, -0.38], [-1.1, 0.38], [-0.72, 0.76], [0.78, 0.76]]); break;
        case 'fortress':
          poly([[1.5, 0], [0.76, -0.92], [0.28, -0.72], [-0.78, -0.92], [-1.2, -0.48], [-1.2, 0.48], [-0.78, 0.92], [0.28, 0.72], [0.76, 0.92]]); break;
        case 'titan':
          poly([[1.28, 0], [0.66, -0.92], [-0.36, -1.02], [-1.12, -0.46], [-1.12, 0.46], [-0.36, 1.02], [0.66, 0.92]]); break;
        case 'carrier':
          poly([[1.25, 0], [0.38, -0.32], [0.78, -1.02], [-0.68, -0.86], [-0.48, -0.22], [-1.18, 0], [-0.48, 0.22], [-0.68, 0.86], [0.78, 1.02], [0.38, 0.32]]); break;
        case 'flagship':
          poly([[1.7, 0], [0.62, -0.38], [0.86, -1.0], [-0.28, -0.82], [-0.72, -1.05], [-1.18, -0.42], [-0.86, 0], [-1.18, 0.42], [-0.72, 1.05], [-0.28, 0.82], [0.86, 1.0], [0.62, 0.38]]); break;
        default:
          poly([[1.45, 0], [-0.82, -0.72], [-0.82, 0.72]]); break;
      }
      ctx.fill(); ctx.stroke();

      /* 武器挂载：挂载数量和主武器颜色让舰船不只是换一个外壳。 */
      const mounts = Math.max(1, Math.min(24, Math.round(visual.mounts || cfg.size)));
      ctx.fillStyle = weaponColor;
      for (let i = 0; i < mounts; i++) {
        const lane = (i % 3) - 1;
        const row = Math.floor(i / 3);
        const mx = size * (0.18 + (row % 4) * 0.18);
        const my = lane * size * (0.25 + (i % 2) * 0.12);
        ctx.beginPath(); ctx.arc(mx, my, Math.max(0.7, size * 0.055), 0, Math.PI * 2); ctx.fill();
      }

      const effect = (cfg.attackStyle || {}).effect;
      ctx.save();
      ctx.strokeStyle = weaponColor;
      ctx.fillStyle = weaponColor;
      ctx.lineWidth = Math.max(0.7, 1 / zoom + 0.25);
      if (effect === 'torpedo') {
        ctx.beginPath(); ctx.moveTo(size * 0.72, 0); ctx.lineTo(size * 1.25, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(size * 0.72, 0, size * 0.12, 0, Math.PI * 2); ctx.fill();
      } else if (effect === 'kinetic') {
        ctx.setLineDash([size * 0.15, size * 0.12]);
        ctx.beginPath(); ctx.moveTo(size * 0.35, -size * 0.14); ctx.lineTo(size * 1.18, -size * 0.14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(size * 0.35, size * 0.14); ctx.lineTo(size * 1.18, size * 0.14); ctx.stroke();
        ctx.setLineDash([]);
      } else if (effect === 'plasma') {
        ctx.beginPath(); ctx.arc(size * 0.45, 0, size * 0.2, 0, Math.PI * 2); ctx.fill();
      } else if (effect === 'fighter') {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.arc(size * 0.65, i * size * 0.28, size * 0.08, 0, Math.PI * 2); ctx.fill();
        }
      } else if (effect === 'super') {
        ctx.lineWidth *= 1.8;
        ctx.beginPath(); ctx.moveTo(-size * 0.25, 0); ctx.lineTo(size * 1.25, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(size * 0.25, 0, size * 0.36, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(size * 0.25, 0); ctx.lineTo(size * 1.22, 0); ctx.stroke();
      }
      ctx.restore();

      if (shield > 0.08) {
        ctx.strokeStyle = U.rgba('#5ce1e6', 0.35 + shield * 0.6);
        ctx.lineWidth = 1 / zoom + 0.35;
        ctx.beginPath(); ctx.arc(0, 0, size * 1.55, 0, Math.PI * 2); ctx.stroke();
      }
      if (hp < 0.7) {
        ctx.strokeStyle = 'rgba(255,245,190,0.9)';
        ctx.setLineDash([size * 0.18, size * 0.14]);
        ctx.beginPath(); ctx.arc(0, 0, size * 1.12, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    _drawFleets(ctx, vb) {
      const game = this.game;
      const cam = this.camera;
      const fog = game.viewFaction;
      const t = this.t;

      for (const f of game.fleets.fleets) {
        if (f.isEmpty()) continue;
        const battle = f.starId ? game.combat.byStar[f.starId] : null;
        const tacticalBattle = !!(battle && this.isTacticalView() && this._battleForFleet(f));
        const p = tacticalBattle ? this.fleetVisualPosition(f) : f.position(game.galaxy);
        if (p.x < vb.x0 || p.x > vb.x1 || p.y < vb.y0 || p.y > vb.y1) continue;

        const atStar = game.galaxy.get(f.starId);
        if (fog && !f.move) {
          const s = game.galaxy.get(f.starId);
          if (s && !s.explored[fog] && f.factionId !== fog) continue;
        }
        const faction = SW.FactionById[f.factionId];
        if (!faction) continue;
        const total = f.totalShips();

        const showTactical = tacticalBattle && this._tacticalFleetCount < Math.max(1, this.tacticalConfig.maxFleets || 10);
        if (showTactical) {
          this._tacticalFleetCount++;
          this._drawTacticalFleet(ctx, f, p, battle, faction);
          continue;
        }

        const size = Math.max(3.4, (2.6 + Math.sqrt(f.power) * 0.16) * (0.55 + cam.zoom * 0.8));

        /* 推进器尾焰（移动中） */
        if (f.move) {
          const m = f.move;
          const a = game.galaxy.get(m.path[m.seg]);
          const b = game.galaxy.get(m.path[m.seg + 1]);
          if (a && b) {
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            const tx = p.x - Math.cos(ang) * size * 2.4;
            const ty = p.y - Math.sin(ang) * size * 2.4;
            const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, size * 3);
            g.addColorStop(0, U.rgba(faction.glow, 0.75));
            g.addColorStop(1, U.rgba(faction.glow, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(tx, ty, size * 3, 0, Math.PI * 2); ctx.fill();
          }
        }

        /* 舰队主体 */
        const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.6);
        g2.addColorStop(0, U.rgba(faction.color, 0.95));
        g2.addColorStop(0.5, U.rgba(faction.color, 0.32));
        g2.addColorStop(1, U.rgba(faction.color, 0));
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 2.6, 0, Math.PI * 2); ctx.fill();

        /* 舰队图标：菱形 + 三角 */
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = faction.color;
        ctx.strokeStyle = U.rgba(faction.glow, 0.9);
        ctx.lineWidth = 1.2 / cam.zoom + 0.5;
        const hasCap = f.hasCapital();
        ctx.beginPath();
        if (hasCap) {
          // 六边形（含战略舰）
          for (let i = 0; i < 6; i++) {
            const ang = i * Math.PI / 3;
            const px = Math.cos(ang) * size, py = Math.sin(ang) * size;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
        } else {
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.82, size * 0.72);
          ctx.lineTo(-size * 0.82, size * 0.72);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        /* 超级旗舰光环 */
        if (f.flagshipCount() > 0) {
          const pulse = 1 + Math.sin(t * 3) * 0.12;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,225,140,0.85)';
          ctx.lineWidth = 2.4 / cam.zoom + 0.8;
          ctx.beginPath(); ctx.arc(p.x, p.y, size * 2.9 * pulse, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2 / cam.zoom + 0.4;
          ctx.beginPath(); ctx.arc(p.x, p.y, size * 3.6 * pulse, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        } else if (f.titanCount() > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,190,120,0.7)';
          ctx.lineWidth = 1.8 / cam.zoom + 0.6;
          ctx.beginPath(); ctx.arc(p.x, p.y, size * 2.6, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }

        /* 信息标签 */
        if (this.showLabels && cam.zoom > 0.55) {
          const fs = Math.max(8, 11 / cam.zoom * 0.7 + 3);
          ctx.save();
          ctx.font = fs + 'px "Segoe UI","Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = U.rgba(faction.glow, 0.95);
          ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
          const missionTag = this._missionTag(f.mission);
          ctx.fillText(f.name + ' · ' + total + '艘' + (missionTag ? ' · ' + missionTag : ''), p.x, p.y + size * 2.2 + fs + 2 / cam.zoom);
          ctx.restore();
        }
      }
    }

    _missionTag(m) {
      switch (m) {
        case 'attack': return '进攻';
        case 'defend': return '防守';
        case 'claim': return '殖民';
        case 'reinforce': return '增援';
        case 'retreat': return '撤退';
        case 'move': return '移动';
        default: return '';
      }
    }

    _drawEffects(ctx) {
      const E = this.effects;
      const cam = this.camera;

      /* 光束 */
      ctx.save();
      ctx.lineCap = 'round';
      for (const b of E.beams) {
        const k = 1 - b.t / b.life;
        const weapon = b.weapon || 'laser';
        const dx = b.x1 - b.x0, dy = b.y1 - b.y0;
        const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const nx = -dy / length, ny = dx / length;
        const drawLine = (alpha, width, offset, dash) => {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = b.color;
          ctx.lineWidth = width;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = weapon === 'superWeapon' ? 16 : 8;
          ctx.setLineDash(dash || []);
          ctx.beginPath();
          ctx.moveTo(b.x0 + nx * offset, b.y0 + ny * offset);
          ctx.lineTo(b.x1 + nx * offset, b.y1 + ny * offset);
          ctx.stroke();
        };
        const width = b.w * (0.5 + k) / Math.max(0.4, cam.zoom) * 0.7 + 0.6;
        if (weapon === 'ion') {
          drawLine(k * 0.9, width * 0.72, 0, [5 / Math.max(0.5, cam.zoom), 3 / Math.max(0.5, cam.zoom)]);
          drawLine(k * 0.45, width * 0.35, 0, []);
        } else if (weapon === 'darkmatter') {
          drawLine(k * 0.85, width * 1.15, 0, []);
          drawLine(k * 0.45, width * 0.45, width * 1.5, []);
          drawLine(k * 0.45, width * 0.45, -width * 1.5, []);
        } else if (weapon === 'superWeapon') {
          drawLine(k * 0.86, width * 1.8, 0, []);
          drawLine(k * 0.52, width * 0.5, width * 2.2, []);
          drawLine(k * 0.52, width * 0.5, -width * 2.2, []);
        } else if (weapon === 'plasma') {
          drawLine(k * 0.9, width * 1.35, 0, []);
          ctx.globalAlpha = k * 0.7;
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(b.x1, b.y1, width * 1.6, 0, Math.PI * 2); ctx.fill();
        } else if (weapon === 'massDriver' || weapon === 'railgun') {
          drawLine(k * 0.88, width * 0.62, 0, []);
          drawLine(k * 0.45, width * 0.38, width * 1.8, [2, 4]);
        } else if (weapon === 'fighter' || weapon === 'pointDefense') {
          drawLine(k * 0.72, width * 0.5, 0, [2, 3]);
          ctx.globalAlpha = k * 0.8;
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(b.x1, b.y1, width * 1.1, 0, Math.PI * 2); ctx.fill();
        } else {
          drawLine(k, width, 0, []);
        }
        ctx.setLineDash([]);
      }
      ctx.restore();

      /* 粒子（含鱼雷） */
      ctx.save();
      for (const p of E.particles) {
        const k = 1 - p.t / p.life;
        ctx.globalAlpha = k;
        if (p.kind === 'torpedo') {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color; ctx.shadowBlur = 8;
          const s = p.size / Math.max(0.5, cam.zoom) * 0.7 + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = k * 0.4;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = s * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          const dx = p.x1 - p.x0, dy = p.y1 - p.y0;
          const l = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          ctx.lineTo(p.x - dx / l * s * 5, p.y - dy / l * s * 5);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          const s = p.size / Math.max(0.5, cam.zoom) * 0.6 + 0.6;
          ctx.beginPath(); ctx.arc(p.x, p.y, s * k, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();

      /* 环 */
      ctx.save();
      for (const r of E.rings) {
        const k = r.t / r.life;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = (r.kind === 'shock' ? 2.6 : 1.8) / Math.max(0.4, cam.zoom) * 0.7 + 0.5;
        const rad = r.kind === 'shock' ? U.lerp(r.r, r.max, k) : r.r;
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();

      /* 漂浮文字 */
      ctx.save();
      ctx.textAlign = 'center';
      for (const tx of E.texts) {
        const k = 1 - tx.t / tx.life;
        ctx.globalAlpha = k;
        ctx.font = (tx.size / Math.max(0.6, cam.zoom) * 0.5 + 6) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
        ctx.fillStyle = tx.color;
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
        ctx.fillText(tx.str, tx.x, tx.y);
      }
      ctx.restore();
    }

    _drawHighlights(ctx) {
      const game = this.game;
      const cam = this.camera;
      const sel = game.selection;
      if (!sel) return;

      if (sel.type === 'star') {
        const s = game.galaxy.get(sel.id);
        if (!s) return;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / cam.zoom + 0.8;
        ctx.setLineDash([6 / cam.zoom + 3, 5 / cam.zoom + 3]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, ((s.typeDef.radius || 8) * s.sizeScale) * 5.4 + Math.sin(this.t * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (sel.type === 'fleet') {
        const f = game.fleets.get(sel.id);
        if (!f) return;
        const p = this.fleetVisualPosition(f);
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 / cam.zoom + 0.6;
        ctx.setLineDash([5 / cam.zoom + 2, 4 / cam.zoom + 2]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (2.6 + Math.sqrt(f.power) * 0.16) * 3.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    _inView(x0, y0, x1, y1, vb) {
      const minx = Math.min(x0, x1), maxx = Math.max(x0, x1);
      const miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
      return !(maxx < vb.x0 || minx > vb.x1 || maxy < vb.y0 || miny > vb.y1);
    }

    /* ---------------- 拾取 ---------------- */
    pick(sx, sy) {
      const game = this.game;
      const cam = this.camera;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const rect = this.canvas.getBoundingClientRect();
      const p = cam.screenToWorld(sx - rect.left, sy - rect.top);
      const tol = 26 / cam.zoom;

      /* 优先舰队 */
      let bestF = null, bestD = Infinity;
      for (const f of game.fleets.fleets) {
        if (f.isEmpty()) continue;
        const tacticalFleet = this.isTacticalView() && this._battleForFleet(f);
        const fp = tacticalFleet ? this.fleetVisualPosition(f) : f.position(game.galaxy);
        const d = U.dist(p.x, p.y, fp.x, fp.y);
        const fleetTol = tacticalFleet ? (this.tacticalConfig.fleetPickRadius || 24) : tol;
        if (d < fleetTol && d < bestD) { bestD = d; bestF = f; }
      }
      if (bestF) return { type: 'fleet', id: bestF.id, obj: bestF };

      let bestS = null, bestSD = tol * 1.3;
      for (const s of game.galaxy.stars) {
        const d = U.dist(p.x, p.y, s.x, s.y);
        if (d < bestSD) { bestSD = d; bestS = s; }
      }
      if (bestS) return { type: 'star', id: bestS.id, obj: bestS };
      return null;
    }
  }

  SW.Renderer = Renderer;
})(window.SW);
