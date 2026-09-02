/* ===========================================================
 * 速度 / 缩放 / 战术近景功能测试
 * 运行：node tools/feature-test.js
 * =========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const drawCalls = {};
const noop = function () { };

function count(name) {
  drawCalls[name] = (drawCalls[name] || 0) + 1;
}

function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createRadialGradient' || p === 'createLinearGradient') {
        return () => ({ addColorStop: noop });
      }
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return { width: 1600, height: 900 };
      return (...args) => { count(String(p)); return undefined; };
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

function makeEl() {
  return {
    style: {}, dataset: {}, children: [], classList: {
      add: noop, remove: noop, toggle: noop, contains: () => false
    },
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
global.devicePixelRatio = 1;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  key(i) { return Object.keys(this._d)[i]; },
  get length() { return Object.keys(this._d).length; }
};

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
for (const file of FILES) {
  const full = path.join(ROOT, file);
  vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
}

function check(condition, message) {
  if (!condition) {
    console.error('FAIL: ' + message);
    process.exit(1);
  }
}

const SW = global.SW;
const timeCfg = SW.GalaxyConfig.time;

/* 舰船配置：十类舰船必须拥有可辨识的尺寸、轮廓与攻击描述。 */
const shipReport = SW.validateShipConfig();
check(shipReport.valid, '十类舰船 visual/attackStyle 配置无效：' + shipReport.errors.join(', '));
check(shipReport.shapeCount >= 10 && shipReport.attackCount >= 8 && shipReport.sizeCount >= 6,
  '十类舰船的轮廓、攻击方式或尺寸差异不足');
const glyphCtx = makeCtx();

/* 速度：默认 1x、暂停不推进、暂停后恢复原倍率；兼容旧的 speedIndex=0 存档。 */
const time = new SW.GameTimeManager(timeCfg);
check(timeCfg.defaultSpeed === 1, '默认速度应为 1x');
check(time.speed === 1, '新时间管理器应从 1x 开始');
const speed4 = timeCfg.speeds.indexOf(4);
time.setSpeedIndex(speed4);
check(time.speed === 4, '应能切换到 4x');
check(time.advance(1) > 0, '活动速度应产生模拟步数');
const pausedDay = time.day;
time.setPaused(true);
check(time.speed === 0 && time.advance(5) === 0 && time.day === pausedDay, '暂停必须阻止时间推进');
time.setPaused(false);
check(time.speed === 4, '取消暂停应恢复暂停前的 4x');
const oldSaveTime = new SW.GameTimeManager(timeCfg);
oldSaveTime.deserialize({ day: 12, speedIndex: 0, paused: true, acc: 0, real: 0 });
oldSaveTime.setPaused(false);
check(oldSaveTime.speed === 1, '旧的暂停存档应回退到新的默认 1x');

const canvas = makeEl();
const game = new SW.Game(canvas);
const renderer = game.renderer;
renderer.buildBackground = function () {
  this.bg = { width: 1024, height: 1024 };
  this.bgScale = 1;
};
renderer.buildTerritory = function () {
  this.territory = {};
  this.territoryDirty = false;
  this.territorySize = 700;
};
game.newGame({ starCount: 100, seed: 246813579 });

