/* ===========================================================
 *  无头模拟测试 —— 在 Node 中加载全部逻辑模块并快速推进银河演化
 *  用途：验证无运行时错误、AI 是否真正扩张 / 开战 / 造大舰
 *  运行： node tools/headless-test.js [years] [starCount] [seed]
 * =========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const YEARS = parseInt(process.argv[2] || '60', 10);
const STAR_COUNT = parseInt(process.argv[3] || '128', 10);
const SEED = process.argv[4] ? parseInt(process.argv[4], 10) : 123456789;

/* ---------------- DOM / Canvas 存根 ---------------- */
const noop = function () { };
function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (p === 'createPattern') return () => ({});
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return { width: 1600, height: 900 };
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return noop;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [], classList: {
      add: noop, remove: noop, toggle: noop, contains: () => false
    },
    addEventListener: noop, removeEventListener: noop,
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
    clientWidth: 1600, clientHeight: 900, width: 1600, height: 900,
    innerHTML: '', textContent: '', onclick: null,
    getContext: () => makeCtx(),
    focus: noop, click: noop
  };
  return el;
}
global.window = global;
global.document = {
  readyState: 'complete',
  getElementById: () => makeEl(),
  createElement: () => makeEl(),
  addEventListener: noop,
  body: makeEl()
};
global.requestAnimationFrame = () => 0;
global.addEventListener = noop;
global.removeEventListener = noop;
global.innerWidth = 1600;
global.innerHeight = 900;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  key(i) { return Object.keys(this._d)[i]; },
  get length() { return Object.keys(this._d).length; }
};
global.devicePixelRatio = 1;
if (typeof global.performance === 'undefined') global.performance = { now: () => Date.now() };

/* ---------------- 加载脚本 ---------------- */
const FILES = [
  'js/util/utils.js', 'js/util/nameGen.js',
  'js/config/galaxyConfig.js', 'js/config/resourceConfig.js', 'js/config/factionConfig.js',
  'js/config/shipConfig.js', 'js/config/techConfig.js', 'js/config/buildingConfig.js', 'js/config/aiConfig.js',
  'js/core/events.js', 'js/core/gameTime.js',
  'js/galaxy/starSystem.js', 'js/galaxy/hyperlaneManager.js', 'js/galaxy/galaxyManager.js',
  'js/factions/faction.js', 'js/factions/factionManager.js',
  'js/systems/economySystem.js', 'js/systems/technologySystem.js', 'js/systems/buildingSystem.js',
  'js/systems/productionSystem.js', 'js/systems/fleetSystem.js', 'js/systems/combatSystem.js',
  'js/systems/diplomacySystem.js', 'js/systems/saveSystem.js',
  'js/ai/economyAI.js', 'js/ai/expansionAI.js', 'js/ai/militaryAI.js', 'js/ai/researchAI.js',
  'js/ai/productionAI.js', 'js/ai/strategicAI.js',
  'js/render/camera.js', 'js/render/effects.js', 'js/render/renderer.js',
  'js/game.js'
];

for (const f of FILES) {
  const full = path.join(ROOT, f);
  try {
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
  } catch (e) {
    console.error('加载失败: ' + f + '\n' + e.stack);
    process.exit(1);
  }
}

const SW = global.SW;
const RESOURCE_KEYS = SW.ResourceConfig.order || ['metal', 'darkMatter', 'materials', 'research'];
const peakResources = {};
const capReached = {};
const pressureReached = {};
const RESOURCE_MILESTONES = [360, 720];
const resourceSnapshots = {};
const windowCapHits = [];

function sampleResources() {
  for (const f of game.factions.list) {
    if (!peakResources[f.id]) peakResources[f.id] = {};
    if (!capReached[f.id]) capReached[f.id] = {};
    if (!pressureReached[f.id]) pressureReached[f.id] = {};
    for (const key of RESOURCE_KEYS) {
      const value = Number(f.res[key]) || 0;
      peakResources[f.id][key] = Math.max(peakResources[f.id][key] || 0, value);
      const cap = SW.ResourceConfig.cap[key];
      if (cap > 0 && value >= cap) capReached[f.id][key] = true;
      if (cap > 0 && value >= cap * 0.5) pressureReached[f.id][key] = true;
    }
  }
}

