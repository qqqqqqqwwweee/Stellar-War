/* ===========================================================
 *  UIManager —— HUD、信息面板、事件日志、科技树、统计、存档界面
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const U = SW.U;

  const MISSION_NAME = {
    idle: '待命', move: '移动中', attack: '进攻', defend: '防守',
    claim: '殖民/占领', retreat: '撤退', reinforce: '增援', patrol: '巡逻'
  };
  const ROLE_NAME = {
    recon: '侦察', rapid: '快速反应', main: '主力', expedition: '远征',
    defense: '防御', carrier: '航母', titan: '泰坦', flagship: '旗舰'
  };

  class UIManager {
    constructor(game) {
      this.game = game;
      this.el = {};
      this.logFilter = 'all';
      this._logRendered = 0;
      this._notifyRendered = 0;
      this._cacheDom();
      this._bindTopbar();
      this._bindZoomControls();
      this._bindCanvas();
      this._bindModal();
      this._lastSelKey = '';
    }

    _cacheDom() {
      const id = (x) => document.getElementById(x);
      this.el = {
        canvas: id('galaxy'),
        era: id('era'), speeds: id('speeds'), resources: id('resources'),
        factionTabs: id('factionTabs'), tools: id('tools'),
        leftPanel: id('leftPanel'), rightPanel: id('rightPanel'),
        zoomControls: id('zoomControls'), zoomOut: id('zoomOut'), zoomValue: id('zoomValue'),
        zoomIn: id('zoomIn'), zoomFit: id('zoomFit'),
        notifyArea: id('notifyArea'), log: id('log'), logTabs: id('logTabs'),
        perf: id('perfBox'), modal: id('modal'), modalBox: id('modalBox'),
        victory: id('victoryScreen'), victoryBox: id('victoryBox')
      };
    }

    _bindZoomControls() {
      const g = this.game;
      if (!this.el.zoomOut || !this.el.zoomIn) return;
      this.el.zoomOut.onclick = () => { g.camera.zoomBy(0.8); this.refresh(); };
      this.el.zoomIn.onclick = () => { g.camera.zoomBy(1.25); this.refresh(); };
      if (this.el.zoomValue) this.el.zoomValue.onclick = () => { g.camera.setZoom(g.camera.defaultZoom); this.refresh(); };
      if (this.el.zoomFit) this.el.zoomFit.onclick = () => { g.camera.fitGalaxy(); this.refresh(); };
    }

    /* ================= 顶栏 ================= */
    _bindTopbar() {
      const g = this.game;

      /* 速度按钮 */
      this.el.speeds.innerHTML = '';
      SW.GalaxyConfig.time.speeds.forEach((s, i) => {
        const b = document.createElement('button');
        b.className = 'speed-btn';
        b.textContent = s === 0 ? '❚❚' : s + 'x';
        b.title = s === 0 ? '暂停 (空格)' : s + ' 倍速';
        b.onclick = () => { g.time.setSpeedIndex(i); this.refreshSpeeds(); };
        this.el.speeds.appendChild(b);
      });

      /* 资源条 */
      this.el.resources.innerHTML = '';
      this.resEls = {};
      for (const k of SW.ResourceConfig.order) {
        const d = SW.ResourceConfig.defs[k];
        const c = document.createElement('div');
        c.className = 'res-chip ' + k;
        c.innerHTML = '<span class="ic">' + d.icon + '</span><span class="val">0</span><span class="rate">+0</span>';
        c.title = d.name;
        this.el.resources.appendChild(c);
        this.resEls[k] = { val: c.querySelector('.val'), rate: c.querySelector('.rate'), root: c };
      }

      /* 势力标签 */
      this.el.factionTabs.innerHTML = '';
      this.facTabs = {};
      for (const f of g.factions.list) {
        const t = document.createElement('div');
        t.className = 'fac-tab';
        t.innerHTML = '<span class="dot" style="background:' + f.color + ';box-shadow:0 0 8px ' + f.color + '"></span>' + f.cfg.shortName;
        t.onclick = () => { g.resourceView = f.id; this.refresh(); };
        this.el.factionTabs.appendChild(t);
        this.facTabs[f.id] = t;
      }

      /* 工具按钮 */
      const tools = [
        { key: 'auto', text: '自动观战', title: '摄像机自动追踪最重要的银河事件', toggle: true },
        { key: 'fog', text: '势力视角', title: '开启战争迷雾：只能看到所选势力已探索的区域', toggle: true },
        { key: 'fit', text: '全银河', title: '缩放至整个银河 (F)', toggle: false },
        { key: 'tech', text: '科技', title: '查看科技树', toggle: false },
        { key: 'stats', text: '统计', title: '势力统计与排名', toggle: false },
        { key: 'save', text: '存档', title: '保存 / 读取 / 导出', toggle: false },
        { key: 'new', text: '新银河', title: '重新生成一个全新的银河', toggle: false },
        { key: 'help', text: '?', title: '操作说明', toggle: false }
      ];
      this.el.tools.innerHTML = '';
      this.toolBtns = {};
      for (const t of tools) {
        const b = document.createElement('button');
        b.className = 'tool-btn';
        b.textContent = t.text;
        b.title = t.title;
        b.onclick = () => this._onTool(t.key);
        this.el.tools.appendChild(b);
        this.toolBtns[t.key] = b;
      }
    }

    _onTool(key) {
      const g = this.game;
      switch (key) {
        case 'auto':
          g.camera.autoSpectate = !g.camera.autoSpectate;
          if (g.camera.autoSpectate) { g.camera.follow = null; g.camera.pickNextEvent(); }
          break;
        case 'fog':
          if (g.viewFaction) g.viewFaction = null;
          else g.viewFaction = g.resourceView;
          break;
        case 'fit': g.camera.fitGalaxy(); break;
        case 'tech': this.showTech(); break;
        case 'stats': this.showStats(); break;
        case 'save': this.showSaves(); break;
        case 'new': this.showNewGame(); break;
        case 'help': this.showHelp(); break;
      }
      this.refresh();
    }

    refreshSpeeds() {
      const g = this.game;
      const btns = this.el.speeds.children;
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', i === g.time.speedIndex);
      }
    }

    /* ================= 画布交互 ================= */
    _bindCanvas() {
      const g = this.game;
      const c = this.el.canvas;
      let downPos = null, lastClick = 0, lastId = null;

      c.addEventListener('mousedown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
      c.addEventListener('mouseup', (e) => {
        if (!downPos) return;
        const moved = Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y);
        downPos = null;
        if (moved > 6) return;
        const hit = g.renderer.pick(e.clientX, e.clientY);
        if (!hit) { g.select(null); this.refresh(); return; }
        const now = performance.now();
        if (now - lastClick < 320 && lastId === hit.id && hit.type === 'fleet') {
          g.doubleClickFleet(hit.id);
        }
        lastClick = now; lastId = hit.id;
        g.select({ type: hit.type, id: hit.id });
        g.camera.autoSpectate = false;
        this.toolBtns.auto.classList.remove('on');
        this.refresh();
      });
      c.addEventListener('mousemove', (e) => {
        const hit = g.renderer.pick(e.clientX, e.clientY);
        g.renderer.hoverStar = hit && hit.type === 'star' ? hit.id : null;
        g.renderer.hoverFleet = hit && hit.type === 'fleet' ? hit.id : null;
        c.style.cursor = hit ? 'pointer' : 'grab';
      });
      c.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const hit = g.renderer.pick(e.clientX, e.clientY);
        if (hit && hit.type === 'star') {
          g.camera.centerOn(hit.obj.x, hit.obj.y);
          g.camera.targetZoom = Math.max(0.8, g.camera.targetZoom);
        }
      });
    }

    /* ================= 键盘 ================= */
    bindKeys() {
      window.addEventListener('keydown', (e) => {
        const g = this.game;
        if (e.target && /input|textarea/i.test(e.target.tagName)) return;
        switch (e.code) {
          case 'Space': e.preventDefault(); g.time.togglePause(); this.refreshSpeeds(); break;
          case 'Digit1': g.time.setSpeedIndex(1); this.refreshSpeeds(); break;
          case 'Digit2': g.time.setSpeedIndex(2); this.refreshSpeeds(); break;
          case 'Digit3': g.time.setSpeedIndex(3); this.refreshSpeeds(); break;
          case 'Digit4': g.time.setSpeedIndex(4); this.refreshSpeeds(); break;
          case 'Digit5': g.time.setSpeedIndex(5); this.refreshSpeeds(); break;
          case 'Equal': case 'NumpadAdd': g.camera.zoomBy(1.25); this.refresh(); break;
          case 'Minus': case 'NumpadSubtract': g.camera.zoomBy(0.8); this.refresh(); break;
          case 'Digit0': g.camera.setZoom(g.camera.defaultZoom); this.refresh(); break;
          case 'KeyF': g.camera.fitGalaxy(); break;
          case 'KeyA': this._onTool('auto'); break;
          case 'KeyT': this.showTech(); break;
          case 'KeyS': this.showStats(); break;
          case 'KeyV': this._onTool('fog'); break;
          case 'Escape': this.closeModal(); break;
        }
      });
    }

    /* ================= 刷新 ================= */
    refresh() {
      this._refreshTop();
      this._refreshLeft();
      this._refreshRight();
      this._refreshNotify();
      this._refreshLog();
      this._refreshPerf();
      this._refreshVictory();
    }

    _refreshTop() {
      const g = this.game;
      const t = g.time;
      this.el.era.innerHTML = t.eraString() + '<small>银河纪元 · 第 ' + Math.floor(t.day) + ' 天</small>';

      const f = g.factions.get(g.resourceView) || g.factions.list[0];
      if (f) {
        for (const k of SW.ResourceConfig.order) {
          const e = this.resEls[k];
          e.val.textContent = U.fmt(f.res[k]);
          const inc = f.income[k] || 0;
          e.rate.textContent = (inc >= 0 ? '+' : '') + U.fmt(inc) + '/天';
          e.root.style.borderColor = U.rgba(SW.ResourceConfig.defs[k].color, 0.28);
        }
      }
      for (const fac of g.factions.list) {
        const tab = this.facTabs[fac.id];
        if (!tab) continue;
        tab.classList.toggle('active', fac.id === g.resourceView);
        tab.classList.toggle('dead', fac.defeated);
      }
      this.toolBtns.auto.classList.toggle('on', g.camera.autoSpectate);
      this.toolBtns.fog.classList.toggle('on', !!g.viewFaction);
      this.refreshSpeeds();
      this._refreshZoom();
    }

    _refreshZoom() {
      const value = this.el.zoomValue;
      if (!value) return;
      const cam = this.game.camera;
      const pct = Math.round(cam.zoom * 100);
      const tactical = cam.zoom >= cam.tacticalZoom;
      value.textContent = (tactical ? '战术 ' : '缩放 ') + pct + '%';
      value.title = tactical
        ? '战术近景已开启：显示参战舰船与交火轨迹'
        : '当前地图缩放 ' + pct + '%；继续放大可查看战术近景';
      value.classList.toggle('tactical', tactical);
    }

    _refreshLeft() {
      const g = this.game;
      const powers = g.factions.totalPower(g.fleets);
      const maxPower = Math.max(1, ...Object.values(powers));
      const maxStars = Math.max(1, ...g.factions.list.map(f => g.galaxy.starsOf(f.id).length));
      const maxTech = Math.max(1, ...g.factions.list.map(f => f.techCount));

      let html = '';
      for (const f of g.factions.list) {
        const stars = g.galaxy.starsOf(f.id).length;
        const titans = g.production.countCapital(f, 'titan');
        const flag = g.production.countCapital(f, 'flagship');
        html += '<div class="fac-card' + (f.defeated ? ' dead' : '') + (f.id === g.resourceView ? ' active' : '') +
          '" style="border-left-color:' + f.color + '" data-fac="' + f.id + '">';
        html += '<h4><span style="color:' + f.color + '">●</span>' + f.cfg.shortName +
          '<span class="tag">' + (f.defeated ? '已灭亡' : f.ai.phase === 'early' ? '早期' : f.ai.phase === 'mid' ? '中期' : '后期') +
          ' · ' + (f.ai.posture === 'attack' ? '进攻' : f.ai.posture === 'defend' ? '防守' : '发展') + '</span></h4>';
        html += '<div class="fac-row"><span>恒星系</span><b>' + stars + '</b></div>';
        html += '<div class="fac-bar"><i style="width:' + (stars / maxStars * 100) + '%;background:' + f.color + '"></i></div>';
        html += '<div class="fac-row"><span>舰队战力</span><b>' + U.fmt(powers[f.id] || 0) + '</b></div>';
        html += '<div class="fac-bar"><i style="width:' + ((powers[f.id] || 0) / maxPower * 100) + '%;background:' + f.glowColor + '"></i></div>';
        html += '<div class="fac-row"><span>科技</span><b>' + f.techCount + '</b></div>';
        html += '<div class="fac-bar"><i style="width:' + (f.techCount / maxTech * 100) + '%;background:#5ce1e6"></i></div>';
        html += '<div class="fac-row"><span>泰坦 / 旗舰</span><b>' + titans + ' / ' + flag + '</b></div>';
        const cur = f.tech.current;
        html += '<div class="fac-row"><span>研究中</span><b style="font-size:10.5px">' +
          (cur ? (SW.TechById[cur.id] ? SW.TechById[cur.id].name : '?') : '—') + '</b></div>';
        html += '</div>';
      }
      this.el.leftPanel.innerHTML = html;
      const cards = this.el.leftPanel.querySelectorAll('.fac-card');
      cards.forEach(c => {
        c.onclick = () => { this.game.resourceView = c.dataset.fac; this.refresh(); };
      });
    }

    _refreshRight() {
      const g = this.game;
      const sel = g.selection;
      const panel = this.el.rightPanel;
      if (!sel) { panel.classList.remove('show'); this._lastSelKey = ''; return; }
      let key = sel.type + ':' + sel.id;
      let html = '';
      if (sel.type === 'star') html = this._starPanel(g.galaxy.get(sel.id));
      else html = this._fleetPanel(g.fleets.get(sel.id));
      if (!html) { panel.classList.remove('show'); return; }
      panel.classList.add('show');
      panel.innerHTML = html;
      panel.querySelectorAll('[data-fleet]').forEach((item) => {
        item.onclick = () => {
          const fleet = g.fleets.get(item.dataset.fleet);
          if (!fleet) return;
          g.select({ type: 'fleet', id: fleet.id });
          this.refresh();
        };
      });
      this._lastSelKey = key;
    }

    _starPanel(s) {
      if (!s) return '';
      const g = this.game;
      const td = s.typeDef, fd = s.featureDef;
      let h = '';
      h += '<h3>' + esc(s.name) + (s.isHome ? ' ★' : '') + '</h3>';
      h += '<div class="sub">' + td.name + (fd && fd.name ? ' · ' + fd.name : '') +
        ' · ' + s.devName + '（Lv.' + s.devLevel + '）</div>';

      const owner = s.owner ? SW.FactionById[s.owner] : null;
      h += '<div class="kv"><span>归属</span><b style="color:' + (owner ? owner.color : '#8fa3b8') + '">' +
        (owner ? owner.name : '中立星系') + '</b></div>';
      h += '<div class="kv"><span>开发等级</span><b>' + s.devLevel + ' / ' + SW.GalaxyConfig.devLevel.max + '</b></div>';
      h += '<div class="kv"><span>战略价值</span><b>' + s.strategicValue + (s.isChoke ? ' · 瓶颈' : '') + (s.isHub ? ' · 枢纽' : '') + '</b></div>';
      h += '<div class="kv"><span>航道连接</span><b>' + s.degree + ' 条</b></div>';

      h += '<div class="sec-title">资源产出（每日）</div>';
      const ownerF = s.owner ? g.factions.get(s.owner) : null;
      const y = g.economy.starYield(s, ownerF);
      for (const k of SW.ResourceConfig.order) {
        const d = SW.ResourceConfig.defs[k];
        h += '<div class="kv"><span style="color:' + d.color + '">' + d.icon + ' ' + d.name + '</span><b>' + U.fmt(y[k]) + '</b></div>';
      }

      h += '<div class="sec-title">防御</div>';
      const maxD = Math.max(1, s.defenseMaxHp);
      h += '<div class="kv"><span>防御设施</span><b>' + Math.round(s.defenseHp) + ' / ' + Math.round(s.defenseMaxHp) + '</b></div>';
      h += '<div class="bar"><i style="width:' + (s.defenseHp / maxD * 100) + '%;background:#ff8a8a"></i></div>';
      if (s.starShieldMax > 0) {
        h += '<div class="kv"><span>星系护盾</span><b>' + Math.round(s.starShield) + ' / ' + Math.round(s.starShieldMax) + '</b></div>';
        h += '<div class="bar"><i style="width:' + (s.starShield / Math.max(1, s.starShieldMax) * 100) + '%;background:#5ce1e6"></i></div>';
      }

      h += '<div class="sec-title">建筑（' + s.buildings.length + ' / ' + s.slots() + '）</div>';
      h += '<div class="chip-list">';
      if (!s.buildings.length) h += '<span class="chip q">无</span>';
      for (const b of s.buildings) {
        const cfg = SW.BuildingConfig[b.id];
        if (!cfg) continue;
        h += '<span class="chip" title="' + esc(cfg.desc) + '">' + cfg.icon + ' ' + cfg.name + '</span>';
      }
      for (const q of s.queue) {
        if (q.kind === 'building') h += '<span class="chip q">⏳ ' + SW.BuildingConfig[q.id].name + ' ' + Math.round((1 - q.remaining / q.total) * 100) + '%</span>';
        else h += '<span class="chip q">⏫ 升级至 Lv.' + (q.level + 1) + ' ' + Math.round((1 - q.remaining / q.total) * 100) + '%</span>';
      }
      h += '</div>';

      /* 船坞 */
      if (s.shipyardSlots > 0) {
        h += '<div class="sec-title">船坞（' + s.shipyardSlots + ' 条生产线 · Lv.' + s.shipyardLevel + '）</div>';
        const lines = g.production.lines[s.id] || [];
        h += '<div class="chip-list">';
        if (!lines.length) h += '<span class="chip q">空闲</span>';
        for (const l of lines) {
          const cfg = SW.ShipConfig[l.shipId];
          h += '<span class="chip' + (cfg.capital ? ' cap' : '') + '">' + cfg.name + (l.name ? '「' + esc(l.name) + '」' : '') +
            ' ' + Math.round((1 - l.remaining / l.total) * 100) + '%</span>';
        }
        h += '</div>';
      }

      /* 驻扎舰队 */
      const fleets = g.fleets.fleetsAt(s.id);
      h += '<div class="sec-title">驻扎舰队（' + fleets.length + '）</div>';
      if (!fleets.length) h += '<div class="kv" style="color:#61789a">无</div>';
      for (const f of fleets) {
        const fc = SW.FactionById[f.factionId];
        h += '<div class="kv" data-fleet="' + f.id + '" style="cursor:pointer"><span style="color:' + fc.color + '">' +
          esc(f.name) + '</span><b>' + U.fmt(f.power) + '</b></div>';
      }

      if (s.capture) {
        h += '<div class="sec-title">占领中</div>';
        const cf = SW.FactionById[s.capture.factionId];
        h += '<div class="kv"><span style="color:' + cf.color + '">' + cf.shortName + '</span><b>' +
          Math.round(s.capture.progress / s.capture.total * 100) + '%</b></div>';
        h += '<div class="bar"><i style="width:' + (s.capture.progress / s.capture.total * 100) + '%;background:' + cf.color + '"></i></div>';
      }

      return h;
    }

    _fleetPanel(f) {
      if (!f) return '';
      const g = this.game;
      const fc = SW.FactionById[f.factionId];
      let h = '';
      h += '<h3 style="color:' + fc.color + '">' + esc(f.name) + '</h3>';
      h += '<div class="sub">' + fc.name + ' · ' + (ROLE_NAME[f.role] || f.role) + '舰队</div>';
      h += '<div class="kv"><span>战斗力</span><b>' + U.fmt(f.power) + '</b></div>';
      h += '<div class="kv"><span>舰船总数</span><b>' + f.totalShips() + '</b></div>';
      h += '<div class="kv"><span>任务</span><b>' + (MISSION_NAME[f.mission] || f.mission) + '</b></div>';
      if (f.move) {
        const dest = g.galaxy.get(f.move.path[f.move.path.length - 1]);
        h += '<div class="kv"><span>目标</span><b>' + (dest ? esc(dest.name) : '—') + '</b></div>';
      } else {
        h += '<div class="kv"><span>位置</span><b>' + (g.galaxy.get(f.starId) ? esc(g.galaxy.get(f.starId).name) : '航道中') + '</b></div>';
      }

      h += '<div class="sec-title">舰船组成</div>';
      h += '<div class="chip-list">';
      const sorted = f.units.slice().sort((a, b) => SW.ShipConfig[b.shipId].tier - SW.ShipConfig[a.shipId].tier);
      for (const u of sorted) {
        const cfg = SW.ShipConfig[u.shipId];
        const hpPct = Math.round(u.hp / (u.count * u.maxHp) * 100);
        h += '<span class="chip' + (cfg.capital ? ' cap' : '') + '" title="' + esc(cfg.desc) + '">' +
          (u.name ? esc(u.name) : cfg.name + ' ×' + u.count) +
          (cfg.capital ? ' ' + hpPct + '%' : ' ×' + u.count) + '</span>';
      }
      h += '</div>';

      if (f.hasCapital()) {
        h += '<div class="sec-title">战略舰</div>';
        for (const u of f.units) {
          if (!SW.ShipConfig[u.shipId].capital) continue;
          const cfg = SW.ShipConfig[u.shipId];
          h += '<div class="kv"><span style="color:#ffd08a">' + esc(u.name || cfg.name) + '</span><b>' + cfg.name + '</b></div>';
          h += '<div class="kv"><span>结构</span><b>' + Math.round(u.hp) + ' / ' + Math.round(u.maxHp) + '</b></div>';
          h += '<div class="bar"><i style="width:' + (u.hp / u.maxHp * 100) + '%;background:#ffb04d"></i></div>';
          h += '<div class="kv"><span>护盾</span><b>' + Math.round(u.shield) + ' / ' + Math.round(u.maxShield) + '</b></div>';
          h += '<div class="bar"><i style="width:' + (u.shield / Math.max(1, u.maxShield) * 100) + '%;background:#5ce1e6"></i></div>';
        }
      }

      h += '<div style="margin-top:12px;display:flex;gap:6px">';
      h += '<button class="btn sm ghost" data-act="follow">跟随镜头</button>';
      h += '<button class="btn sm ghost" data-act="center">定位</button>';
      h += '</div>';

      const self = this;
      setTimeout(() => {
        const p = this.el.rightPanel;
        const fb = p.querySelector('[data-act=follow]');
        const cb = p.querySelector('[data-act=center]');
        if (fb) fb.onclick = () => { g.doubleClickFleet(f.id); this.toolBtns.auto.classList.remove('on'); };
        if (cb) cb.onclick = () => {
          if (f.starId && g.combat.byStar[f.starId]) g.camera.focusBattle(f.starId);
          else {
            const pos = f.position(g.galaxy);
            g.camera.centerOn(pos.x, pos.y);
            g.camera.targetZoom = Math.max(0.9, g.camera.targetZoom);
          }
        };
      }, 0);
      return h;
    }

    _refreshNotify() {
      const g = this.game;
      const list = g.events.recent;
      if (list.length !== this._notifyRendered || this._notifyText !== list.map(x => x.text).join('|')) {
        this._notifyRendered = list.length;
        this._notifyText = list.map(x => x.text).join('|');
        let h = '';
        for (const n of list) {
          const attr = n.starId != null ? ' data-star-id="' + esc(n.starId) + '" title="点击定位战场"' : '';
          h += '<div class="notify ' + n.category + (n.starId != null ? ' clickable' : '') + '"' + attr + '>' + esc(n.text) + '</div>';
        }
        this.el.notifyArea.innerHTML = h;
        this.el.notifyArea.querySelectorAll('[data-star-id]').forEach((item) => {
          item.onclick = () => { if (this._focusBattle(item.dataset.starId)) this.refresh(); };
        });
      }
    }

    _refreshLog() {
      const g = this.game;
      const logs = g.events.log;
      const filter = this.logFilter;
      const show = filter === 'all' ? logs.slice(-120) : logs.filter(l => l.category === filter || (filter === 'war' && (l.category === 'war' || l.category === 'capital' || l.category === 'flagship'))).slice(-120);
      const key = filter + '|' + logs.length + '|' + (logs.length ? logs[logs.length - 1].text : '');
      if (key === this._logKey) return;
      this._logKey = key;
      let h = '';
      for (let i = show.length - 1; i >= 0; i--) {
        const l = show[i];
        const attr = l.starId != null ? ' data-star-id="' + esc(l.starId) + '" title="点击定位战场"' : '';
        h += '<div class="entry' + (l.starId != null ? ' clickable' : '') + '"' + attr + '><span class="yr">' + l.year.toFixed(1) + '</span>' +
          '<span class="e-' + l.category + '">' + esc(l.text) + '</span></div>';
      }
      this.el.log.innerHTML = h;
      this.el.log.scrollTop = 0;
      this.el.log.querySelectorAll('[data-star-id]').forEach((item) => {
        item.onclick = () => { if (this._focusBattle(item.dataset.starId)) this.refresh(); };
      });
      if (!this._logTabsBuilt) {
        const tabs = [['all', '全部'], ['war', '战争'], ['tech', '科技'], ['capital', '要闻'], ['diplomacy', '外交']];
        let th = '';
        for (const t of tabs) th += '<div class="log-tab' + (t[0] === 'all' ? ' active' : '') + '" data-f="' + t[0] + '">' + t[1] + '</div>';
        this.el.logTabs.innerHTML = th;
        this.el.logTabs.querySelectorAll('.log-tab').forEach(x => {
          x.onclick = () => {
            this.logFilter = x.dataset.f;
            this.el.logTabs.querySelectorAll('.log-tab').forEach(y => y.classList.remove('active'));
            x.classList.add('active');
            this._logKey = '';
            this._refreshLog();
          };
        });
        this._logTabsBuilt = true;
      }
    }

    _focusBattle(starId) {
      const g = this.game;
      if (g.focusBattle) return g.focusBattle(starId);
      const star = g.galaxy.get(starId);
      if (!star) return false;
      g.select({ type: 'star', id: star.id });
      g.camera.focusBattle(star.id);
      return true;
    }

    _refreshPerf() {
      const g = this.game;
      const p = g.perf;
      this.el.perf.innerHTML =
        'FPS <b>' + p.fps + '</b> · 帧耗时 <b>' + p.ms.toFixed(1) + 'ms</b><br>' +
        '舰船 <b>' + p.ships + '</b> · 舰队 <b>' + g.fleets.fleets.length + '</b> · 战斗 <b>' + g.combat.battles.length + '</b><br>' +
        '粒子 <b>' + p.particles + '</b> · 步长 <b>' + p.steps + '</b>' +
        (g.viewFaction ? '<br><span style="color:#ffb020">战争迷雾：' + SW.FactionById[g.viewFaction].shortName + ' 视角</span>' : '');
    }

    _refreshVictory() {
      const g = this.game;
      const v = this.el.victory;
      if (!g.gameOver) { v.classList.add('hidden'); return; }
      if (!v.classList.contains('hidden') && this._vicShown) return;
      const go = g.gameOver;
      const f = g.factions.get(go.winnerId);
      const st = go.stats;
      let h = '';
      h += '<div class="vic-box" style="border-color:' + f.color + '">';
      h += '<h1 style="color:' + f.color + ';text-shadow:0 0 24px ' + f.color + '">' + f.name + '</h1>';
      h += '<div class="sub2">银河征服胜利 · 战争持续 ' + st.years + ' 年</div>';
      h += '<div class="vic-stats">';
      h += '<div><span>控制恒星</span><b>' + st.stars + ' / ' + st.totalStars + '</b></div>';
      h += '<div><span>建造舰船</span><b>' + st.shipsBuilt + '</b></div>';
      h += '<div><span>击毁敌舰</span><b>' + st.shipsKilled + '</b></div>';
      h += '<div><span>损失舰船</span><b>' + st.shipsLost + '</b></div>';
      h += '<div><span>泰坦 建造/损失</span><b>' + st.titansBuilt + ' / ' + st.titansLost + '</b></div>';
      h += '<div><span>科技完成</span><b>' + st.techs + '</b></div>';
      h += '</div>';
      if (st.flagshipName) {
        h += '<div style="font-size:13px;color:#ffe6a8;margin-bottom:14px">超级旗舰「' + esc(st.flagshipName) + '」' +
          (st.flagshipLost > 0 ? '在战争中被击毁' : '见证了帝国的胜利') + '</div>';
      }
      h += '<button class="btn" onclick="SW._ui.newGameFromVictory()">开启新的银河</button> ';
      h += '<button class="btn ghost" onclick="SW._ui.closeVictory()">继续观战</button>';
      h += '</div>';
      v.innerHTML = h;
      v.classList.remove('hidden');
      this._vicShown = true;
    }

    closeVictory() { this.el.victory.classList.add('hidden'); }
    newGameFromVictory() { this.closeVictory(); this._vicShown = false; this.showNewGame(); }

    /* ================= 模态窗口 ================= */
    _bindModal() {
      this.el.modal.addEventListener('mousedown', (e) => {
        if (e.target === this.el.modal) this.closeModal();
      });
    }
    closeModal() { this.el.modal.classList.add('hidden'); this.el.modalBox.innerHTML = ''; }
    _openModal(title, body, footer) {
      let h = '<h2>' + title + '</h2><button class="modal-close" onclick="SW._ui.closeModal()">✕</button>';
      h += '<div class="modal-body">' + body + '</div>';
      if (footer) h += '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' + footer + '</div>';
      this.el.modalBox.innerHTML = h;
      this.el.modal.classList.remove('hidden');
    }

    showTech() {
      const g = this.game;
      const f = g.factions.get(g.resourceView) || g.factions.list[0];
      let body = '';
      for (const cat of SW.TechCategories) {
        if (cat.id === 'unique') {
          for (const fac of SW.FactionConfig) continue;
        }
        const list = SW.TechList.filter(t => t.cat === cat.id && (!t.faction || t.faction === f.id));
        if (!list.length) continue;
        body += '<div class="tech-cat"><h4><span class="bar-i" style="background:' + cat.color + '"></span>' + cat.name + '</h4><div class="tech-grid">';
        for (const t of list) {
          const done = f.isResearched(t.id);
          const doing = f.tech.current && f.tech.current.id === t.id;
          let avail = true;
          for (const p of (t.prereq || [])) if (!f.isResearched(p)) avail = false;
          const cls = done ? 'done' : (doing ? 'doing' : (avail ? '' : 'locked'));
          let prog = '';
          if (doing) {
            const pct = Math.round(f.tech.current.progress / f.tech.current.cost * 100);
            prog = '<div class="tbar"><i style="width:' + pct + '%"></i></div>';
          }
          body += '<div class="tech-node ' + cls + '"><div class="tn">' + t.name +
            (t.faction ? ' <span style="color:#ff9de0">◆</span>' : '') + '</div>' +
            '<div class="td">' + esc(t.desc) + '<br>费用 ' + t.cost + ' 研究点</div>' + prog + '</div>';
        }
        body += '</div></div>';
      }
      /* 各势力专属科技总览 */
      body += '<div class="tech-cat"><h4><span class="bar-i" style="background:#ff9de0"></span>文明专属科技（全势力）</h4><div class="tech-grid">';
      for (const t of SW.TechList.filter(x => x.cat === 'unique')) {
        const owner = SW.FactionById[t.faction];
        const done = f.isResearched(t.id);
        body += '<div class="tech-node ' + (done ? 'done' : '') + '" style="border-left:3px solid ' + owner.color + '">' +
          '<div class="tn" style="color:' + owner.color + '">' + owner.shortName + ' · ' + t.name + '</div>' +
          '<div class="td">' + esc(t.desc) + '<br>费用 ' + t.cost + '</div></div>';
      }
      body += '</div></div>';
      this._openModal('科技树 — ' + f.name + '（已完成 ' + f.techCount + ' 项）', body,
        '<button class="btn ghost" onclick="SW._ui.closeModal()">关闭</button>');
    }

    showStats() {
      const g = this.game;
      const powers = g.factions.totalPower(g.fleets);
      let body = '<table class="stat"><thead><tr><th>指标</th>';
      for (const f of g.factions.list) body += '<th style="color:' + f.color + '">' + f.cfg.shortName + '</th>';
      body += '</tr></thead><tbody>';
      const rows = [
        ['状态', f => f.defeated ? '已灭亡' : '存续'],
        ['恒星系', f => g.galaxy.starsOf(f.id).length],
        ['舰队数量', f => g.fleets.fleetsOf(f.id).length],
        ['舰船总数', f => g.fleets.fleetsOf(f.id).reduce((a, x) => a + x.totalShips(), 0)],
        ['总军力', f => U.fmt(powers[f.id] || 0)],
        ['峰值军力', f => U.fmt(f.stats.peakPower)],
        ['金属/天', f => U.fmt(f.income.metal)],
        ['暗物质/天', f => U.fmt(f.income.darkMatter)],
        ['高级材料/天', f => U.fmt(f.income.materials)],
        ['研究点/天', f => U.fmt(f.income.research)],
        ['科技数', f => f.techCount],
        ['泰坦（存活）', f => g.production.countCapital(f, 'titan') + ' / ' + f.stats.titansBuilt],
        ['航母（存活）', f => g.production.countCapital(f, 'carrier')],
        ['超级旗舰', f => (f.stats.flagshipBuilt > f.stats.flagshipLost ? '「' + esc(f.stats.flagshipName) + '」服役中' : (f.stats.flagshipBuilt ? '已损毁' : '未建造'))],
        ['建造舰船', f => f.stats.shipsBuilt],
        ['击毁敌舰', f => f.stats.shipsKilled],
        ['损失舰船', f => f.stats.shipsLost],
        ['攻占星系', f => f.stats.starsTaken],
        ['丢失星系', f => f.stats.starsLost],
        ['战略姿态', f => f.defeated ? '—' : (f.ai.posture === 'attack' ? '进攻' : f.ai.posture === 'defend' ? '防守' : '发展')]
      ];
      for (const r of rows) {
        body += '<tr><td>' + r[0] + '</td>';
        for (const f of g.factions.list) body += '<td>' + r[1](f) + '</td>';
        body += '</tr>';
      }
      body += '</tbody></table>';

      /* 排名 */
      const rank = (fn) => g.factions.list.slice().sort((a, b) => fn(b) - fn(a));
      const mk = (title, fn, fmt) => {
        const r = rank(fn);
        return '<div style="margin-top:14px"><b style="color:#5ce1e6;font-size:12px">' + title + '</b>　' +
          r.map((f, i) => '<span style="color:' + f.color + '">' + (i + 1) + '. ' + f.cfg.shortName + '(' + (fmt ? fmt(fn(f)) : fn(f)) + ')</span>').join('　') + '</div>';
      };
      body += mk('军力排名', f => powers[f.id] || 0, U.fmt);
      body += mk('经济排名', f => f.income.metal + f.income.darkMatter * 2 + f.income.materials * 8, U.fmt);
      body += mk('科技排名', f => f.techCount);
      body += mk('领土排名', f => g.galaxy.starsOf(f.id).length);

      const wars = g.diplomacy.activeWars();
      body += '<div style="margin-top:14px;font-size:12px">进行中的战争：' +
        (wars.length ? wars.map(w => '<span style="color:' + SW.FactionById[w[0]].color + '">' + SW.FactionById[w[0]].shortName +
          '</span> vs <span style="color:' + SW.FactionById[w[1]].color + '">' + SW.FactionById[w[1]].shortName + '</span>').join('，') : '无') + '</div>';

      this._openModal('银河统计', body, '<button class="btn ghost" onclick="SW._ui.closeModal()">关闭</button>');
    }

    showSaves() {
      const g = this.game;
      const list = g.save.list();
      let body = '';
      body += '<div style="display:flex;gap:8px;margin-bottom:14px">' +
        '<button class="btn sm" onclick="SW._ui.doSave(\'slot1\')">保存到 槽位1</button>' +
        '<button class="btn sm" onclick="SW._ui.doSave(\'slot2\')">保存到 槽位2</button>' +
        '<button class="btn sm" onclick="SW._ui.doSave(\'slot3\')">保存到 槽位3</button>' +
        '<button class="btn sm ghost" onclick="SW._ui.exportSave()">导出文件</button>' +
        '<button class="btn sm ghost" onclick="document.getElementById(\'importFile\').click()">导入文件</button>' +
        '<input type="file" id="importFile" accept=".json" style="display:none" onchange="SW._ui.importSave(this)">' +
        '</div>';
      if (!list.length) body += '<div style="color:#61789a;font-size:12.5px">暂无存档。自动存档会在每 90 秒自动创建。</div>';
      for (const s of list) {
        const d = new Date(s.savedAt);
        body += '<div class="save-item">' +
          '<span class="nm">' + (s.slot === 'auto' ? '自动存档' : '槽位 ' + s.slot) + '</span>' +
          '<span class="meta">' + d.toLocaleString() + ' · 银河纪元 ' + s.era + '</span>' +
          '<span class="sp"></span>' +
          '<button class="btn sm" onclick="SW._ui.doLoad(\'' + s.slot + '\')">读取</button>' +
          '<button class="btn sm danger" onclick="SW._ui.doDelete(\'' + s.slot + '\')">删除</button>' +
          '</div>';
      }
      this._openModal('存档管理', body, '<button class="btn ghost" onclick="SW._ui.closeModal()">关闭</button>');
    }

    doSave(slot) {
      const r = this.game.save.save(slot);
      this.showSaves();
      this.game.events.notify(r.ok ? '已保存到 ' + slot : '保存失败：' + r.error, 'info', { priority: 1 });
    }
    doLoad(slot) {
      const r = this.game.save.load(slot);
      if (r.ok) {
        this.closeModal();
        this.game.renderer.markTerritoryDirty();
        this.game.camera.fitGalaxy();
        this._logKey = '';
        this.game.events.notify('已读取存档：' + slot, 'info', { priority: 2 });
        this.refresh();
      } else {
        alert('读取失败：' + r.error);
      }
    }
    doDelete(slot) { this.game.save.remove(slot); this.showSaves(); }
    exportSave() { this.game.save.exportFile(); }
    importSave(input) {
      if (!input.files || !input.files[0]) return;
      this.game.save.importFile(input.files[0], (r) => {
        if (r.ok) {
          this.closeModal();
          this.game.renderer.markTerritoryDirty();
          this._logKey = '';
          this.refresh();
        } else alert('导入失败：' + r.error);
      });
    }

    showNewGame() {
      let body = '';
      body += '<div class="setting-row"><label>恒星数量</label>' +
        '<input type="range" id="ngStars" min="100" max="160" step="2" value="' + SW.GalaxyConfig.starCount + '" oninput="document.getElementById(\'ngStarsVal\').textContent=this.value">' +
        '<b id="ngStarsVal" style="width:40px;font-family:Consolas">' + SW.GalaxyConfig.starCount + '</b></div>';
      body += '<div class="setting-row"><label>随机种子</label>' +
        '<input type="text" id="ngSeed" placeholder="留空则随机"> ' +
        '<button class="btn sm ghost" onclick="document.getElementById(\'ngSeed\').value=Math.floor(Math.random()*1e9)">随机</button></div>';
      body += '<div style="font-size:12px;color:#8ba6c4;line-height:1.8;margin-top:10px">' +
        '生成后四个文明将分别位于银河四角，各自拥有唯一出口的母星系。银河将自动演化：' +
        '殖民 → 接触 → 摩擦 → 战争 → 泰坦 → 超级旗舰 → 决战。</div>';
      const footer = '<button class="btn ghost" onclick="SW._ui.closeModal()">取消</button>' +
        '<button class="btn warn" onclick="SW._ui.doNewGame()">生成新银河</button>';
      this._openModal('新的银河', body, footer);
    }

    doNewGame() {
      const stars = parseInt(document.getElementById('ngStars').value, 10);
      const seedStr = document.getElementById('ngSeed').value.trim();
      const seed = seedStr ? (parseInt(seedStr, 10) || hashStr(seedStr)) : null;
      this.closeModal();
      this._vicShown = false;
      this._logKey = '';
      this.game.newGame({ starCount: stars, seed: seed });
      this.refresh();
    }

    showHelp() {
      const body =
        '<div style="font-size:13px;line-height:2">' +
        '<b style="color:#5ce1e6">镜头</b><br>' +
        '· 鼠标拖拽平移地图，滚轮缩放，右键点击星系快速定位<br>' +
        '· <kbd>F</kbd> 缩放至整个银河，<kbd>空格</kbd> 暂停/继续<br>' +
        '· 单击恒星 / 舰队查看详情，<b>双击舰队</b>进入跟随模式<br><br>' +
        '<b style="color:#5ce1e6">观战</b><br>' +
        '· 速度按钮支持 暂停 / 1x / 2x / 4x / 8x / 16x（快捷键 1~5）；1x 为观战基准，暂停后会恢复原倍率<br>' +
        '· <b>自动观战</b>（<kbd>A</kbd>）：摄像机会自动飞向最激烈的战场、泰坦诞生、首都围攻等事件<br>' +
        '· 地图右下角 <b>− / +</b> 或键盘 <kbd>-</kbd> / <kbd>+</kbd> 缩放；滚轮会以鼠标位置为中心，放大后显示战术舰船与交火轨迹<br>' +
        '· <b>势力视角</b>（<kbd>V</kbd>）：开启战争迷雾，只显示该文明已探索的区域<br><br>' +
        '<b style="color:#5ce1e6">界面</b><br>' +
        '· <kbd>T</kbd> 科技树　<kbd>S</kbd> 银河统计　存档支持本地槽位与文件导入导出<br>' +
        '· 左下角银河战争日志可按类别筛选<br><br>' +
        '<b style="color:#5ce1e6">关于</b><br>' +
        '这是一个完全自动演化的银河战争模拟器。四个 AI 文明会自主开采资源、建设星系、' +
        '研究科技、设计舰队、争夺战略要道并发动战争。你只需要看着银河燃烧。' +
        '</div>';
      this._openModal('操作说明', body, '<button class="btn ghost" onclick="SW._ui.closeModal()">关闭</button>');
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  SW.UIManager = UIManager;
})(window.SW);