/* F：专用船坞升级链、辅助产能与生产等级边界。 */
const dockFaction = game.factions.list[0];
const savedDockRes = Object.assign({}, dockFaction.res);
const savedDockTech = Object.assign({}, dockFaction.tech.completed);
for (const id of SW.ShipOrder) {
  const tech = SW.ShipConfig[id].tech;
  if (tech) dockFaction.tech.completed[tech] = true;
}
for (const tech of ['tech_shipyard_large', 'tech_super_dock']) dockFaction.tech.completed[tech] = true;
const dockType = Object.keys(SW.StarTypeConfig)[0];
const dockFeature = Object.keys(SW.StarFeatureConfig)[0];
function makeDockStar(id, buildingIds) {
  const star = new SW.StarSystem(id, 0, 0, dockType, dockFeature, new SW.U.RNG(90210));
  star.owner = dockFaction.id;
  star.devLevel = 5;
  star.buildings = buildingIds.map(buildingId => ({ id: buildingId, hp: 100, maxHp: 100 }));
  star.queue = [];
  star.recomputeShipyardCache();
  return star;
}
const dockStar = makeDockStar('__dock_upgrade__', ['shipyard', 'mine', 'materialPlant', 'researchLab', 'defensePlatform']);
const auxStar = makeDockStar('__dock_aux__', ['shipyard', 'auto_factory', 'mega_forge']);
const dockEconomy = new SW.EconomySystem({
  galaxy: { stars: [dockStar] },
  factions: { list: [dockFaction], get: id => id === dockFaction.id ? dockFaction : null },
  events: { record: noop }, combat: { starFleets: {} }
});
dockFaction.res = { metal: 100000, darkMatter: 100000, materials: 100000, research: 100000 };
const regularDockShips = SW.ShipOrder.filter(id => SW.StarSystem.dockLevelFor(id) === 1);
const largeDockShips = SW.ShipOrder.filter(id => SW.StarSystem.dockLevelFor(id) === 2);
const capitalDockShips = SW.ShipOrder.filter(id => SW.StarSystem.dockLevelFor(id) === 3);
check(SW.BuildingConfig.shipyard.shipyard.dedicated === true && SW.BuildingConfig.shipyard.shipyard.slots === 3 &&
  SW.BuildingConfig.shipyardLarge.shipyard.dedicated === true && SW.BuildingConfig.shipyardLarge.shipyard.upgradeFrom === 'shipyard' &&
  SW.BuildingConfig.shipyardLarge.shipyard.slots === 8 && SW.BuildingConfig.superDock.shipyard.upgradeFrom === 'shipyardLarge' &&
  SW.BuildingConfig.superDock.shipyard.slots === 14, '专用船坞配置必须形成 3/8/14 升级链');
check(dockStar.shipyardSlots === 3 && dockStar.shipyardLevel === 1 && dockStar.freeSlots() === 0 &&
  regularDockShips.every(id => game.production.canBuildAt(dockStar, id, dockFaction)) &&
  largeDockShips.every(id => !game.production.canBuildAt(dockStar, id, dockFaction)) &&
  capitalDockShips.every(id => !game.production.canBuildAt(dockStar, id, dockFaction)),
  '普通专用船坞只能生产普通舰艇');
check(auxStar.shipyardSlots === 7 && auxStar.shipyardLevel === 1 && auxStar.shipyardSpeed === 1.25 &&
  !game.production.canBuildAt(auxStar, largeDockShips[0], dockFaction),
  '辅助产能应增加生产线/速度但不能冒充专用船坞等级');
const oldChooseBuilding = game.buildings.chooseBuilding;
game.buildings.chooseBuilding = () => 'shipyardLarge';
const queuedLarge = game.buildings.tryBuild(dockStar, dockFaction, {});
game.buildings.chooseBuilding = oldChooseBuilding;
check(queuedLarge && dockStar.queue.length === 1 && dockStar.queue[0].upgradeFrom === 'shipyard' &&
  !dockStar.canBuild('shipyardLarge') && !dockStar.canBuild('superDock'),
  '大型船坞必须从普通船坞升级且不得重复排队');
dockStar.queue[0].remaining = 0;
dockEconomy.update(0);
check(dockStar.queue.length === 0 && dockStar.buildings.filter(b => dockStar.isDedicatedShipyard(b.id)).length === 1 &&
  dockStar.buildings.some(b => b.id === 'shipyardLarge') && !dockStar.buildings.some(b => b.id === 'shipyard') &&
  dockStar.shipyardSlots === 8 && dockStar.shipyardLevel === 2 &&
  regularDockShips.concat(largeDockShips).every(id => game.production.canBuildAt(dockStar, id, dockFaction)) &&
  capitalDockShips.every(id => !game.production.canBuildAt(dockStar, id, dockFaction)),
  '大型船坞完工后应替换旧船坞并开放普通/大型舰艇');
