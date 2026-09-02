/* ===========================================================
 *  SaveSystem —— 存档 / 读档 / 自动存档
 *  使用 localStorage（多个槽位），导出为 JSON
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  const PREFIX = 'stellar_war_save_';
  const AUTOSAVE = 'stellar_war_autosave';

  class SaveSystem {
    constructor(game) {
      this.game = game;
      this.version = 1;
    }

    /* ---------------- 生成快照 ---------------- */
    capture() {
      const g = this.game;
      return {
        version: this.version,
        savedAt: Date.now(),
        seed: g.seed,
        time: g.time.serialize(),
        galaxy: g.galaxy.serialize(),
        factions: g.factions.serialize(),
        fleets: g.fleets.serialize(),
        production: g.production.serialize(),
        combat: g.combat.serialize(),
        rngState: g.rng.getState(),
        log: g.events.log.slice(-300),
        gameOver: g.gameOver ? { winnerId: g.gameOver.winnerId, day: g.gameOver.day, stats: g.gameOver.stats } : null
      };
    }

    /* ---------------- 恢复 ---------------- */
    restore(data) {
      const g = this.game;
      if (!data) return false;
      g.seed = data.seed;
      g.rng = new SW.U.RNG(data.seed);
      if (data.rngState != null) g.rng.setState(data.rngState);

      g.galaxy.rng = g.rng;
      g.galaxy.deserialize(data.galaxy);
      g.factions.deserialize(data.factions);
      g.fleets.deserialize(data.fleets);
      g.production.deserialize(data.production);
      g.time.deserialize(data.time);
      if (data.combat) g.combat.deserialize(data.combat);
      if (data.log) { g.events.log = data.log; }
      g.gameOver = data.gameOver || null;

      /* 重建派生数据 */
      g.economy.recomputeAll();
      for (const s of g.galaxy.stars) {
        const f = s.owner ? g.factions.get(s.owner) : null;
        /* 读档只恢复派生上限，不应把存档中的战损防御瞬间补满。 */
        g.economy.recomputeDefense(s, f, false);
        s.recomputeShipyardCache();
      }
      for (const f of g.factions.list) f.recomputeMods();
      g.combat.scan();
      return true;
    }

    /* ---------------- 存储 ---------------- */
    save(slot) {
      try {
        const key = (slot === 'auto') ? AUTOSAVE : PREFIX + slot;
        const json = JSON.stringify(this.capture());
        localStorage.setItem(key, json);
        return { ok: true, size: json.length };
      } catch (e) {
        console.warn('[SaveSystem] 保存失败', e);
        return { ok: false, error: String(e) };
      }
    }

    load(slot) {
      try {
        const key = (slot === 'auto') ? AUTOSAVE : PREFIX + slot;
        const raw = localStorage.getItem(key);
        if (!raw) return { ok: false, error: '存档不存在' };
        const data = JSON.parse(raw);
        this.restore(data);
        return { ok: true };
      } catch (e) {
        console.warn('[SaveSystem] 读取失败', e);
        return { ok: false, error: String(e) };
      }
    }

    list() {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === AUTOSAVE) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            out.push({ slot: 'auto', savedAt: d.savedAt, era: this._eraOf(d) });
          } catch (e) { }
        } else if (k.indexOf(PREFIX) === 0) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            out.push({ slot: k.substring(PREFIX.length), savedAt: d.savedAt, era: this._eraOf(d) });
          } catch (e) { }
        }
      }
      out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return out;
    }

    _eraOf(d) {
      if (!d || !d.time) return '?';
      const cfg = SW.GalaxyConfig.time;
      return (cfg.startYear + d.time.day / cfg.daysPerYear).toFixed(1);
    }

    remove(slot) {
      const key = (slot === 'auto') ? AUTOSAVE : PREFIX + slot;
      localStorage.removeItem(key);
    }

    exportFile() {
      const data = JSON.stringify(this.capture());
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'stellar_war_' + Date.now() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    importFile(file, cb) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          this.restore(data);
          cb && cb({ ok: true });
        } catch (e) { cb && cb({ ok: false, error: String(e) }); }
      };
      reader.onerror = () => cb && cb({ ok: false, error: '读取文件失败' });
      reader.readAsText(file);
    }

    autosave() { return this.save('auto'); }
    hasAutosave() { return !!localStorage.getItem(AUTOSAVE); }
  }

  SW.SaveSystem = SaveSystem;
})(window.SW);
