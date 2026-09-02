/* ===========================================================
 *  buildingConfig —— 恒星系建筑
 *  cost: 建造成本；yield: 资源加成（flat 为绝对值，mult 为乘区）
 *  requireDev: 需要的开发等级；maxPerStar: 同一恒星最多数量
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  SW.BuildingConfig = {
    mine: {
      id: 'mine', name: '矿业设施', icon: '⛏', requireDev: 1, maxPerStar: 3,
      cost: { metal: 160, darkMatter: 0, materials: 0 }, buildDays: 14,
      yield: { metal: { flat: 9, mult: 0.22 } }, upkeep: { metal: 1 },
      desc: '提高金属产量'
    },
    dmExtractor: {
      id: 'dmExtractor', name: '暗物质提取器', icon: '✦', requireDev: 2, maxPerStar: 2,
      cost: { metal: 260, darkMatter: 20, materials: 4 }, buildDays: 18,
      yield: { darkMatter: { flat: 3.4, mult: 0.30 } }, upkeep: { metal: 2, darkMatter: 1 },
      desc: '提高暗物质产量'
    },
    materialPlant: {
      id: 'materialPlant', name: '高级材料工厂', icon: '⬢', requireDev: 2, maxPerStar: 2,
      cost: { metal: 420, darkMatter: 35, materials: 6 }, buildDays: 24,
      yield: { materials: { flat: 1.0, mult: 0.26 } }, upkeep: { metal: 4, darkMatter: 2 },
      desc: '生产高级材料'
    },
    researchLab: {
      id: 'researchLab', name: '科研中心', icon: '⌬', requireDev: 1, maxPerStar: 3,
      cost: { metal: 240, darkMatter: 15, materials: 2 }, buildDays: 16,
      yield: { research: { flat: 1.8, mult: 0.11 } }, upkeep: { metal: 2, darkMatter: 1 },
      desc: '产生研究点'
    },
    shipyard: {
      id: 'shipyard', name: '造船厂', icon: '⚒', requireDev: 2, maxPerStar: 1,
      cost: { metal: 340, darkMatter: 25, materials: 5 }, buildDays: 22,
      shipyard: { dedicated: true, upgradeFrom: null, level: 1, slots: 3, speed: 1.0 }, upkeep: { metal: 3 },
      desc: '生产中小型舰艇（3 条生产线）'
    },
    shipyardLarge: {
      id: 'shipyardLarge', name: '大型造船厂', icon: '⚔', requireDev: 3, maxPerStar: 1,
      cost: { metal: 900, darkMatter: 110, materials: 18 }, buildDays: 40,
      shipyard: { dedicated: true, upgradeFrom: 'shipyard', level: 2, slots: 8, speed: 1.25 }, upkeep: { metal: 8, darkMatter: 3 },
      tech: 'tech_shipyard_large',
      desc: '建造大型战舰（8 条生产线，速度 +25%）'
    },
    superDock: {
      id: 'superDock', name: '超级船坞', icon: '☰', requireDev: 4, maxPerStar: 1,
      cost: { metal: 2400, darkMatter: 420, materials: 70 }, buildDays: 70,
      shipyard: { dedicated: true, upgradeFrom: 'shipyardLarge', level: 3, slots: 14, speed: 1.4, capital: true }, upkeep: { metal: 18, darkMatter: 8 },
      tech: 'tech_super_dock',
      desc: '建造全部舰艇（14 条生产线，速度 +40%）'
    },
    defensePlatform: {
      id: 'defensePlatform', name: '防御平台', icon: '⛨', requireDev: 1, maxPerStar: 4,
      cost: { metal: 200, darkMatter: 5, materials: 1 }, buildDays: 12,
      defense: { hp: 120, damage: 10 }, upkeep: { metal: 1 },
      desc: '保护恒星系'
    },
    railgunBattery: {
      id: 'railgunBattery', name: '轨道炮台', icon: '⌖', requireDev: 2, maxPerStar: 3,
      cost: { metal: 420, darkMatter: 30, materials: 6 }, buildDays: 20,
      defense: { hp: 200, damage: 26, range: 2 }, upkeep: { metal: 3, darkMatter: 1 },
      tech: 'tech_railgun',
      desc: '远程攻击进入恒星系的敌舰'
    },
    shieldArray: {
      id: 'shieldArray', name: '护盾阵列', icon: '◈', requireDev: 2, maxPerStar: 2,
      cost: { metal: 520, darkMatter: 60, materials: 8 }, buildDays: 22,
      defense: { hp: 170, shield: 240, damage: 5 }, starShield: 260, upkeep: { metal: 4, darkMatter: 3 },
      tech: 'tech_shield_2',
      desc: '为整个星系提供护盾加成'
    },
    repairBay: {
      id: 'repairBay', name: '舰队维修站', icon: '✚', requireDev: 2, maxPerStar: 2,
      cost: { metal: 380, darkMatter: 20, materials: 4 }, buildDays: 18,
      repair: 0.06, upkeep: { metal: 3 },
      desc: '大幅提高驻扎舰队的维修速度'
    },
    logisticsHub: {
      id: 'logisticsHub', name: '物流中心', icon: '⇄', requireDev: 2, maxPerStar: 2,
      cost: { metal: 320, darkMatter: 10, materials: 2 }, buildDays: 16,
      logistics: 0.25, upkeep: { metal: 2 },
      desc: '提高附近舰队补给与移动效率'
    },
    radarArray: {
      id: 'radarArray', name: '雷达阵列', icon: '◎', requireDev: 1, maxPerStar: 1,
      cost: { metal: 180, darkMatter: 12, materials: 1 }, buildDays: 10,
      sensorRange: 2, upkeep: { metal: 1 },
      desc: '增加情报与探测范围'
    },

    /* ---------------- 势力专属建筑 ---------------- */
    trade_hub: {
      id: 'trade_hub', name: '星际贸易中心', icon: '❖', requireDev: 2, maxPerStar: 2, unique: 'A',
      cost: { metal: 520, darkMatter: 40, materials: 6 }, buildDays: 26,
      yield: { metal: { flat: 14, mult: 0.16 }, research: { flat: 3, mult: 0.08 } },
      upkeep: { metal: 4 }, desc: '【联邦】星际贸易网络，同时带来金属与科研收益'
    },
    auto_factory: {
      id: 'auto_factory', name: '自动化巨型工厂', icon: '⚙', requireDev: 3, maxPerStar: 2, unique: 'B',
      cost: { metal: 900, darkMatter: 55, materials: 12 }, buildDays: 34,
      yield: { metal: { flat: 6, mult: 0.05 } }, shipyard: { dedicated: false, level: 1, slots: 2, speed: 1.25 },
      upkeep: { metal: 14 }, desc: '【智械】高效无人生产线，兼轻型船坞功能'
    },
    dark_core: {
      id: 'dark_core', name: '暗物质反应核心', icon: '◍', requireDev: 3, maxPerStar: 2, unique: 'C',
      cost: { metal: 620, darkMatter: 90, materials: 12 }, buildDays: 32,
      yield: { darkMatter: { flat: 10, mult: 0.38 }, research: { flat: 4, mult: 0.11 } },
      upkeep: { metal: 5, darkMatter: 2 }, desc: '【虚空】榨取真空零点能，暗物质与科研双收'
    },
    mega_forge: {
      id: 'mega_forge', name: '巨构装配中心', icon: '⛭', requireDev: 3, maxPerStar: 2, unique: 'D',
      cost: { metal: 880, darkMatter: 60, materials: 16 }, buildDays: 34,
      yield: { materials: { flat: 2.8, mult: 0.34 } }, shipyard: { dedicated: false, level: 2, slots: 2, speed: 0.9 },
      defense: { hp: 220, damage: 12 }, upkeep: { metal: 7 },
      desc: '【帝国】生产高级材料并装配大型舰体，兼作防御工事'
    }
  };

  SW.BuildingOrder = Object.keys(SW.BuildingConfig);
})(window.SW);