const queuedSuper = dockEconomy.queueBuilding(dockStar, 'superDock', dockFaction);
check(queuedSuper && dockStar.freeSlots() === 0 && dockStar.queue.length === 1 &&
  dockStar.queue[0].upgradeFrom === 'shipyardLarge' && !dockStar.canBuild('superDock'),
  '超级船坞必须从大型船坞升级且满建筑槽时仍可排队');
dockStar.queue[0].remaining = 0;
dockEconomy.update(0);
const restoredDock = SW.StarSystem.deserialize(dockStar.serialize());
check(dockStar.queue.length === 0 && dockStar.buildings.filter(b => dockStar.isDedicatedShipyard(b.id)).length === 1 &&
  dockStar.buildings.some(b => b.id === 'superDock') && dockStar.shipyardSlots === 14 && dockStar.shipyardLevel === 3 &&
  SW.ShipOrder.every(id => game.production.canBuildAt(dockStar, id, dockFaction)) &&
  restoredDock.shipyardSlots === 14 && restoredDock.shipyardLevel === 3 &&
  restoredDock.buildings.filter(b => restoredDock.isDedicatedShipyard(b.id)).length === 1,
  '超级船坞完工后应开放全部舰艇且存档缓存干净');
dockFaction.res = savedDockRes;
dockFaction.tech.completed = savedDockTech;

/* 缩放：检查鼠标锚点保持同一世界坐标，并检查上下限。 */
const camera = game.camera;
camera.x = 130;
camera.y = -75;
camera.zoom = camera.targetZoom = 1;
const anchorX = 1110, anchorY = 270;
const before = camera.screenToWorld(anchorX, anchorY);
camera.zoomBy(1.8, anchorX, anchorY);
const after = camera.screenToWorld(anchorX, anchorY);
check(Math.abs(before.x - after.x) < 1e-8 && Math.abs(before.y - after.y) < 1e-8, '鼠标位置应作为缩放锚点');
camera.zoomBy(100);
check(camera.targetZoom === camera.maxZoom, '缩放应受最大值限制');
camera.zoomBy(0.0001);
check(camera.targetZoom === camera.minZoom, '缩放应受最小值限制');

/* 构造一个只供渲染检查使用的双方战斗，不改变战斗系统的模拟规则。 */
const byFaction = {};
for (const fleet of game.fleets.fleets) {
  if (!fleet.isEmpty() && !byFaction[fleet.factionId]) byFaction[fleet.factionId] = fleet;
}
const factions = Object.keys(byFaction);
check(factions.length >= 2, '测试银河应至少有两个势力舰队');
const fleetA = byFaction[factions[0]];
const fleetB = byFaction[factions[1]];
const battleStar = game.galaxy.get(fleetA.starId);
check(!!battleStar, '测试战场应有星系');
fleetB.starId = battleStar.id;
fleetB.move = null;
fleetB.mission = 'attack';
const battle = {
  id: 'TEST-BATTLE', starId: battleStar.id, intensity: 420, peakPower: 500,
  sides: {}, day: 1, effectsEnabled: true
};
battle.sides[fleetA.factionId] = { factionId: fleetA.factionId, fleets: [fleetA], power: fleetA.power, pd: 0 };
battle.sides[fleetB.factionId] = { factionId: fleetB.factionId, fleets: [fleetB], power: fleetB.power, pd: 0 };
game.combat.battles = [battle];
game.combat.byStar = {};
game.combat.byStar[battleStar.id] = battle;

camera.x = battleStar.x;
camera.y = battleStar.y;
camera.zoom = camera.targetZoom = 1.6;
const visualA = renderer.fleetVisualPosition(fleetA);
const visualB = renderer.fleetVisualPosition(fleetB);
check(camera.zoom >= camera.tacticalZoom, '战术倍率应开启近景');
check(Math.hypot(visualA.x - visualB.x, visualA.y - visualB.y) > 20, '参战舰队应在星系内部形成可见编队间距');

