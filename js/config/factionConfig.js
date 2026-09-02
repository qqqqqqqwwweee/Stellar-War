/* ===========================================================
 *  factionConfig —— 四大势力特色
 *  mods : 全局修正（与科技加成叠加，加算后作为 (1+sum) 使用）
 *  shipMods : 针对具体舰种的额外修正 { hp, shield, armor, damage, cost, build }
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  SW.FactionConfig = [
    {
      id: 'A', name: '联合星际联邦', shortName: '联邦', adjective: '联邦',
      color: '#3fa9ff', colorDim: '#1b4f80', glow: '#8fd4ff',
      corner: 'TL',             // 左上
      personality: 'balanced',
      traits: ['经济稳定', '科研加速', '舰船成本低', '后勤效率高'],
      summary: '均衡型文明。护卫舰与驱逐舰优秀，注重经济与科技，稳健扩张。',
      mods: {
        metal: 0.10, darkMatter: 0.05, materials: 0.05, research: 0.17,
        shipCost: -0.10, buildSpeed: 0.08, shipHp: 0.0, shipShield: 0.05,
        shipArmor: 0.0, shipDamage: 0.0, fleetSpeed: 0.08, repair: 0.27,
        defense: 0.10, expansion: 0.05
      },
      shipMods: {
        corvette: { damage: 0.18, hp: 0.10 },
        destroyer: { damage: 0.20, hp: 0.10 },
        cruiser: { damage: 0.08, shield: 0.12 }
      },
      weaponMods: { laser: 0.10, massDriver: 0.05 },
      uniqueUnit: { ship: 'cruiser', name: '联邦远征巡洋舰' },
      uniqueBuilding: 'trade_hub',
      ai: {
        aggression: 0.46, expansion: 0.58, techFocus: 0.60, defenseFocus: 0.50,
        titanRush: 0.45, navyRatio: 0.34, earlyWarDay: 1400
      }
    },
    {
      id: 'B', name: '机械智械帝国', shortName: '智械', adjective: '智械',
      color: '#ff4d4d', colorDim: '#7a1f1f', glow: '#ff9a8a',
      corner: 'TR',             // 右上
      personality: 'aggressive',
      traits: ['金属产量较高', '造舰速度快', '自动维修', '无人舰艇海量'],
      summary: '工业与无人舰队文明。保留高效生产和规模化无人舰队，但需要依靠持续扩张维持战争机器。',
      mods: {
        metal: 0.02, darkMatter: -0.08, materials: 0.00, research: -0.05,
        shipCost: -0.05, buildSpeed: 0.20, shipHp: -0.05, shipShield: -0.10,
        shipArmor: 0.08, shipDamage: 0.0, fleetSpeed: 0.05, repair: 0.50,
        defense: 0.03, expansion: 0.10
      },
      shipMods: {
        corvette: { cost: -0.07, build: 0.11 },
        destroyer: { cost: -0.07, build: 0.11 },
        cruiser: { build: 0.14, hp: -0.05 },
        titan: { build: 0.10, hp: 0.15, damage: 0.10 }
      },
      weaponMods: { massDriver: 0.18, railgun: 0.10, missile: 0.10 },
      uniqueUnit: { ship: 'destroyer', name: '蜂群无人战舰' },
      uniqueBuilding: 'auto_factory',
      ai: {
        aggression: 0.74, expansion: 0.61, techFocus: 0.42, defenseFocus: 0.32,
        titanRush: 0.52, navyRatio: 0.40, earlyWarDay: 1100
      }
    },
    {
      id: 'C', name: '虚空神秘文明', shortName: '虚空', adjective: '虚空',
      color: '#a05cff', colorDim: '#4a2380', glow: '#d8b0ff',
      corner: 'BL',             // 左下
      personality: 'tech',
      traits: ['暗物质产量高', '高级武器强', '护盾技术领先', '后期科技爆发'],
      summary: '暗物质与高科技文明。前期发展缓慢，中后期以压倒性的高级武器与护盾统治战场。',
      mods: {
        metal: -0.10, darkMatter: 0.55, materials: 0.20, research: 0.35,
        shipCost: 0.10, buildSpeed: -0.10, shipHp: -0.05, shipShield: 0.45,
        shipArmor: -0.05, shipDamage: 0.0, fleetSpeed: 0.0, repair: 0.10,
        defense: 0.15, expansion: -0.10
      },
      shipMods: {
        battleship: { shield: 0.25, damage: 0.15 },
        dreadnought: { shield: 0.30, damage: 0.18 },
        titan: { shield: 0.35, damage: 0.15 }
      },
      weaponMods: { darkmatter: 0.25, ion: 0.25, plasma: 0.10 },
      uniqueUnit: { ship: 'dreadnought', name: '虚空无畏舰' },
      uniqueBuilding: 'dark_core',
      ai: {
        aggression: 0.48, expansion: 0.50, techFocus: 0.95, defenseFocus: 0.60,
        titanRush: 0.80, navyRatio: 0.32, earlyWarDay: 2000
      }
    },
    {
      id: 'D', name: '远古星海帝国', shortName: '远古帝国', adjective: '帝国',
      color: '#ffc046', colorDim: '#7a5a12', glow: '#ffe6a8',
      corner: 'BR',             // 右下
      personality: 'turtle',
      traits: ['高级材料效率高', '大型舰船极强', '防御建筑强大', '后发制人'],
      summary: '大型战舰与超级旗舰文明。先建立坚不可摧的核心领地，随后以巨舰发动毁灭性战争。',
      mods: {
        metal: 0.05, darkMatter: 0.0, materials: 0.55, research: 0.0,
        shipCost: 0.08, buildSpeed: -0.15, shipHp: 0.25, shipShield: 0.15,
        shipArmor: 0.30, shipDamage: 0.10, fleetSpeed: -0.08, repair: 0.20,
        defense: 0.60, expansion: 0.10
      },
      shipMods: {
        battleship: { hp: 0.20, armor: 0.20, damage: 0.10 },
        dreadnought: { hp: 0.25, armor: 0.25, damage: 0.12 },
        titan: { hp: 0.30, armor: 0.25, damage: 0.20 },
        flagship: { hp: 0.35, armor: 0.30, damage: 0.20 }
      },
      weaponMods: { railgun: 0.25, superWeapon: 0.20, plasma: 0.10 },
      uniqueUnit: { ship: 'battleship', name: '帝国巨像级战列舰' },
      uniqueBuilding: 'mega_forge',
      ai: {
        aggression: 0.58, expansion: 0.44, techFocus: 0.55, defenseFocus: 0.95,
        titanRush: 0.90, navyRatio: 0.38, earlyWarDay: 1700
      }
    }
  ];

  SW.FactionById = {};
  for (const f of SW.FactionConfig) SW.FactionById[f.id] = f;

  /* 势力专属科技在 techConfig 中定义（faction: 'A' 等） */
})(window.SW);
