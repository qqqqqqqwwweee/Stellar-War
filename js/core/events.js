/* ===========================================================
 *  EventSystem —— 银河事件总线 + 战争日志
 *  事件用于 UI 提示、自动观战镜头、日志、统计
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  class EventSystem {
    constructor() {
      this.listeners = {};
      this.log = [];          // 战争日志
      this.recent = [];       // 屏幕滚动提示
      this.maxLog = 600;
      this.maxRecent = 5;
      this._recentTimers = [];
    }

    on(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
      return this;
    }
    off(type, fn) {
      const l = this.listeners[type];
      if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
      return this;
    }

    /**
     * @param {string} type 事件类型
     * @param {object} data { text, factionId, starId, x, y, priority, category }
     */
    emit(type, data) {
      const ev = Object.assign({ type: type, day: 0, category: 'info', priority: 1 }, data || {});
      const l = this.listeners[type];
      if (l) for (let i = 0; i < l.length; i++) l[i](ev);
      const any = this.listeners['*'];
      if (any) for (let i = 0; i < any.length; i++) any[i](ev);
      return ev;
    }

    /** 记录到银河战争日志（带年份） */
    record(game, text, category, data) {
      const entry = Object.assign({
        year: game ? game.time.yearFloat() : 0,
        day: game ? game.time.day : 0,
        text: text,
        category: category || 'info',
        priority: 1
      }, data || {});
      this.log.push(entry);
      if (this.log.length > this.maxLog) this.log.shift();
      return entry;
    }

    /** 弹出一条屏幕提示（自动淡出） */
    notify(text, category, data) {
      const item = Object.assign({
        text: text, category: category || 'info', t: 0, life: 7.5, priority: 1
      }, data || {});
      this.recent.push(item);
      if (this.recent.length > this.maxRecent) this.recent.shift();
      return item;
    }

    update(dt) {
      for (let i = this.recent.length - 1; i >= 0; i--) {
        const r = this.recent[i];
        r.t += dt;
        if (r.t > r.life) this.recent.splice(i, 1);
      }
    }

    clear() { this.log.length = 0; this.recent.length = 0; }
  }

  SW.EventSystem = EventSystem;
})(window.SW);