let tacticalDraws = 0;
const drawTactical = renderer._drawTacticalBattles;
renderer._drawTacticalBattles = function (ctx, vb) {
  tacticalDraws++;
  return drawTactical.call(this, ctx, vb);
};
renderer.render(0.016);
check(tacticalDraws === 1, '近景渲染应进入战术交战区图层');
check((drawCalls.arc || 0) > 0 && (drawCalls.fillText || 0) > 0, '战术图层应绘制战场与舰队细节');

/* 战斗特效应使用舰队的近景坐标，而不是全部堆在星系中心。 */
game.events.emit('combatShot', {
  starId: battleStar.id, weapon: 'laser', color: '#ff5d6c',
  sourceFleetId: fleetA.id, targetFleetId: fleetB.id, scale: 1
});
const beam = game.effects.beams[game.effects.beams.length - 1];
check(beam && Math.hypot(beam.x0 - visualA.x, beam.y0 - visualA.y) < 8 && Math.hypot(beam.x1 - visualB.x, beam.y1 - visualB.y) < 8,
  '近景战斗光束应连接参战舰队位置');

camera.zoom = camera.targetZoom = 0.5;
game.select({ type: 'fleet', id: fleetA.id });
check(camera.targetZoom >= camera.battleFocusZoom && camera.x === battleStar.x && camera.y === battleStar.y,
  '点击战斗舰队应自动聚焦到战术近景');

/* 舰船轮廓绘制不得退化为同一默认三角形。 */
for (const shipId of SW.ShipOrder) {
  const cfg = SW.ShipConfig[shipId];
  renderer._drawShipGlyph(glyphCtx, 0, 0, cfg,
    { count: 1, hp: cfg.hp, maxHp: cfg.hp, shield: cfg.shield, maxShield: cfg.shield },
    SW.FactionById[fleetA.factionId], 0, 1);
}

/* A：不同 starId 的舰队不能建战、互伤或生成跨星系光束；移动中的舰队也不入索引。 */
const factionA = game.factions.list[0];
const factionB = game.factions.list[1];
factionA.atWar[factionB.id] = true;
factionB.atWar[factionA.id] = true;
const neutralStars = game.galaxy.stars.filter(s => s.owner === null);
check(neutralStars.length >= 2, '跨星系战斗边界测试需要两个中立星系');
const crossStarA = neutralStars[0];
const crossStarB = neutralStars[1];
const crossA = game.fleets.create(factionA.id, crossStarA.id, 'main');
const crossB = game.fleets.create(factionB.id, crossStarB.id, 'main');
crossA.addShips('corvette', 2);
crossB.addShips('corvette', 2);
game.combat.battles = [];
game.combat.byStar = {};
game.combat.rebuildIndex();
game.combat.scan();
check(!game.combat.byStar[crossStarA.id] && !game.combat.byStar[crossStarB.id], '不同 starId 的舰队不应创建战斗');
crossA.move = { path: [crossStarA.id, crossStarB.id], seg: 0, t: 0.4, segDays: 2 };
crossA.starId = null;
game.combat.rebuildIndex();
check(!Object.keys(game.combat.starFleets).some(id => game.combat.starFleets[id].indexOf(crossA) >= 0), '移动中的舰队不得进入 starFleets');
crossA.starId = crossStarA.id;
crossA.move = null;
const crossBattle = {
  id: 'CROSS-BATTLE', starId: crossStarA.id, day: 0, intensity: 0, peakPower: 0, effectsEnabled: true,
  sides: {}
};
crossBattle.sides[factionA.id] = { factionId: factionA.id, fleets: [crossA], power: crossA.power, pd: 0 };
crossBattle.sides[factionB.id] = { factionId: factionB.id, fleets: [crossB], power: crossB.power, pd: 0 };
game.combat.battles = [crossBattle];
game.combat.byStar = {};
game.combat.byStar[crossStarA.id] = crossBattle;
const crossHp = crossB.units[0].hp;
check(game.combat._damageUnit(crossBattle, crossStarA, { fleet: crossB, unit: crossB.units[0] }, 100, 'laser', 0, crossA, crossA.units[0]) === false &&
  crossB.units[0].hp === crossHp, '不同 starId 的舰队不得互相造成伤害');
