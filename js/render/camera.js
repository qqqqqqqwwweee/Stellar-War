/* ===========================================================
 *  CameraController —— 拖拽平移 / 滚轮缩放 / 跟随 / 自动观战
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  class CameraController {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.game = game;
      const cfg = (SW.GalaxyConfig && SW.GalaxyConfig.camera) || {};
      this.x = 0;          // 世界坐标中心
      this.y = 0;
      this.minZoom = Number.isFinite(cfg.minZoom) ? cfg.minZoom : 0.12;
      this.maxZoom = Math.max(this.minZoom, Number.isFinite(cfg.maxZoom) ? cfg.maxZoom : 4.5);
      this.defaultZoom = U.clamp(Number.isFinite(cfg.defaultZoom) ? cfg.defaultZoom : 0.5, this.minZoom, this.maxZoom);
      this.wheelSensitivity = Number.isFinite(cfg.wheelSensitivity) ? cfg.wheelSensitivity : 0.0018;
      this.zoomSmoothRate = Number.isFinite(cfg.zoomSmoothRate) ? cfg.zoomSmoothRate : 10;
      this.tacticalZoom = U.clamp(Number.isFinite(cfg.tacticalZoom) ? cfg.tacticalZoom : 1.05, this.minZoom, this.maxZoom);
      this.battleFocusZoom = U.clamp(Number.isFinite(cfg.battleFocusZoom) ? cfg.battleFocusZoom : 1.35, this.tacticalZoom, this.maxZoom);
      this.zoom = this.defaultZoom;
      this.targetZoom = this.defaultZoom;
      this.drag = null;
      this.follow = null;      // 跟随的舰队 id
      this.autoSpectate = false;
      this.autoTarget = null;  // {x,y,timer}
      this.autoTimer = 0;
      this.shake = 0;
      this.userInteracted = false;
      this._bind();
    }

    _eventPoint(e) {
      const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
      const x = Number.isFinite(e.clientX) ? e.clientX - (rect.left || 0) : (Number.isFinite(e.offsetX) ? e.offsetX : this.canvas.clientWidth / 2);
      const y = Number.isFinite(e.clientY) ? e.clientY - (rect.top || 0) : (Number.isFinite(e.offsetY) ? e.offsetY : this.canvas.clientHeight / 2);
      return { x: x, y: y };
    }

    _touchCenter(touches) {
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2 - (this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect().left || 0 : 0),
        y: (touches[0].clientY + touches[1].clientY) / 2 - (this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect().top || 0 : 0)
      };
    }

    /** 以屏幕坐标为锚点缩放，按钮调用时省略坐标即以视口中心缩放。 */
    zoomBy(factor, sx, sy) {
      const f = Number(factor);
      if (!Number.isFinite(f) || f <= 0) return false;
      const x = Number.isFinite(sx) ? sx : this.canvas.clientWidth / 2;
      const y = Number.isFinite(sy) ? sy : this.canvas.clientHeight / 2;
      const before = this.screenToWorld(x, y);
      const next = U.clamp(this.targetZoom * f, this.minZoom, this.maxZoom);
      if (next === this.targetZoom) return false;
      this.targetZoom = next;
      /* 立即同步当前倍率，避免平滑插值破坏鼠标锚点。 */
      this.zoom = next;
      const after = this.screenToWorld(x, y);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
      this.follow = null;
      this.autoSpectate = false;
      this.autoTarget = null;
      this.userInteracted = true;
      return true;
    }

    setZoom(zoom, sx, sy) {
      const next = U.clamp(Number(zoom), this.minZoom, this.maxZoom);
      if (!Number.isFinite(next)) return false;
      const base = Math.max(0.0001, this.targetZoom);
      return this.zoomBy(next / base, sx, sy);
    }

    _bind() {
      const c = this.canvas;
      let lastTouchDist = 0;

      c.addEventListener('mousedown', (e) => {
        if (e.button === 0) { this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; this.userInteracted = true; }
      });
      window.addEventListener('mousemove', (e) => {
        if (!this.drag) return;
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        if (this.drag.moved > 6) { this.follow = null; this.autoSpectate = false; }
      });
      window.addEventListener('mouseup', () => { this.drag = null; });

      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const p = this._eventPoint(e);
        let delta = Number(e.deltaY) || 0;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= Math.max(1, this.canvas.clientHeight);
        delta = U.clamp(delta, -240, 240);
        this.zoomBy(Math.exp(-delta * this.wheelSensitivity), p.x, p.y);
      }, { passive: false });

      /* 双指缩放 */
      c.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          lastTouchDist = this._touchDist(e.touches);
          this.drag = null;
        } else if (e.touches.length === 1) {
          this.drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: 0 };
        }
      }, { passive: false });
      c.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const d = this._touchDist(e.touches);
          if (lastTouchDist > 0) {
            const p = this._touchCenter(e.touches);
            this.zoomBy(d / lastTouchDist, p.x, p.y);
          }
          lastTouchDist = d;
        } else if (e.touches.length === 1 && this.drag) {
          const dx = e.touches[0].clientX - this.drag.x;
          const dy = e.touches[0].clientY - this.drag.y;
          this.drag.moved += Math.abs(dx) + Math.abs(dy);
          this.x -= dx / this.zoom;
          this.y -= dy / this.zoom;
          this.drag.x = e.touches[0].clientX; this.drag.y = e.touches[0].clientY;
        }
      }, { passive: true });
      c.addEventListener('touchend', () => { this.drag = null; lastTouchDist = 0; });
    }

    _touchDist(t) {
      const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    update(dt) {
      /* 平滑缩放 */
      this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * this.zoomSmoothRate);

      /* 跟随舰队 */
      if (this.follow) {
        const f = this.game.fleets.get(this.follow);
        if (!f) this.follow = null;
        else {
          const p = f.position(this.game.galaxy);
          this.x += (p.x - this.x) * Math.min(1, dt * 4);
          this.y += (p.y - this.y) * Math.min(1, dt * 4);
        }
      }

      /* 自动观战 */
      if (this.autoSpectate) {
        this.autoTimer -= dt;
        if (this.autoTarget) {
          this.x += (this.autoTarget.x - this.x) * Math.min(1, dt * 2.2);
          this.y += (this.autoTarget.y - this.y) * Math.min(1, dt * 2.2);
          const tz = this.autoTarget.zoom || 0.8;
          this.targetZoom += (tz - this.targetZoom) * Math.min(1, dt * 1.5);
        }
        if (this.autoTimer <= 0) this.pickNextEvent();
      }

      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    /** 自动观战：选择下一个重要事件 */
    pickNextEvent() {
      const game = this.game;
      let best = null, bestScore = -Infinity;

      /* 1) 进行中的战斗（规模越大越优先） */
      for (const b of game.combat.battles) {
        const star = game.galaxy.get(b.starId);
        if (!star) continue;
        const scale = b.peakPower || b.intensity || 0;
        let score = 60 + Math.min(120, scale * 0.35);
        if (star.isHome) score += 60;
        if (star.isChoke) score += 20;
        if (game.rng.next() < 0.5) score += game.rng.range(0, 25);
          if (score > bestScore) { bestScore = score; best = { x: star.x, y: star.y, zoom: this.battleFocusZoom, dur: 6 + game.rng.range(0, 4) }; }
      }

      /* 2) 移动中的大型舰队 */
      for (const f of game.fleets.fleets) {
        if (!f.move || f.power < 120) continue;
        const p = f.position(game.galaxy);
        const score = 30 + Math.min(60, f.power * 0.06) + (f.hasCapital() ? 40 : 0);
        if (score > bestScore) { bestScore = score; best = { x: p.x, y: p.y, zoom: 0.7, dur: 5 + game.rng.range(0, 3) }; }
      }

      /* 3) 前线的星系占领 */
      for (const s of game.galaxy.stars) {
        if (s.capture) {
          const score = 45 + s.strategicValue * 0.1;
          if (score > bestScore) { bestScore = score; best = { x: s.x, y: s.y, zoom: 0.8, dur: 4 }; }
        }
      }

      /* 4) 兜底：随机巡视一个重要星系 */
      if (!best) {
        const cands = game.galaxy.stars.filter(s => s.owner !== null || s.isChoke);
        if (cands.length) {
          const s = cands[Math.floor(game.rng.next() * cands.length)];
          best = { x: s.x, y: s.y, zoom: 0.45, dur: 6 };
        } else best = { x: 0, y: 0, zoom: 0.4, dur: 6 };
      }

      this.autoTarget = best;
      this.autoTimer = best.dur;
    }

    /** 立即把镜头对准某事件 */
    focusOn(x, y, zoom, duration) {
      const wanted = Number.isFinite(zoom) ? zoom : Math.max(this.targetZoom, this.tacticalZoom);
      this.autoTarget = { x: x, y: y, zoom: U.clamp(wanted, this.minZoom, this.maxZoom) };
      this.autoTimer = duration || 5;
      if (this.autoSpectate) {
        // 自动模式下平滑过渡
      } else {
        this.x = x; this.y = y;
        this.targetZoom = this.autoTarget.zoom;
      }
    }

    /** 点击战斗舰队或战斗事件时使用，确保进入战术近景。 */
    focusBattle(starId, duration) {
      const star = this.game.galaxy.get(starId);
      if (!star) return false;
      this.follow = null;
      this.autoSpectate = false;
      this.autoTarget = null;
      this.x = star.x;
      this.y = star.y;
      this.targetZoom = Math.max(this.targetZoom, this.battleFocusZoom);
      this.targetZoom = U.clamp(this.targetZoom, this.minZoom, this.maxZoom);
      this.userInteracted = true;
      if (duration) this.autoTimer = duration;
      return true;
    }

    centerOn(x, y) {
      this.x = x; this.y = y; this.follow = null; this.autoSpectate = false; this.autoTarget = null; this.userInteracted = true;
    }

    fitGalaxy() {
      const R = SW.GalaxyConfig.radius;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      this.x = 0; this.y = 0;
      this.targetZoom = U.clamp(Math.min(w, h) / (R * 2.35), this.minZoom, this.maxZoom);
      this.zoom = this.targetZoom;
      this.follow = null;
      this.autoSpectate = false;
      this.autoTarget = null;
      this.userInteracted = true;
    }

    worldToScreen(wx, wy) {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const sx = (wx - this.x) * this.zoom + w / 2;
      const sy = (wy - this.y) * this.zoom + h / 2;
      return { x: sx, y: sy };
    }
    screenToWorld(sx, sy) {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const zoom = Math.max(0.0001, this.zoom);
      return { x: (sx - w / 2) / zoom + this.x, y: (sy - h / 2) / zoom + this.y };
    }

    /** 当前可见世界范围 */
    viewBounds(pad) {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const p = pad || 80;
      const tl = this.screenToWorld(-p, -p);
      const br = this.screenToWorld(w + p, h + p);
      return { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y };
    }

    applyTransform(ctx) {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      let sx = 0, sy = 0;
      if (this.shake > 0) {
        sx = (Math.random() - 0.5) * this.shake * 8;
        sy = (Math.random() - 0.5) * this.shake * 8;
      }
      ctx.translate(w / 2 + sx, h / 2 + sy);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x, -this.y);
    }
  }

  SW.CameraController = CameraController;
})(window.SW);