function captureResourceMilestones(previousDay, currentDay) {
  for (const day of RESOURCE_MILESTONES) {
    if (resourceSnapshots[day] || currentDay < day || previousDay >= day) continue;
    resourceSnapshots[day] = {};
    for (const f of game.factions.list) {
      resourceSnapshots[day][f.id] = {};
      for (const key of RESOURCE_KEYS) {
        const value = Number(f.res[key]) || 0;
        resourceSnapshots[day][f.id][key] = value;
        const cap = SW.ResourceConfig.cap[key];
        if (cap > 0 && value >= cap) windowCapHits.push(day + '天 ' + f.cfg.shortName + ' ' + key);
      }
    }
  }
}

/* ---------------- 建立游戏 ---------------- */
const canvas = makeEl();
const game = new SW.Game(canvas);
/* 关掉纯表现层 */
game.renderer.render = noop;
game.renderer.buildBackground = noop;
game.renderer.buildTerritory = noop;

const t0 = Date.now();
game.newGame({ starCount: STAR_COUNT, seed: SEED });
const builtByType = {};
const originalDeliver = game.production.deliver.bind(game.production);
game.production.deliver = function (star, faction, line) {
  const row = builtByType[faction.id] || (builtByType[faction.id] = {});
  row[line.shipId] = (row[line.shipId] || 0) + 1;
  return originalDeliver(star, faction, line);
};
sampleResources();
console.log('银河生成完成：恒星 ' + game.galaxy.stars.length + ' 颗，航道 ' + game.galaxy.edges.length + ' 条，用时 ' + (Date.now() - t0) + 'ms');

const laneDeg = game.galaxy.stars.map(s => s.degree);
const avgDeg = (laneDeg.reduce((a, b) => a + b, 0) / laneDeg.length).toFixed(2);
const iso = laneDeg.filter(d => d === 0).length;
const chokes = game.galaxy.stars.filter(s => s.isChoke).length;
const hubs = game.galaxy.stars.filter(s => s.isHub).length;
console.log('平均连接度 ' + avgDeg + '，孤立恒星 ' + iso + '，瓶颈 ' + chokes + '，枢纽 ' + hubs);
const homeDeg = game.galaxy.homeIds.map(id => game.galaxy.get(id).degree);
console.log('母星系连接数（应为 1）: ' + homeDeg.join(', '));

/* 连通性校验 */
function checkConnected() {
  const seen = new Set([game.galaxy.stars[0].id]);
  const st = [game.galaxy.stars[0].id];
  while (st.length) {
    const v = st.pop();
    for (const w of game.galaxy.get(v).links) if (!seen.has(w)) { seen.add(w); st.push(w); }
  }
  return seen.size === game.galaxy.stars.length;
}
console.log('连通图校验: ' + (checkConnected() ? '通过' : '失败！'));

/* ---------------- 推进模拟 ---------------- */
game.time.setSpeedIndex(SW.GalaxyConfig.time.speeds.indexOf(16));
const DT = 0.05;                     // 每次 update 代表的真实秒数
const daysPerCall = DT * SW.GalaxyConfig.time.daysPerRealSecond * 16;
const totalDays = YEARS * SW.GalaxyConfig.time.daysPerYear;
const calls = Math.ceil(totalDays / daysPerCall);

console.log('\n开始模拟 ' + YEARS + ' 银河年（' + totalDays + ' 天，' + calls + ' 次更新）...\n');
const simStart = Date.now();
let errors = 0;
const milestones = new Set();
let previousDay = game.time.day;