game.effects.clear();
game.events.emit('combatShot', { battleId: crossBattle.id, starId: crossStarA.id, weapon: 'laser', color: '#ff5d6c',
  sourceFleetId: crossA.id, targetFleetId: crossB.id, scale: 1 });
check(game.effects.beams.length === 0 && game.effects.particles.length === 0, '不同 starId 的舰队不得生成跨星系攻击特效');
game.fleets.remove(crossA);
game.fleets.remove(crossB);

/* C：真实伤害、交火 tick 与特效寿命都要给 1x 留出可观察窗口。 */
const combatCfg = SW.CombatConfig;
check(combatCfg.battleDamageMultiplier > 0 && combatCfg.battleDamageMultiplier < 0.5,
  '战斗伤害倍率没有降低到可观察节奏');
check(timeCfg.combatTickDays >= 0.1, '战斗 tick 过密，缺少可读交火间隔');
check(combatCfg.maxVisualShotsPerSecond <= 12 && combatCfg.visual.beamLife >= 0.5 && combatCfg.visual.torpedoLife >= 1.0,
  '战斗特效预算或寿命不足');
const paceStar = crossStarA;
const paceA = game.fleets.create(factionA.id, paceStar.id, 'main');
const paceB = game.fleets.create(factionB.id, paceStar.id, 'main');
paceA.addShips('corvette', 2);
paceB.addShips('corvette', 2);
const paceBattle = new SW.Battle('PACE-BATTLE', paceStar.id);
paceBattle.sides[factionA.id] = { factionId: factionA.id, fleets: [paceA], power: paceA.power, pd: 0 };
paceBattle.sides[factionB.id] = { factionId: factionB.id, fleets: [paceB], power: paceB.power, pd: 0 };
game.combat.battles = [paceBattle];
game.combat.byStar = {};
game.combat.byStar[paceStar.id] = paceBattle;
for (let i = 0; i < 5; i++) game.combat._tick(paceBattle, timeCfg.combatTickDays);
check(paceA.totalShips() > 0 && paceB.totalShips() > 0 && paceBattle.day >= timeCfg.combatTickDays * 5,
  '受控战斗不应在几个 tick 内瞬间结束');
game.fleets.remove(paceA);
game.fleets.remove(paceB);
game.combat.battles = [];
game.combat.byStar = {};

/* D：低兵力不出击；分散兵力需先在集结点会合；强守军前不派单舰。 */
const military = new SW.MilitaryAI(game);
const ownedStars = game.galaxy.starsOf(factionA.id);
check(ownedStars.length >= 2, 'AI 集结测试需要两个己方星系');
const targetStar = game.galaxy.stars.find(s => s.owner === null && ownedStars.every(o => o.id !== s.id));
check(!!targetStar, 'AI 集结测试需要一个非己方目标星系');
function clearTestFleets() {
  for (const f of game.fleets.fleets.slice()) game.fleets.remove(f);
  game.combat.starFleets = {};
}
clearTestFleets();
const weak = game.fleets.create(factionA.id, ownedStars[0].id, 'main');
weak.addShips('corvette', 1);
check(military._launchAttack(factionA, targetStar, SW.AIConfig.military.minAttackPower) === null &&
  !game.fleets.fleets.some(f => f.mission === 'attack' || f.mission === 'rally'), '低兵力不应启动攻击计划');
