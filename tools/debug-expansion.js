/* 扩张 AI 诊断：跑到指定年份后，dump 每个势力的扩张决策链 */
'use strict';
process.argv[2] = process.argv[2] || '30';
const path = require('path');

/* 复用 headless-test 的存根与加载逻辑 */
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const noop = function () { };
function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return { width: 1600, height: 900 };
      return noop;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeEl() {
  return {
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop,
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
    clientWidth: 1600, clientHeight: 900, width: 1600, height: 900,
    innerHTML: '', textContent: '', onclick: null,
    getContext: () => makeCtx(), focus: noop, click: noop
  };
}
global.window = global;
global.document = { readyState: 'complete', getElementById: () => makeEl(), createElement: () => makeEl(), addEventListener: noop, body: makeEl() };
global.requestAnimationFrame = () => 0;
global.addEventListener = noop; global.removeEventListener = noop;
global.innerWidth = 1600; global.innerHeight = 900;
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] == null ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
  key(i) { return Object.keys(this._d)[i]; }, get length() { return Object.keys(this._d).length; }
};
global.devicePixelRatio = 1;

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
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const SW = global.SW;

const YEARS = parseInt(process.argv[2] || '30', 10);
const SEED = parseInt(process.argv[3] || '123456789', 10);

const game = new SW.Game(makeEl());
game.renderer.render = noop;
game.renderer.buildBackground = noop;
game.renderer.buildTerritory = noop;
game.newGame({ starCount: 128, seed: SEED });
game.time.setSpeedIndex(SW.GalaxyConfig.time.speeds.indexOf(16));
const DT = 0.05;
const calls = Math.ceil(YEARS * 360 / (DT * 18 * 16));
for (let i = 0; i < calls; i++) game.update(DT);

console.log('=== 第 ' + YEARS + ' 年诊断 ===\n');

const neutral = game.galaxy.stars.filter(s => s.owner === null);
console.log('中立星数量: ' + neutral.length);

for (const f of game.factions.list) {
  const mine = game.galaxy.starsOf(f.id);
  const avail = game.fleets.availablePowerByStar(f.id);
  let availTotal = 0, availStars = 0;
  for (const k in avail) { availTotal += avail[k]; availStars++; }
  const totalPower = game.fleets.fleetsOf(f.id).reduce((a, x) => a + x.power, 0);

  let ongoing = 0, claim = 0, attack = 0, idle = 0, defend = 0, moving = 0, other = 0;
  for (const fl of game.fleets.fleetsOf(f.id)) {
    if (fl.mission === 'claim' || fl.mission === 'attack') ongoing++;
    if (fl.mission === 'claim') claim++;
    if (fl.mission === 'attack') attack++;
    if (fl.mission === 'idle') idle++;
    if (fl.mission === 'defend') defend++;
    if (fl.move) moving++;
    if (fl.mission === 'retreat' || fl.mission === 'reinforce') other++;
  }

  let maxClaims = 1 + Math.floor(f.income.metal / SW.AIConfig.expansion.claimsPerIncome);
  maxClaims = Math.min(SW.AIConfig.expansion.maxConcurrentClaims,
    Math.max(1, Math.round(maxClaims * (0.7 + f.cfg.ai.expansion * 0.5))));

  const hops = mine.length ? game.galaxy.hopsFrom(mine.map(s => s.id), SW.AIConfig.expansion.maxFrontierDistance) : {};
  let reachableNeutral = 0;
  for (const s of neutral) if (hops[s.id] !== undefined) reachableNeutral++;

  console.log('--- ' + f.cfg.shortName + ' ---');
  console.log('  恒星 ' + mine.length + ' | 总收入金属 ' + f.income.metal.toFixed(0) + ' | 总战力 ' + Math.round(totalPower));
  console.log('  可调动战力 ' + Math.round(availTotal) + '（分布在 ' + availStars + ' 个星系）');
  console.log('  舰队任务: 移动中 ' + moving + ' / 殖民 ' + claim + ' / 进攻 ' + attack +
    ' / 待命 ' + idle + ' / 防守 ' + defend + ' / 其他 ' + other);
  console.log('  进行中的扩张 ' + ongoing + ' / 上限 ' + maxClaims);
  console.log('  5 跳内可达的中立星: ' + reachableNeutral + ' / 全部中立星 ' + neutral.length);
  console.log('  姿态 ' + f.ai.posture + ' | 威胁 ' + f.ai.threatLevel.toFixed(2) +
    ' | 战争中: ' + (Object.keys(f.atWar).filter(k => f.atWar[k]).join(',') || '无'));
}

console.log('\n=== 卡住的进攻舰队（抽样 12 支） ===');
let shown = 0;
for (const f of game.fleets.fleets) {
  if (f.mission !== 'attack' || f.move) continue;
  if (shown++ >= 12) break;
  const st = game.galaxy.get(f.starId);
  const cap = st && st.capture ? (st.capture.factionId + ' ' + Math.round(st.capture.progress / st.capture.total * 100) + '%') : '无';
  console.log('  ' + f.name + ' (' + SW.FactionById[f.factionId].shortName + ') 位于 ' +
    (st ? st.name : '?') + ' | 归属 ' + (st && st.owner ? SW.FactionById[st.owner].shortName : '中立') +
    ' | 防御 ' + (st ? Math.round(st.defenseHp) + '/' + Math.round(st.defenseMaxHp) : '-') +
    ' | 占领 ' + cap +
    ' | 战力 ' + Math.round(f.power) + ' | 舰船 ' + f.totalShips() +
    ' | 停留星系敌方舰队 ' + (st ? game.fleets.enemiesAt(st.id, f.factionId).length : '-'));
}

/* 抽样检查中立星为什么没人要 */
console.log('\n=== 中立星抽样 ===');
const sample = neutral.slice(0, 8);
for (const s of sample) {
  let nearest = null, nd = Infinity;
  for (const f of game.factions.list) {
    for (const ms of game.galaxy.starsOf(f.id)) {
      const d = Math.hypot(ms.x - s.x, ms.y - s.y);
      if (d < nd) { nd = d; nearest = f; }
    }
  }
  const hopsAll = game.galaxy.hopsFrom(game.galaxy.stars.filter(x => x.owner).map(x => x.id), 99);
  console.log('  ' + s.name + ' | 度数 ' + s.degree + ' | 资源 金' + s.base.metal + '/暗' + s.base.darkMatter +
    '/材' + s.base.materials + '/研' + s.base.research +
    ' | 战略值 ' + s.strategicValue +
    ' | 距最近势力 ' + (nearest ? nearest.cfg.shortName : '?') + ' ' + Math.round(nd) +
    ' | 全图跳数 ' + (hopsAll[s.id] !== undefined ? hopsAll[s.id] : '不可达'));
}