for (let i = 0; i < calls; i++) {
  try {
    game.update(DT);
  } catch (e) {
    errors++;
    console.error('\n[第 ' + i + ' 次更新异常] ' + e.stack);
    if (errors > 3) break;
  }
  sampleResources();
  captureResourceMilestones(previousDay, game.time.day);
  previousDay = game.time.day;
  const day = game.time.day;
  const key = Math.floor(day / (SW.GalaxyConfig.time.daysPerYear * 5));
  if (!milestones.has(key) && day > 0) {
    milestones.add(key);
    report(Math.floor(day / SW.GalaxyConfig.time.daysPerYear));
  }
  if (game.gameOver) { console.log('\n>>> 分出胜负，模拟提前结束。'); break; }
}

const simMs = Date.now() - simStart;
sampleResources();
console.log('\n模拟耗时 ' + simMs + 'ms（约 ' + (simMs / 1000).toFixed(1) + 's），实际推进 ' + Math.floor(game.time.day) + ' 银河天');

/* ---------------- 报告 ---------------- */
function factionPower(faction) {
  return game.fleets.fleetsOf(faction.id).reduce((sum, fleet) => sum + fleet.power, 0);
}

function builtCountBySize(faction, predicate) {
  const row = builtByType[faction.id] || {};
  return Object.keys(row).reduce((sum, shipId) =>
    sum + (SW.ShipConfig[shipId] && predicate(SW.ShipConfig[shipId]) ? row[shipId] : 0), 0);
}

function incomePerStar(faction, key) {
  const stars = game.galaxy.starsOf(faction.id).length;
  return stars > 0 ? (Number(faction.income[key]) || 0) / stars : 0;
}

function printResourceSnapshots() {
  for (const day of RESOURCE_MILESTONES) {
    const snapshot = resourceSnapshots[day];
    if (!snapshot) continue;
    const parts = game.factions.list.map((f) => {
      const row = snapshot[f.id] || {};
      return f.cfg.shortName + ' ' + RESOURCE_KEYS.map((key) =>
        key + '=' + (row[key] || 0).toFixed(1) + '/' + SW.ResourceConfig.cap[key]).join(' ');
    });
    console.log('资源快照 ' + day + ' 天：' + parts.join(' | '));
  }
}

function report(year) {
  const parts = [];
  for (const f of game.factions.list) {
    const stars = game.galaxy.starsOf(f.id).length;
    const ships = game.fleets.fleetsOf(f.id).reduce((a, x) => a + x.totalShips(), 0);
    const power = game.fleets.fleetsOf(f.id).reduce((a, x) => a + x.power, 0);
    parts.push(f.cfg.shortName + ' 星' + stars + '/舰' + ships + '/力' + Math.round(power) + '/科' + f.techCount +
      '/泰' + game.production.countCapital(f, 'titan') + (f.defeated ? '(亡)' : ''));
  }
  const neutral = game.galaxy.stars.filter(s => s.owner === null).length;
  console.log('[第 ' + year + ' 年] ' + parts.join('  |  ') +
    ' | 中立:' + neutral + ' 战斗:' + game.combat.battles.length + ' 舰队:' + game.fleets.fleets.length);
}