clearTestFleets();
const donorA = game.fleets.create(factionA.id, ownedStars[0].id, 'main');
const donorB = game.fleets.create(factionA.id, ownedStars[1].id, 'main');
donorA.addShips('corvette', 9);
donorB.addShips('corvette', 9);
const firstRally = military._launchAttack(factionA, targetStar, SW.AIConfig.military.minAttackPower);
check(firstRally === null && game.fleets.fleets.some(f => f.mission === 'rally' && f.attackTargetStarId === targetStar.id && f.move),
  '分散在多星系的兵力应先移动到集结点等待');
const stagingId = game.fleets.fleets.find(f => f.mission === 'rally' && f.rallyStarId)?.rallyStarId;
check(!!stagingId, '集结计划应记录明确的 staging 星系');
for (const f of game.fleets.fleets.slice()) {
  if (f.mission === 'rally' && f.rallyStarId === stagingId && f.move) {
    f.starId = stagingId; f.move = null; f.targetStarId = null;
  }
}
const assembledAttack = military._launchAttack(factionA, targetStar, SW.AIConfig.military.minAttackPower);
check(assembledAttack && assembledAttack.mission === 'attack' && assembledAttack.move && assembledAttack.power >= SW.AIConfig.military.minAttackPower,
  '集结完成后应以足够兵力发起单个远征');
check(military._launchAttack(factionA, targetStar, SW.AIConfig.military.minAttackPower) === null &&
  game.fleets.fleets.filter(f => f.mission === 'attack' && f.attackTargetStarId === targetStar.id).length === 1,
  '同一目标不得重复创建多个小规模攻击计划');
clearTestFleets();
targetStar.owner = factionB.id;
targetStar.defenseHp = 0;
targetStar.defenseDamage = 0;
const loneAttacker = game.fleets.create(factionA.id, ownedStars[0].id, 'main');
loneAttacker.addShips('corvette', 12);
const strongGarrison = game.fleets.create(factionB.id, targetStar.id, 'defense');
strongGarrison.addShips('destroyer', 20);
const strongNeed = military._defenseOf(targetStar, factionA) * (SW.AIConfig.military.attackCommitRatio || 1.42);
check(military._launchAttack(factionA, targetStar, Math.max(SW.AIConfig.military.minAttackPower, strongNeed)) === null &&
  !game.fleets.fleets.some(f => f.factionId === factionA.id && (f.mission === 'attack' || f.mission === 'rally')),
  '目标守军明显更强时不得派单舰送死');

/* E：资源节奏与生产 AI 必须使用确定性的库存 / 局势决策。 */
const resourceKeys = SW.ResourceConfig.order;
check(resourceKeys.every(k => Number.isFinite(SW.ResourceConfig.globalMult[k])),
  '四种资源必须拥有独立的全局产出系数');
check(SW.ResourceConfig.globalMult.metal < 0.68 &&
  SW.ResourceConfig.globalMult.darkMatter < SW.ResourceConfig.globalMult.metal &&
  SW.ResourceConfig.globalMult.materials < SW.ResourceConfig.globalMult.darkMatter,
  '金属应低于旧系数 .68，暗物质和高级材料应进一步降低');
check(SW.ResourceConfig.globalMult.research === 1.0,
  '研究点系数不得被金属节奏调节误伤');
check(SW.ResourceConfig.tempo && SW.ResourceConfig.tempo.phaseMult,
  '资源节奏必须提供配置化阶段曲线');
check(SW.ResourceConfig.tempo.inventory && SW.ResourceConfig.tempo.inventory.softCapRatio &&
  SW.ResourceConfig.tempo.inventory.floorMultiplier,
  '资源节奏必须保留库存软抑制兼容配置');
const stockPressureCfg = SW.AIConfig.production.stockPressure;
check(stockPressureCfg && stockPressureCfg.triggerRatio.metal === 0.50 &&
  stockPressureCfg.triggerRatio.darkMatter === 0.50 &&
  stockPressureCfg.triggerRatio.materials === 0.50,
  '造舰库存压力必须按资源配置并在约 50% cap 触发');
const machineCfg = SW.FactionById.B;
check(machineCfg.mods.metal < 0.30 && machineCfg.mods.buildSpeed < 0.30 &&
  machineCfg.mods.shipCost > -0.10 && machineCfg.ai.expansion < 0.85,
  '智械 B 的资源/工业/扩张放大仍过强');
