/* ===========================================================
 *  EffectsSystem —— 战斗特效粒子池
 *  激光束 / 导弹 / 鱼雷 / 爆炸 / 护盾闪烁 / 冲击波 / 漂浮文字
 *  统一对象池，硬上限，保证 1000+ 舰船时仍然流畅
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  const MAX_PARTICLES = 900;

  class EffectsSystem {
    constructor() {
      this.beams = [];       // 光束
      this.particles = [];   // 粒子
      this.rings = [];       // 冲击波 / 护盾环
      this.texts = [];       // 漂浮文字
      this.time = 0;
    }

    clear() { this.beams.length = 0; this.particles.length = 0; this.rings.length = 0; this.texts.length = 0; }

    /* ---------------- 生成 ---------------- */
    beam(x0, y0, x1, y1, color, width, life, weapon, starId, battleId) {
      if (this.beams.length > 140) return;
      const visual = (SW.CombatConfig && SW.CombatConfig.visual) || {};
      const defaultLife = weapon === 'superWeapon' ? (visual.superBeamLife || 0.82) : (visual.beamLife || 0.58);
      this.beams.push({ x0, y0, x1, y1, color: color || '#ff5d6c', w: width || 1.6, t: 0,
        life: life || defaultLife, weapon: weapon || 'laser', starId: starId || null, battleId: battleId || null });
    }

    torpedo(x0, y0, x1, y1, color, weapon, starId, battleId) {
      if (this.particles.length > MAX_PARTICLES) return;
      const visual = (SW.CombatConfig && SW.CombatConfig.visual) || {};
      const kind = weapon || 'torpedo';
      this.particles.push({
        kind: 'torpedo', x: x0, y: y0, x0, y0, x1, y1, t: 0,
        life: kind === 'missile' ? (visual.missileLife || 0.95) : (visual.torpedoLife || 1.35),
        color: color || '#ffb020', size: kind === 'missile' ? 2.2 : 3.6,
        weapon: kind, starId: starId || null, battleId: battleId || null
      });
    }

    explosion(x, y, scale, color) {
      const n = Math.min(26, Math.round(8 + scale * 6));
      for (let i = 0; i < n; i++) {
        if (this.particles.length > MAX_PARTICLES) break;
        const a = Math.random() * Math.PI * 2;
        const sp = (30 + Math.random() * 120) * (0.6 + scale * 0.5);
        this.particles.push({
          kind: 'spark', x: x, y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          t: 0, life: 0.5 + Math.random() * 0.7,
          color: color || '#ffb04d', size: (1 + Math.random() * 2.4) * (0.7 + scale * 0.4)
        });
      }
      const visual = (SW.CombatConfig && SW.CombatConfig.visual) || {};
      this.rings.push({ kind: 'shock', x, y, r: 2, max: 20 + scale * 22, t: 0,
        life: visual.explosionLife || 1.15, color: color || '#ffd08a' });
    }

    shieldFlash(x, y, r, color) {
      if (this.rings.length > 60) return;
      const visual = (SW.CombatConfig && SW.CombatConfig.visual) || {};
      this.rings.push({ kind: 'shield', x, y, r: r, t: 0,
        life: visual.shieldFlashLife || 0.62, color: color || '#5ce1e6' });
    }

    text(x, y, str, color, size) {
      if (this.texts.length > 40) this.texts.shift();
      this.texts.push({ x, y, str, color: color || '#ffffff', t: 0, life: 1.6, size: size || 13 });
    }

    /* ---------------- 更新 ---------------- */
    update(dt) {
      this.time += dt;

      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.t += dt;
        if (b.t >= b.life) this.beams.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.t += dt;
        if (p.kind === 'spark') {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= (1 - dt * 2.2); p.vy *= (1 - dt * 2.2);
        } else if (p.kind === 'torpedo') {
          const k = U.clamp(p.t / p.life, 0, 1);
          p.x = U.lerp(p.x0, p.x1, k);
          p.y = U.lerp(p.y0, p.y1, k);
        }
        if (p.t >= p.life) this.particles.splice(i, 1);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.t += dt;
        if (r.t >= r.life) this.rings.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.t += dt;
        t.y -= dt * 18;
        if (t.t >= t.life) this.texts.splice(i, 1);
      }
    }
  }

  SW.EffectsSystem = EffectsSystem;
})(window.SW);