console.log('\n========== 最终统计 ==========');
printResourceSnapshots();
console.log('360/720天 cap命中: ' + (windowCapHits.length ? windowCapHits.join('、') : '无'));
report(Math.floor(game.time.day / SW.GalaxyConfig.time.daysPerYear));
console.log('');
for (const f of game.factions.list) {
  const s = f.stats;
  const peak = peakResources[f.id] || {};
  const capState = capReached[f.id] || {};
  const pressureState = pressureReached[f.id] || {};
  const resourceSummary = RESOURCE_KEYS.map((key) => key + '=' + (peak[key] || 0).toFixed(1) + '/' + SW.ResourceConfig.cap[key] +
    (capState[key] ? '(封顶)' : '') + (pressureState[key] ? '(>50%)' : '')).join(' ');
  const lowBuilt = builtCountBySize(f, cfg => cfg.size <= 2);
  const mediumBuilt = builtCountBySize(f, cfg => cfg.size >= 3 && cfg.size <= 4);
  const highBuilt = builtCountBySize(f, cfg => cfg.size >= 5);
  console.log(f.name +
    '\n  恒星 ' + game.galaxy.starsOf(f.id).length +
    ' | 科技 ' + f.techCount +
    ' | 舰队 ' + game.fleets.fleetsOf(f.id).length +
    ' | 造舰 ' + s.shipsBuilt + ' | 损失 ' + s.shipsLost + ' | 击毁 ' + s.shipsKilled +
    '\n  攻占 ' + s.starsTaken + ' | 丢失 ' + s.starsLost +
    ' | 泰坦 ' + s.titansBuilt + '(损' + s.titansLost + ')' +
    ' | 旗舰 ' + s.flagshipBuilt + (s.flagshipName ? '「' + s.flagshipName + '」' : '') +
    '\n  收入 金属' + f.income.metal.toFixed(1) + ' 暗物质' + f.income.darkMatter.toFixed(1) +
    ' 高材' + f.income.materials.toFixed(2) + ' 科研' + f.income.research.toFixed(1) +
    '\n  每星 金属' + incomePerStar(f, 'metal').toFixed(1) + ' 暗物质' + incomePerStar(f, 'darkMatter').toFixed(2) +
    ' 高材' + incomePerStar(f, 'materials').toFixed(3) + ' 科研' + incomePerStar(f, 'research').toFixed(2) +
    '\n  姿态 ' + f.ai.posture + ' | 阶段 ' + f.ai.phase +
    ' | 战争中: ' + (Object.keys(f.atWar).filter(k => f.atWar[k]).join(',') || '无'));
  console.log('  资源峰值 ' + resourceSummary);
  console.log('  交付结构 低级' + lowBuilt + ' / 中级' + mediumBuilt + ' / 高级' + highBuilt);
}
console.log('\n外交战争对: ' + game.diplomacy.activeWars().map(w =>
  SW.FactionById[w[0]].shortName + '↔' + SW.FactionById[w[1]].shortName).join(' , ') || '无');
console.log('总战斗次数: ' + game.combat.stats.battles);
console.log('日志条数: ' + game.events.log.length);
console.log('运行时错误: ' + errors);
if (game.gameOver) console.log('胜利者: ' + SW.FactionById[game.gameOver.winnerId].name);
const machine = game.factions.get('B');
const balanceOthers = game.factions.list.filter(f => f.id !== 'B' && !f.defeated);
if (machine && balanceOthers.length) {
  const avgIncome = balanceOthers.reduce((sum, f) => sum + f.income.metal, 0) / balanceOthers.length;
  const avgIncomePerStar = balanceOthers.reduce((sum, f) => sum + incomePerStar(f, 'metal'), 0) / balanceOthers.length;
  const avgPower = balanceOthers.reduce((sum, f) => sum + factionPower(f), 0) / balanceOthers.length;
  console.log('智械B相对其他未灭势力：金属收入 ' + machine.income.metal.toFixed(1) + '/' + avgIncome.toFixed(1) +
    ' (' + (avgIncome > 0 ? (machine.income.metal / avgIncome).toFixed(2) : '0.00') + 'x)' +
    '，每星 ' + incomePerStar(machine, 'metal').toFixed(1) + '/' + avgIncomePerStar.toFixed(1) +
    ' (' + (avgIncomePerStar > 0 ? (incomePerStar(machine, 'metal') / avgIncomePerStar).toFixed(2) : '0.00') + 'x)' +
    '，军力 ' + Math.round(factionPower(machine)) + '/' + Math.round(avgPower) +
    ' (' + (avgPower > 0 ? (factionPower(machine) / avgPower).toFixed(2) : '0.00') + 'x)');
}

/* ---------------- 存档测试 ---------------- */
try {
  const r1 = game.save.save('slot1');
  const snapshot = JSON.stringify(game.save.capture()).length;
  const r2 = game.save.load('slot1');
  console.log('存档测试: 保存' + (r1.ok ? '成功' : '失败') + ' (' + (snapshot / 1024).toFixed(1) + 'KB), 读取' + (r2.ok ? '成功' : '失败'));
} catch (e) {
  console.error('存档测试异常: ' + e.stack);
  errors++;
}
if (windowCapHits.length) process.exitCode = 1;

process.exit(errors > 0 ? 1 : 0);
