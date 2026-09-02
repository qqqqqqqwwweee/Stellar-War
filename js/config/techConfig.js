/* ===========================================================
 *  techConfig —— 公共科技树 + 势力专属科技
 *  cat: industry | ships | weapons | defense | carriers | economy | unique
 *  cost: 研究点消耗
 *  effects: 加成（同类加算，最终 (1+sum)）
 *  unlocks: { ships:[], buildings:[] }
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  const T = [];
  const t = (o) => { T.push(o); return o; };

  /* ================= 工业科技 ================= */
  t({ id: 'tech_mining1', name: '采矿 I', cat: 'industry', tier: 1, cost: 90, prereq: [],
      effects: { metal: 0.15 }, desc: '金属产出 +15%' });
  t({ id: 'tech_mining2', name: '采矿 II', cat: 'industry', tier: 2, cost: 210, prereq: ['tech_mining1'],
      effects: { metal: 0.20 }, desc: '金属产出 +20%' });
  t({ id: 'tech_deep_mining', name: '深空采矿', cat: 'industry', tier: 3, cost: 460, prereq: ['tech_mining2'],
      effects: { metal: 0.20, materials: 0.15 }, desc: '金属 +20%，高级材料 +15%' });
  t({ id: 'tech_auto_mining', name: '自动化采矿', cat: 'industry', tier: 4, cost: 900, prereq: ['tech_deep_mining', 'tech_automation1'],
      effects: { metal: 0.25, materials: 0.20 }, desc: '金属 +25%，高级材料 +20%' });
  t({ id: 'tech_planetary_industry', name: '行星级工业', cat: 'industry', tier: 5, cost: 1700, prereq: ['tech_auto_mining'],
      effects: { metal: 0.28, materials: 0.25, buildSpeed: 0.12 }, desc: '金属 +28%，材料 +25%，建造速度 +12%' });
  t({ id: 'tech_galactic_industry', name: '星系工业网络', cat: 'industry', tier: 6, cost: 3200, prereq: ['tech_planetary_industry'],
      effects: { metal: 0.35, materials: 0.30, buildSpeed: 0.18, shipCost: -0.08 }, desc: '全银河工业体系：金属 +35%，材料 +30%，建造 +18%' });

  t({ id: 'tech_dm_extraction1', name: '暗物质萃取 I', cat: 'industry', tier: 2, cost: 240, prereq: [],
      effects: { darkMatter: 0.20 }, desc: '暗物质产出 +20%' });
  t({ id: 'tech_dm_extraction2', name: '暗物质萃取 II', cat: 'industry', tier: 4, cost: 820, prereq: ['tech_dm_extraction1'],
      effects: { darkMatter: 0.30 }, desc: '暗物质产出 +30%' });
  t({ id: 'tech_dm_condenser', name: '暗物质冷凝矩阵', cat: 'industry', tier: 5, cost: 1600, prereq: ['tech_dm_extraction2'],
      effects: { darkMatter: 0.35, research: 0.10 }, desc: '暗物质 +35%，科研 +10%' });
  t({ id: 'tech_material_synth', name: '材料合成学', cat: 'industry', tier: 4, cost: 950, prereq: ['tech_deep_mining'],
      effects: { materials: 0.35 }, desc: '高级材料产出 +35%' });

  /* ================= 舰船科技（解锁舰种） ================= */
  t({ id: 'tech_destroyer', name: '驱逐舰设计', cat: 'ships', tier: 1, cost: 120, prereq: [],
      effects: {}, unlocks: { ships: ['destroyer'] }, desc: '解锁驱逐舰' });
  t({ id: 'tech_cruiser', name: '巡洋舰设计', cat: 'ships', tier: 2, cost: 300, prereq: ['tech_destroyer'],
      effects: { shipHp: 0.06 }, unlocks: { ships: ['cruiser'] }, desc: '解锁巡洋舰，全舰 HP +6%' });
  t({ id: 'tech_battlecruiser', name: '战列巡洋舰设计', cat: 'ships', tier: 3, cost: 620, prereq: ['tech_cruiser'],
      effects: { shipHp: 0.08, fleetSpeed: 0.06 }, unlocks: { ships: ['battlecruiser'] }, desc: '解锁战列巡洋舰' });
  t({ id: 'tech_torpedo', name: '鱼雷舰设计', cat: 'ships', tier: 3, cost: 600, prereq: ['tech_cruiser'],
      effects: {}, unlocks: { ships: ['torpedoBoat'] }, desc: '解锁鱼雷舰' });
  t({ id: 'tech_battleship', name: '战列舰设计', cat: 'ships', tier: 4, cost: 1150, prereq: ['tech_battlecruiser'],
      effects: { shipHp: 0.10, shipArmor: 0.10 }, unlocks: { ships: ['battleship'] }, desc: '解锁战列舰' });
  t({ id: 'tech_dreadnought', name: '无畏舰设计', cat: 'ships', tier: 5, cost: 2100, prereq: ['tech_battleship'],
      effects: { shipHp: 0.12, shipArmor: 0.12 }, unlocks: { ships: ['dreadnought'] }, desc: '解锁无畏舰' });
  t({ id: 'tech_titan', name: '泰坦工程学', cat: 'ships', tier: 6, cost: 3900, prereq: ['tech_dreadnought', 'tech_super_dock'],
      effects: { shipHp: 0.10, shipShield: 0.10 }, unlocks: { ships: ['titan'] }, desc: '解锁泰坦（上限 5 艘）' });
  t({ id: 'tech_flagship', name: '超级旗舰计划', cat: 'ships', tier: 7, cost: 8200, prereq: ['tech_titan', 'tech_galactic_industry'],
      effects: { shipHp: 0.12, shipShield: 0.15, shipDamage: 0.10 }, unlocks: { ships: ['flagship'] }, desc: '解锁超级旗舰（全银河仅 1 艘）' });

  t({ id: 'tech_shipyard_large', name: '大型船坞工程', cat: 'ships', tier: 3, cost: 520, prereq: ['tech_cruiser'],
      effects: { buildSpeed: 0.10 }, unlocks: { buildings: ['shipyardLarge'] }, desc: '解锁大型造船厂' });
  t({ id: 'tech_super_dock', name: '超级船坞工程', cat: 'ships', tier: 5, cost: 1900, prereq: ['tech_shipyard_large', 'tech_battleship'],
      effects: { buildSpeed: 0.12 }, unlocks: { buildings: ['superDock'] }, desc: '解锁超级船坞（泰坦/旗舰前置）' });

  /* ================= 武器科技 ================= */
  t({ id: 'tech_laser1', name: '激光武器 I', cat: 'weapons', tier: 1, cost: 100, prereq: [],
      effects: { weapon: { laser: 0.15 } }, desc: '激光伤害 +15%' });
  t({ id: 'tech_laser2', name: '激光武器 II', cat: 'weapons', tier: 3, cost: 420, prereq: ['tech_laser1'],
      effects: { weapon: { laser: 0.20 } }, desc: '激光伤害 +20%' });
  t({ id: 'tech_high_laser', name: '高能激光', cat: 'weapons', tier: 5, cost: 1100, prereq: ['tech_laser2'],
      effects: { weapon: { laser: 0.25 } }, desc: '激光伤害 +25%' });
  t({ id: 'tech_particle', name: '粒子武器', cat: 'weapons', tier: 4, cost: 880, prereq: ['tech_high_laser'],
      effects: { weapon: { particle: 0.30, laser: 0.10 } }, desc: '粒子武器 +30%' });
  t({ id: 'tech_dm_weapon', name: '暗物质武器', cat: 'weapons', tier: 6, cost: 2600, prereq: ['tech_particle', 'tech_dm_condenser'],
      effects: { weapon: { darkmatter: 0.35 } }, desc: '暗物质武器 +35%' });

  t({ id: 'tech_kinetic1', name: '动能武器 I', cat: 'weapons', tier: 1, cost: 100, prereq: [],
      effects: { weapon: { massDriver: 0.18 } }, desc: '质量加速炮伤害 +18%' });
  t({ id: 'tech_railgun', name: '轨道炮技术', cat: 'weapons', tier: 3, cost: 560, prereq: ['tech_kinetic1'],
      effects: { weapon: { railgun: 0.25 } }, unlocks: { buildings: ['railgunBattery'] }, desc: '轨道炮 +25%，解锁轨道炮台' });
  t({ id: 'tech_kinetic2', name: '动能武器 II', cat: 'weapons', tier: 4, cost: 900, prereq: ['tech_railgun'],
      effects: { weapon: { massDriver: 0.25, railgun: 0.20 } }, desc: '动能系武器强化' });

  t({ id: 'tech_plasma1', name: '等离子武器', cat: 'weapons', tier: 3, cost: 620, prereq: ['tech_kinetic1'],
      effects: { weapon: { plasma: 0.22 } }, desc: '等离子伤害 +22%' });
  t({ id: 'tech_missile1', name: '导弹技术', cat: 'weapons', tier: 2, cost: 300, prereq: [],
      effects: { weapon: { missile: 0.20, torpedo: 0.15 } }, desc: '导弹与鱼雷伤害提升' });
  t({ id: 'tech_torpedo_adv', name: '先进鱼雷', cat: 'weapons', tier: 5, cost: 1400, prereq: ['tech_missile1', 'tech_torpedo'],
      effects: { weapon: { torpedo: 0.35 } }, desc: '鱼雷伤害 +35%' });
  t({ id: 'tech_ion', name: '离子武器', cat: 'weapons', tier: 4, cost: 780, prereq: ['tech_laser2'],
      effects: { weapon: { ion: 0.30 } }, desc: '离子武器 +30%' });

  /* ================= 防御科技 ================= */
  t({ id: 'tech_shield1', name: '基础护盾', cat: 'defense', tier: 1, cost: 110, prereq: [],
      effects: { shipShield: 0.15 }, desc: '全舰护盾 +15%' });
  t({ id: 'tech_shield2', name: '强化护盾', cat: 'defense', tier: 3, cost: 480, prereq: ['tech_shield1'],
      effects: { shipShield: 0.20 }, unlocks: { buildings: ['shieldArray'] }, desc: '护盾 +20%，解锁护盾阵列' });
  t({ id: 'tech_quantum_shield', name: '量子护盾', cat: 'defense', tier: 5, cost: 1300, prereq: ['tech_shield2'],
      effects: { shipShield: 0.25, repair: 0.15 }, desc: '护盾 +25%，维修 +15%' });
  t({ id: 'tech_dm_shield', name: '暗物质护盾', cat: 'defense', tier: 6, cost: 2500, prereq: ['tech_quantum_shield', 'tech_dm_condenser'],
      effects: { shipShield: 0.35, defense: 0.20 }, desc: '护盾 +35%，星系防御 +20%' });

  t({ id: 'tech_armor1', name: '复合装甲', cat: 'defense', tier: 2, cost: 260, prereq: [],
      effects: { shipArmor: 0.18 }, desc: '全舰装甲 +18%' });
  t({ id: 'tech_armor2', name: '纳米装甲', cat: 'defense', tier: 4, cost: 820, prereq: ['tech_armor1'],
      effects: { shipArmor: 0.22, shipHp: 0.08 }, desc: '装甲 +22%，HP +8%' });
  t({ id: 'tech_pd', name: '点防御网络', cat: 'defense', tier: 3, cost: 500, prereq: ['tech_kinetic1'],
      effects: { pd: 0.30 }, desc: '点防御效率 +30%' });
  t({ id: 'tech_star_fortress', name: '星际要塞学', cat: 'defense', tier: 4, cost: 980, prereq: ['tech_railgun'],
      effects: { defense: 0.35 }, desc: '星系防御 +35%' });

  /* ================= 航母科技 ================= */
  t({ id: 'tech_fighter1', name: '舰载机', cat: 'carriers', tier: 3, cost: 700, prereq: ['tech_destroyer'],
      effects: {}, desc: '研发舰载机作战体系' });
  t({ id: 'tech_fighter2', name: '战斗机中队', cat: 'carriers', tier: 4, cost: 1150, prereq: ['tech_fighter1'],
      effects: { weapon: { fighter: 0.20 } }, desc: '舰载机伤害 +20%' });
  t({ id: 'tech_bomber', name: '轰炸机联队', cat: 'carriers', tier: 5, cost: 1900, prereq: ['tech_fighter2'],
      effects: { weapon: { fighter: 0.30 } }, unlocks: { ships: ['carrier'] }, desc: '解锁航母，舰载机 +30%' });
  t({ id: 'tech_adv_fighter', name: '高级舰载机', cat: 'carriers', tier: 6, cost: 3100, prereq: ['tech_bomber'],
      effects: { weapon: { fighter: 0.30 } }, desc: '舰载机伤害 +30%' });
  t({ id: 'tech_drone_swarm', name: '智能无人机群', cat: 'carriers', tier: 7, cost: 5200, prereq: ['tech_adv_fighter'],
      effects: { weapon: { fighter: 0.40 }, pd: 0.25 }, desc: '舰载机 +40%，点防御 +25%' });

  /* ================= 经济/后勤科技 ================= */
  t({ id: 'tech_resource_opt', name: '资源优化', cat: 'economy', tier: 1, cost: 95, prereq: [],
      effects: { metal: 0.08, darkMatter: 0.08 }, desc: '资源产出小幅提升' });
  t({ id: 'tech_automation1', name: '自动化生产', cat: 'economy', tier: 2, cost: 280, prereq: ['tech_resource_opt'],
      effects: { buildSpeed: 0.12, shipCost: -0.05 }, desc: '建造速度 +12%，舰船成本 -5%' });
  t({ id: 'tech_logistics', name: '星际物流', cat: 'economy', tier: 3, cost: 640, prereq: ['tech_automation1'],
      effects: { fleetSpeed: 0.15, metal: 0.10 }, unlocks: { buildings: ['logisticsHub'] }, desc: '舰队速度 +15%，解锁物流中心' });
  t({ id: 'tech_repair', name: '自动维修系统', cat: 'economy', tier: 3, cost: 560, prereq: ['tech_automation1'],
      effects: { repair: 0.35 }, unlocks: { buildings: ['repairBay'] }, desc: '维修效率 +35%，解锁舰队维修站' });
  t({ id: 'tech_sensor', name: '深空探测阵列', cat: 'economy', tier: 2, cost: 300, prereq: [],
      effects: { sensor: 1 }, unlocks: { buildings: ['radarArray'] }, desc: '探测范围 +1 跳' });
  t({ id: 'tech_galactic_economy', name: '银河工业体系', cat: 'economy', tier: 6, cost: 3400, prereq: ['tech_logistics', 'tech_planetary_industry'],
      effects: { metal: 0.20, darkMatter: 0.15, materials: 0.15, research: 0.15, shipCost: -0.10 }, desc: '全资源产出大幅提升' });

  /* ================= 势力专属科技 ================= */
  /* A 联邦 */
  t({ id: 'u_fed_diplomacy', name: '星际外交协定', cat: 'unique', faction: 'A', tier: 2, cost: 420, prereq: [],
      effects: { metal: 0.15, research: 0.15 }, desc: '【联邦】贸易网络带来额外金属与科研' });
  t({ id: 'u_fed_expedition', name: '远征军学说', cat: 'unique', faction: 'A', tier: 4, cost: 1100, prereq: ['u_fed_diplomacy'],
      effects: { fleetSpeed: 0.15, repair: 0.30, shipDamage: 0.08 }, desc: '【联邦】远征军体系：机动、维修与火力提升' });
  t({ id: 'u_fed_standard', name: '标准化生产线', cat: 'unique', faction: 'A', tier: 5, cost: 2000, prereq: ['u_fed_expedition'],
      effects: { shipCost: -0.15, buildSpeed: 0.20 }, desc: '【联邦】舰船成本 -15%，建造 +20%' });
  t({ id: 'u_fed_guardian', name: '守护者协议', cat: 'unique', faction: 'A', tier: 6, cost: 3600, prereq: ['u_fed_standard'],
      effects: { defense: 0.30, shipShield: 0.20 }, desc: '【联邦】星系防御 +30%，护盾 +20%' });

  /* B 智械 */
  t({ id: 'u_mac_swarm', name: '蜂群生产协议', cat: 'unique', faction: 'B', tier: 2, cost: 400, prereq: [],
      effects: { buildSpeed: 0.13, shipCost: -0.03 }, desc: '【智械】无人生产线：建造 +13%，成本 -3%' });
  t({ id: 'u_mac_repair', name: '自修复合金', cat: 'unique', faction: 'B', tier: 4, cost: 1050, prereq: ['u_mac_swarm'],
      effects: { repair: 0.45, shipHp: 0.10 }, desc: '【智械】维修 +45%，HP +10%' });
  t({ id: 'u_mac_overload', name: '超载反应堆', cat: 'unique', faction: 'B', tier: 5, cost: 1900, prereq: ['u_mac_repair'],
      effects: { shipDamage: 0.12, fleetSpeed: 0.08, shipShield: -0.05 }, desc: '【智械】火力 +12%，速度 +8%，护盾 -5%' });
  t({ id: 'u_mac_core', name: '无限战争核心', cat: 'unique', faction: 'B', tier: 7, cost: 4200, prereq: ['u_mac_overload'],
      effects: { buildSpeed: 0.15, shipDamage: 0.10, shipCost: -0.04 }, desc: '【智械】全面战争动员' });

  /* C 虚空 */
  t({ id: 'u_void_veil', name: '虚空帷幕', cat: 'unique', faction: 'C', tier: 2, cost: 430, prereq: [],
      effects: { darkMatter: 0.25, shipShield: 0.15 }, desc: '【虚空】暗物质 +25%，护盾 +15%' });
  t({ id: 'u_void_resonance', name: '暗能量共振', cat: 'unique', faction: 'C', tier: 4, cost: 1080, prereq: ['u_void_veil'],
      effects: { weapon: { darkmatter: 0.30, ion: 0.25 }, research: 0.15 }, desc: '【虚空】暗物质与离子武器强化' });
  t({ id: 'u_void_phase', name: '相位穿梭', cat: 'unique', faction: 'C', tier: 5, cost: 1950, prereq: ['u_void_resonance'],
      effects: { fleetSpeed: 0.25, shipShield: 0.20 }, desc: '【虚空】舰队速度 +25%，护盾 +20%' });
  t({ id: 'u_void_singularity', name: '奇点工程', cat: 'unique', faction: 'C', tier: 7, cost: 4300, prereq: ['u_void_phase'],
      effects: { shipDamage: 0.22, shipShield: 0.25, darkMatter: 0.30 }, desc: '【虚空】奇点武器：全面强化' });

  /* D 帝国 */
  t({ id: 'u_imp_bulwark', name: '磐石防线', cat: 'unique', faction: 'D', tier: 2, cost: 420, prereq: [],
      effects: { defense: 0.35, shipArmor: 0.12 }, desc: '【帝国】星系防御 +35%，装甲 +12%' });
  t({ id: 'u_imp_colossus', name: '巨像锻造术', cat: 'unique', faction: 'D', tier: 4, cost: 1100, prereq: ['u_imp_bulwark'],
      effects: { shipHp: 0.20, materials: 0.25 }, desc: '【帝国】HP +20%，高级材料 +25%' });
  t({ id: 'u_imp_doom', name: '末日炮击', cat: 'unique', faction: 'D', tier: 6, cost: 2400, prereq: ['u_imp_colossus'],
      effects: { weapon: { superWeapon: 0.35, railgun: 0.20 } }, desc: '【帝国】超级主炮与轨道炮强化' });
  t({ id: 'u_imp_eternal', name: '永恒王朝', cat: 'unique', faction: 'D', tier: 7, cost: 4400, prereq: ['u_imp_doom'],
      effects: { shipHp: 0.18, shipArmor: 0.20, defense: 0.25, shipDamage: 0.12 }, desc: '【帝国】不可动摇的钢铁王朝' });

  /* ---------------- 科研成本曲线 ----------------
   * 最终成本 = 基础值 × 全局倍率 × 阶层倍率
   * 阶层倍率是指数级的：早期科技几年内即可点亮，
   * 而泰坦 / 超级旗舰这类终局科技需要几十年积累。
   */
  SW.TechCostScale = 12;
  SW.TechTierMult = [1, 1, 1.7, 2.9, 5.2, 9.5, 19, 40];
  for (const x of T) {
    const tm = SW.TechTierMult[Math.max(1, Math.min(7, x.tier | 0))] || 1;
    x.cost = Math.round(x.cost * SW.TechCostScale * tm);
  }

  SW.TechList = T;
  SW.TechById = {};
  for (const x of T) SW.TechById[x.id] = x;

  SW.TechCategories = [
    { id: 'industry', name: '工业科技', color: '#ffb56b' },
    { id: 'ships', name: '舰船科技', color: '#7fd1ff' },
    { id: 'weapons', name: '武器科技', color: '#ff7a7a' },
    { id: 'defense', name: '防御科技', color: '#8affc1' },
    { id: 'carriers', name: '航母科技', color: '#c39bff' },
    { id: 'economy', name: '经济科技', color: '#ffe066' },
    { id: 'unique', name: '文明专属', color: '#ff9de0' }
  ];
})(window.SW);
