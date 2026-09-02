/* ===========================================================
 *  GameTimeManager —— 银河时间系统
 *  1 现实秒（1x）= daysPerRealSecond 银河天
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  class GameTimeManager {
    constructor(cfg) {
      this.cfg = cfg;
      this.day = 0;               // 累计银河天
      this.speedIndex = this._defaultSpeedIndex();
      this._resumeSpeedIndex = this.speedIndex;
      this.paused = false;
      this._acc = 0;              // 未消化的模拟天数
      this._combatAcc = 0;
      this.totalRealSeconds = 0;
      this.stepsLastFrame = 0;
    }

    _defaultSpeedIndex() {
      const speeds = this.cfg.speeds || [];
      const configured = speeds.indexOf(this.cfg.defaultSpeed);
      if (configured >= 0 && speeds[configured] > 0) return configured;
      const firstActive = speeds.findIndex(s => s > 0);
      return firstActive >= 0 ? firstActive : 0;
    }

    _activeSpeedIndex(index) {
      const speeds = this.cfg.speeds || [];
      const i = Number.isFinite(index) ? Math.round(index) : -1;
      return i >= 0 && i < speeds.length && speeds[i] > 0 ? i : -1;
    }

    get speed() { return this.cfg.speeds[this.speedIndex] || 0; }
    get daysPerYear() { return this.cfg.daysPerYear; }
    get startYear() { return this.cfg.startYear; }

    setSpeedIndex(i) {
      const max = Math.max(0, this.cfg.speeds.length - 1);
      const next = Math.max(0, Math.min(max, Math.round(Number(i)) || 0));
      if (next === 0 || this.cfg.speeds[next] === 0) {
        const current = this._activeSpeedIndex(this.speedIndex);
        if (current >= 0) this._resumeSpeedIndex = current;
        else if (this._activeSpeedIndex(this._resumeSpeedIndex) < 0) this._resumeSpeedIndex = this._defaultSpeedIndex();
        this.speedIndex = 0;
        this.paused = true;
        this.stepsLastFrame = 0;
        return;
      }
      this.speedIndex = next;
      this._resumeSpeedIndex = next;
      this.paused = false;
    }

    setPaused(p) {
      if (p) {
        const current = this._activeSpeedIndex(this.speedIndex);
        if (current >= 0) this._resumeSpeedIndex = current;
        else if (this._activeSpeedIndex(this._resumeSpeedIndex) < 0) this._resumeSpeedIndex = this._defaultSpeedIndex();
        this.speedIndex = 0;
        this.paused = true;
        this.stepsLastFrame = 0;
        return;
      }
      const resume = this._activeSpeedIndex(this._resumeSpeedIndex) >= 0
        ? this._resumeSpeedIndex : this._defaultSpeedIndex();
      this.speedIndex = resume;
      this._resumeSpeedIndex = resume;
      this.paused = false;
    }

    togglePause() { this.setPaused(!this.paused); }

    year() { return this.startYear + Math.floor(this.day / this.daysPerYear); }
    yearFloat() { return this.startYear + this.day / this.daysPerYear; }
    dayOfYear() { return Math.floor(this.day % this.daysPerYear); }

    /** 显示用纪元字符串：2387.05 */
    eraString() {
      const y = Math.floor(this.yearFloat());
      const frac = this.yearFloat() - y;
      const m = Math.floor(frac * 12) + 1;
      return y + '.' + String(m).padStart(2, '0');
    }

    /** 推进时间，返回本帧需要执行的模拟步数 */
    advance(dtReal) {
      const dt = Number(dtReal);
      if (!Number.isFinite(dt) || dt <= 0) { this.stepsLastFrame = 0; return 0; }
      this.totalRealSeconds += dt;
      if (this.paused || this.speed === 0) { this.stepsLastFrame = 0; return 0; }
      const days = dt * this.cfg.daysPerRealSecond * this.speed;
      this._acc += days;
      const step = this.cfg.stepDays;
      let steps = Math.floor(this._acc / step);
      const max = this.cfg.maxStepsPerFrame;
      if (steps > max) { steps = max; this._acc = 0; }
      else { this._acc -= steps * step; }
      this.stepsLastFrame = steps;
      return steps;
    }

    /** 每执行一步调用，推进游戏内天数 */
    stepGame(stepDays) { this.day += stepDays; }

    serialize() {
      return {
        day: this.day,
        speedIndex: this.speedIndex,
        paused: this.paused,
        resumeSpeedIndex: this._resumeSpeedIndex,
        acc: this._acc,
        real: this.totalRealSeconds
      };
    }

    deserialize(d) {
      if (!d) return;
      this.day = d.day || 0;
      const savedIndex = d.speedIndex != null ? Number(d.speedIndex) : this._defaultSpeedIndex();
      const savedResume = d.resumeSpeedIndex != null ? Number(d.resumeSpeedIndex) : savedIndex;
      const isPaused = !!d.paused || savedIndex === 0;
      if (isPaused) {
        this.speedIndex = 0;
        this.paused = true;
        this._resumeSpeedIndex = this._activeSpeedIndex(savedResume) >= 0
          ? Math.round(savedResume) : this._defaultSpeedIndex();
      } else {
        const active = this._activeSpeedIndex(savedIndex);
        this.speedIndex = active >= 0 ? active : this._defaultSpeedIndex();
        this._resumeSpeedIndex = this.speedIndex;
        this.paused = false;
      }
      this._acc = Number.isFinite(Number(d.acc)) ? Math.max(0, Number(d.acc)) : 0;
      this.totalRealSeconds = Number.isFinite(Number(d.real)) ? Math.max(0, Number(d.real)) : 0;
      this.stepsLastFrame = 0;
    }
  }

  SW.GameTimeManager = GameTimeManager;
})(window.SW);
