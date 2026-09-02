/* ===========================================================
 *  shipConfig —— 舰船等级 / 武器 / 属性 / 成本 / 科技需求
 *  size: 1~10，用于武器克制判定
 *  weapons: [{type, count, damage, rate}]  rate = 每银河天的射击次数
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  /* ---------------- 武器类型与克制 ---------------- */
  SW.WeaponConfig = {
    laser:       { name: '激光炮',   color: '#ff5d6c', vsShield: 1.6, vsArmor: 0.6, pd: 0,   sizePref: [2, 4], desc: '对护盾高效' },
    particle:    { name: '粒子炮',   color: '#ff9de0', vsShield: 1.2, vsArmor: 1.1, pd: 0,   sizePref: [3, 6], desc: '均衡穿透' },
    plasma:      { name: '等离子炮', color: '#ffa64d', vsShield: 1.0, vsArmor: 1.35, pd: 0,  sizePref: [3, 7], desc: '对装甲高效' },
    massDriver:  { name: '质量加速炮', color: '#c8d2dc', vsShield: 0.7, vsArmor: 1.5, pd: 0, sizePref: [2, 5], desc: '动能穿甲' },
    railgun:     { name: '轨道炮',   color: '#9fd8ff', vsShield: 0.75, vsArmor: 1.9, pd: 0,  sizePref: [4, 8], desc: '超远程穿甲' },
    missile:     { name: '导弹',     color: '#ffe066', vsShield: 1.0, vsArmor: 0.95, pd: 1, sizePref: [2, 7], desc: '可被点防御拦截' },
    torpedo:     { name: '鱼雷',     color: '#ffb020', vsShield: 0.9, vsArmor: 1.4, pd: 1,  sizePref: [5, 10], desc: '对大型舰船毁灭性打击' },
    ion:         { name: '离子炮',   color: '#7fe7ff', vsShield: 2.2, vsArmor: 0.3, pd: 0,  sizePref: [1, 5], desc: '专破护盾' },
    darkmatter:  { name: '暗物质炮', color: '#b06cff', vsShield: 1.25, vsArmor: 1.4, pd: 0, sizePref: [4, 10], desc: '无视部分装甲' },
    fighter:     { name: '舰载机',   color: '#8affc1', vsShield: 1.0, vsArmor: 1.15, pd: 1, sizePref: [4, 8], desc: '持续打击，可被拦截' },
    superWeapon: { name: '超级主炮', color: '#fff2a8', vsShield: 1.3, vsArmor: 1.6, pd: 0,  sizePref: [6, 10], desc: '战略级武器，范围伤害' },
    pointDefense:{ name: '点防御',   color: '#9effc9', vsShield: 1.0, vsArmor: 0.6, pd: 2,  sizePref: [1, 3], desc: '拦截导弹/鱼雷/舰载机' }
  };

  /* 舰体大小分级 -> 鱼雷等武器的倍率 */
  SW.SizeClass = {
    small:  { max: 2, torpedoMult: 0.28, hitMult: 1.25 },   // 护卫/驱逐：难命中
    medium: { max: 4, torpedoMult: 1.0, hitMult: 1.0 },
    large:  { max: 7, torpedoMult: 2.2, hitMult: 0.85 },
    capital:{ max: 99, torpedoMult: 3.0, hitMult: 0.7 }     // 泰坦/旗舰：易被大口径命中
  };

  /* ---------------- 舰船 ---------------- */
  SW.ShipConfig = {
    corvette: {
      id: 'corvette', name: '护卫舰', tier: 1, size: 1, tech: null,
      hp: 70, shield: 22, armor: 4, speed: 1.65, range: 4, power: 3,
      weapons: [{ type: 'laser', count: 2, damage: 6.5, rate: 15 }],
      cost: { metal: 135, darkMatter: 0, materials: 0 }, buildDays: 6,
      role: 'scout', priority: 'small', desc: '最快最便宜，用于侦察、快速占领与骚扰。',
      visual: { shape: 'needle', scale: 0.68, engines: 2, mounts: 2, accent: '#ffb3c1' },
      attackStyle: { primary: 'laser', effect: 'beam', pattern: 'twin-lance', desc: '双联激光长束，连续压制护盾。' }
    },
    destroyer: {
      id: 'destroyer', name: '驱逐舰', tier: 2, size: 2, tech: 'tech_destroyer',
      hp: 135, shield: 50, armor: 9, speed: 1.45, range: 5, power: 7,
      weapons: [
        { type: 'massDriver', count: 2, damage: 9, rate: 13 },
        { type: 'pointDefense', count: 2, damage: 4, rate: 22 }
      ],
      cost: { metal: 300, darkMatter: 18, materials: 0 }, buildDays: 9,
      role: 'escort', priority: 'small', desc: '防空与反护卫舰，为舰队提供点防御屏障。',
      visual: { shape: 'arrowhead', scale: 0.82, engines: 2, mounts: 3, accent: '#b6e5ff' },
      attackStyle: { primary: 'massDriver', effect: 'kinetic', pattern: 'escort-burst', desc: '短促动能齐射，并以点防御拦截来袭弹药。' }
    },
    cruiser: {
      id: 'cruiser', name: '巡洋舰', tier: 3, size: 3, tech: 'tech_cruiser',
      hp: 290, shield: 120, armor: 17, speed: 1.2, range: 7, power: 16,
      weapons: [
        { type: 'laser', count: 3, damage: 15, rate: 11 },
        { type: 'massDriver', count: 2, damage: 18, rate: 8 }
      ],
      cost: { metal: 600, darkMatter: 72, materials: 0 }, buildDays: 14,
      role: 'line', priority: 'medium', desc: '中期舰队核心，火力、护盾与速度均衡。',
      visual: { shape: 'diamond', scale: 1.00, engines: 3, mounts: 5, accent: '#ffd0ea' },
      attackStyle: { primary: 'laser', effect: 'beam', pattern: 'crossfire', desc: '多炮塔交叉激光与动能副炮组成稳定火网。' }
    },
    battlecruiser: {
      id: 'battlecruiser', name: '战列巡洋舰', tier: 4, size: 4, tech: 'tech_battlecruiser',
      hp: 470, shield: 195, armor: 26, speed: 1.3, range: 8, power: 31,
      weapons: [
        { type: 'plasma', count: 3, damage: 26, rate: 9 },
        { type: 'laser', count: 2, damage: 14, rate: 10 }
      ],
      cost: { metal: 1080, darkMatter: 156, materials: 9 }, buildDays: 20,
      role: 'line', priority: 'medium', desc: '战列舰级火力但速度更快，装甲略低。',
      visual: { shape: 'winged', scale: 1.12, engines: 3, mounts: 6, accent: '#ffd29a' },
      attackStyle: { primary: 'plasma', effect: 'plasma', pattern: 'wing-salvo', desc: '两翼等离子炮成扇面齐射，灼烧装甲。' }
    },
    torpedoBoat: {
      id: 'torpedoBoat', name: '鱼雷舰', tier: 4, size: 3, tech: 'tech_torpedo',
      hp: 240, shield: 95, armor: 11, speed: 1.15, range: 9, power: 27,
      weapons: [
        { type: 'torpedo', count: 5, damage: 62, rate: 2.6 },
        { type: 'pointDefense', count: 1, damage: 4, rate: 16 }
      ],
      cost: { metal: 690, darkMatter: 138, materials: 6 }, buildDays: 16,
      role: 'anti-capital', priority: 'large', desc: '高爆发鱼雷，专门猎杀战列舰、无畏舰与泰坦。',
      visual: { shape: 'torpedo', scale: 1.08, engines: 2, mounts: 5, accent: '#ffe18b' },
      attackStyle: { primary: 'torpedo', effect: 'torpedo', pattern: 'heavy-salvo', desc: '重型鱼雷齐射，锁定大型舰体造成毁灭性打击。' }
    },
    battleship: {
      id: 'battleship', name: '战列舰', tier: 5, size: 5, tech: 'tech_battleship',
      hp: 860, shield: 350, armor: 48, speed: 0.9, range: 11, power: 62,
      weapons: [
        { type: 'railgun', count: 4, damage: 58, rate: 4.2 },
        { type: 'laser', count: 4, damage: 18, rate: 11 }
      ],
      cost: { metal: 1980, darkMatter: 300, materials: 27 }, buildDays: 30,
      role: 'line', priority: 'large', desc: '高护甲高火力的远程主力舰。',
      visual: { shape: 'broadside', scale: 1.34, engines: 4, mounts: 8, accent: '#d8f1ff' },
      attackStyle: { primary: 'railgun', effect: 'kinetic', pattern: 'long-range-volley', desc: '远程轨道炮贯穿齐射，先手打穿装甲。' }
    },
    dreadnought: {
      id: 'dreadnought', name: '无畏舰', tier: 6, size: 6, tech: 'tech_dreadnought',
      hp: 1550, shield: 660, armor: 74, speed: 0.75, range: 12, power: 128,
      weapons: [
        { type: 'plasma', count: 6, damage: 72, rate: 4.2 },
        { type: 'railgun', count: 4, damage: 86, rate: 3.0 },
        { type: 'torpedo', count: 4, damage: 130, rate: 1.6 }
      ],
      cost: { metal: 3600, darkMatter: 585, materials: 72 }, buildDays: 45,
      role: 'line', priority: 'large', desc: '超大型主力舰，火力极高但移动缓慢。',
      visual: { shape: 'fortress', scale: 1.58, engines: 5, mounts: 12, accent: '#ffb47d' },
      attackStyle: { primary: 'plasma', effect: 'plasma', pattern: 'siege-battery', desc: '多层等离子炮与鱼雷阵列持续轰击。' }
    },
    titan: {
      id: 'titan', name: '泰坦', tier: 7, size: 8, tech: 'tech_titan',
      hp: 4600, shield: 2200, armor: 140, speed: 0.58, range: 14, power: 430,
      weapons: [
        { type: 'superWeapon', count: 2, damage: 420, rate: 0.85 },
        { type: 'darkmatter', count: 4, damage: 155, rate: 3.2 },
        { type: 'laser', count: 8, damage: 42, rate: 9 }
      ],
      cost: { metal: 9600, darkMatter: 1920, materials: 300 }, buildDays: 95,
      role: 'capital', priority: 'capital', capital: true, maxPerFaction: 5,
      desc: '战略级超级战舰，装备巨型武器，每势力最多同时拥有 5 艘。',
      visual: { shape: 'titan', scale: 1.95, engines: 6, mounts: 16, accent: '#ffe8a6' },
      attackStyle: { primary: 'superWeapon', effect: 'super', pattern: 'gravity-lance', desc: '超级主炮蓄能后释放重力长矛，并以暗物质炮补刀。' }
    },
    carrier: {
      id: 'carrier', name: '航母', tier: 7, size: 6, tech: 'tech_carrier',
      hp: 1750, shield: 760, armor: 44, speed: 0.8, range: 13, power: 165,
      weapons: [
        { type: 'fighter', count: 8, damage: 48, rate: 4.5 },
        { type: 'pointDefense', count: 6, damage: 11, rate: 18 }
      ],
      cost: { metal: 4200, darkMatter: 825, materials: 195 }, buildDays: 58,
      role: 'carrier', priority: 'large', capital: true, maxPerFaction: 12,
      desc: '部署战斗机、轰炸机与截击机，自身远离前线。',
      visual: { shape: 'carrier', scale: 1.72, engines: 4, mounts: 10, accent: '#9dffd0' },
      attackStyle: { primary: 'fighter', effect: 'fighter', pattern: 'strike-wing', desc: '释放舰载机群持续袭扰，并以点防御自保。' }
    },
    flagship: {
      id: 'flagship', name: '超级旗舰', tier: 8, size: 10, tech: 'tech_flagship',
      hp: 13500, shield: 6600, armor: 240, speed: 0.52, range: 17, power: 1250,
      weapons: [
        { type: 'superWeapon', count: 3, damage: 720, rate: 0.75 },
        { type: 'darkmatter', count: 8, damage: 230, rate: 2.6 },
        { type: 'plasma', count: 10, damage: 125, rate: 5.0 },
        { type: 'fighter', count: 10, damage: 62, rate: 3.2 }
      ],
      cost: { metal: 25800, darkMatter: 5700, materials: 990 }, buildDays: 170,
      role: 'flagship', priority: 'capital', capital: true, maxPerFaction: 1,
      desc: '文明终极战争机器，每势力仅能同时拥有 1 艘。',
      visual: { shape: 'flagship', scale: 2.25, engines: 8, mounts: 24, accent: '#fff0b5' },
      attackStyle: { primary: 'superWeapon', effect: 'super', pattern: 'command-barrage', desc: '超级主炮、暗物质炮与舰载机群协同齐射。' }
    }
  };

  /* 舰船顺序（科研/建造界面使用） */
  SW.ShipOrder = ['corvette', 'destroyer', 'cruiser', 'battlecruiser', 'torpedoBoat',
    'battleship', 'dreadnought', 'titan', 'carrier', 'flagship'];

  /* 配置断言：渲染与战斗都依赖每一类舰船拥有明确的身份描述。 */
  SW.validateShipConfig = function () {
    const errors = [];
    const shapes = new Set();
    const attacks = new Set();
    const sizes = new Set();
    for (const id of SW.ShipOrder) {
      const cfg = SW.ShipConfig[id];
      if (!cfg) { errors.push(id + ': missing config'); continue; }
      const visual = cfg.visual;
      const attack = cfg.attackStyle;
      if (!visual || typeof visual.shape !== 'string' || !Number.isFinite(visual.scale) || visual.scale <= 0) {
        errors.push(id + ': invalid visual');
      } else shapes.add(visual.shape);
      if (!attack || typeof attack.primary !== 'string' || typeof attack.effect !== 'string' || !attack.desc) {
        errors.push(id + ': invalid attackStyle');
      } else attacks.add(attack.pattern || attack.primary);
      if (!Number.isFinite(cfg.size) || cfg.size <= 0) errors.push(id + ': invalid size');
      else sizes.add(cfg.size);
      if (!Array.isArray(cfg.weapons) || !cfg.weapons.length) errors.push(id + ': missing weapons');
    }
    if (sizes.size < 2) errors.push('ship sizes are not differentiated');
    if (shapes.size < SW.ShipOrder.length) errors.push('ship silhouettes are not differentiated');
    if (attacks.size < 2) errors.push('ship attack styles are not differentiated');
    return { valid: errors.length === 0, errors: errors, shapeCount: shapes.size, attackCount: attacks.size, sizeCount: sizes.size };
  };

  /* 战斗通用参数 */
  SW.CombatConfig = {
    armorK: 110,            // 伤害减免 = armor/(armor+armorK)
    shieldRegenPerDay: 0.30,// 护盾每天回复比例
    hullRepairInFleetPerDay: 0.012,
    pdEfficiency: 0.055,    // 每点点防御强度的拦截系数
    focusFireBonus: 1.0,
    maxBattleDays: 90,      // 超过则按剩余战力判定
    retreatMorale: 0.17,    // 战力低于此比例尝试撤退
    superWeaponSplash: 0.35, // 超级主炮溅射比例
    siegeFireRatio: 0.35,     // 交战中入侵舰队分配给星系防御的火力比例
    /* 战斗节奏：伤害按银河天计算，但压低交火输出让 1x 有可观察窗口。 */
    battleDamageMultiplier: 0.16,
    maxVisualShotsPerSecond: 10,
    visualBurst: 4,
    visual: {
      beamLife: 0.58,
      superBeamLife: 0.82,
      torpedoLife: 1.35,
      missileLife: 0.95,
      explosionLife: 1.15,
      shieldFlashLife: 0.62
    },
    arrivalForceRatio: 1.18
  };
})(window.SW);