const machineFactory = SW.BuildingConfig.auto_factory;
check(machineFactory.yield.metal.flat <= 20 && machineFactory.yield.metal.mult <= 0.20 &&
  machineFactory.shipyard.slots <= 2 && machineFactory.shipyard.speed <= 1.40,
  '智械专属工厂放大源未收窄');
check(SW.TechById.u_mac_swarm.effects.buildSpeed <= 0.16 &&
  SW.TechById.u_mac_core.effects.buildSpeed <= 0.18,
  '智械专属工业科技放大源未收窄');
const probeStar = game.galaxy.get(factionA.homeStarId);
const researchYieldBefore = game.economy.starYield(probeStar, factionA).research;
const metalMultBefore = SW.ResourceConfig.globalMult.metal;
SW.ResourceConfig.globalMult.metal = metalMultBefore * 0.25;
const researchYieldAfter = game.economy.starYield(probeStar, factionA).research;
SW.ResourceConfig.globalMult.metal = metalMultBefore;
check(Math.abs(researchYieldBefore - researchYieldAfter) < 1e-9,
  '调整金属产出不得改变研究点产出');

/* 以固定 360 银河天入账一次，四国都不应在目标开局窗口撞 cap。 */
clearTestFleets();
game.production.lines = {};
game.economy.update(360);
for (const f of game.factions.list) {
  for (const k of resourceKeys) {
    const cap = SW.ResourceConfig.cap[k];
    check(f.res[k] < cap, f.name + ' 在 360 银河天资源不应触及 ' + k + ' cap');
  }
}
game.economy.update(360);
for (const f of game.factions.list) {
  for (const k of resourceKeys) {
    const cap = SW.ResourceConfig.cap[k];
    check(f.res[k] < cap, f.name + ' 在 720 银河天资源不应触及 ' + k + ' cap');
  }
}

const productionStar = game.galaxy.get(factionA.homeStarId);
check(productionStar && productionStar.owner === factionA.id && productionStar.shipyardSlots > 0,
  '生产 AI 测试需要己方空闲船坞');
factionA.stats.starsOwned = game.galaxy.starsOf(factionA.id).length;
factionA.stats.starsLost = 0;
factionA.atWar = {};
factionA.ai.posture = 'develop';
factionA.ai.threatLevel = 0;
factionA.ai.phase = 'early';
factionA.upkeep = { metal: 1, darkMatter: 0, materials: 0, research: 0 };
factionA.income = { metal: 0, darkMatter: 0, materials: 0, research: 0 };
factionA.res = { metal: 1800, darkMatter: 80, materials: 10, research: 0 };
game.production.lines = {};
const productionAI = new SW.ProductionAI(game);
const normalDecision = productionAI.run(factionA);
check(!normalDecision.emergency && normalDecision.orders > 0,
  '库存达到 spending threshold 且船坞空闲时应稳定下单，即使金属净收入为 0');

/* 各资源达到约一半 cap 时，常态预算和订单额度应明显上升，并实际消费库存。 */
game.production.lines = {};
const pressureStock = {
  metal: SW.ResourceConfig.cap.metal * 0.55,
  darkMatter: SW.ResourceConfig.cap.darkMatter * 0.55,
  materials: SW.ResourceConfig.cap.materials * 0.55,
  research: 0
};
factionA.res = pressureStock;
const pressureMetalBefore = factionA.res.metal;
const pressureDecision = productionAI.run(factionA);
check(!pressureDecision.emergency && pressureDecision.stockPressureTriggered &&
  pressureDecision.stockPressure >= 0.99,
  '库存超过 50% cap 时应进入高库存压力区而非误判为战争应急');
check(pressureDecision.budgetMetal > normalDecision.budgetMetal &&
  pressureDecision.orderLimit > normalDecision.orderLimit &&
  pressureDecision.orders > 0 && pressureDecision.spentMetal > 0 &&
  factionA.res.metal < pressureMetalBefore,
  '高库存压力必须提高预算/订单并实际消费金属');

/* 濒危且接近软上限：预算应明显提高，并优先排入便宜快速舰。 */
game.production.lines = {};
const mixStar = productionStar;
const mixDock = mixStar.buildings.find(b => {
  const cfg = SW.BuildingConfig[b.id];
  return cfg && cfg.shipyard && cfg.shipyard.dedicated;
});
const mixDockId = mixDock && mixDock.id;
if (mixDock) mixDock.id = 'shipyardLarge';
mixStar.recomputeShipyardCache();
mixStar.shipyardSlots = Math.max(12, mixStar.shipyardSlots);
for (const techId of ['tech_destroyer', 'tech_cruiser', 'tech_battlecruiser',
  'tech_torpedo', 'tech_battleship', 'tech_dreadnought']) factionA.tech.completed[techId] = true;
factionA.recomputeMods();
const mixFleet = game.fleets.create(factionA.id, mixStar.id, 'main');
mixFleet.addShips('corvette', 10);
factionA.stats.starsLost = 0;
factionA.res = { metal: 6000, darkMatter: 1000, materials: 200, research: 0 };
game.production.lines = {};
const mixDecision = new SW.ProductionAI(game).run(factionA);
const mixLines = Object.keys(game.production.lines).reduce((all, id) => all.concat(game.production.lines[id]), []);
const lowLines = mixLines.filter(line => SW.ShipConfig[line.shipId].size <= 2);
const highLines = mixLines.filter(line => SW.ShipConfig[line.shipId].size >= 5);
check(mixDecision.orders > 0 && lowLines.length > highLines.length &&
  highLines.length <= 1,
  '常态舰队应以低级舰为主，高级舰只能少量出现（低' + lowLines.length +
  '/中' + (mixLines.length - lowLines.length - highLines.length) +
  '/高' + highLines.length + '，总' + mixLines.length + '：' +
  mixLines.map(line => line.shipId).join(',') + '）');
game.production.lines = {};
factionA.stats.starsLost = 2;
factionA.res = { metal: 2000, darkMatter: 200, materials: 40, research: 0 };
const emergencyAI = new SW.ProductionAI(game);
const emergencyDecision = emergencyAI.run(factionA);
check(emergencyDecision.emergency && emergencyDecision.budgetMetal > normalDecision.budgetMetal && emergencyDecision.orders > 0,
  '濒危库存应提高造舰预算并实际下单');
const emergencyLines = Object.keys(game.production.lines).reduce((all, id) => all.concat(game.production.lines[id]), []);
check(emergencyLines.length > 0 && emergencyLines.every(line => SW.ShipConfig[line.shipId].size <= SW.AIConfig.production.emergencyMaxShipSize),
  '濒危造舰应优先便宜快速舰');
if (mixDock) { mixDock.id = mixDockId; mixStar.recomputeShipyardCache(); }

/* 优势进攻的目标评分：相邻敌对星系必须优于无必要的远程目标。 */
const adjacentTargetValue = military._targetValue(targetStar, factionA, true, 1);
const remoteTargetValue = military._targetValue(targetStar, factionA, true, 3);
check(SW.AIConfig.military.targetValueWeight.adjacent > 0 &&
  adjacentTargetValue > remoteTargetValue,
  '优势时应优先选择相邻敌对目标');

/* ships 达到目标 cap 但 power 仍有 room 时，不得被旧的 OR 条件截停。 */
game.production.lines = {};
const roomAI = new SW.ProductionAI(game);
roomAI.fleetCap = () => ({ ships: 10, power: 100 });
roomAI._currentForce = () => ({ ships: 10, power: 20 });
const roomDecision = roomAI.run(factionA);
check(roomDecision.orders > 0, 'ships 已达目标软上限但 power 有 room 时仍应允许下单');

console.log('速度 / 缩放 / 战术近景功能测试通过');
