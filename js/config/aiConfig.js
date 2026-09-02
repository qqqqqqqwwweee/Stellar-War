/* ===========================================================
 *  aiConfig —— AI 决策频率与权重（全部可配置）
 *  频率单位为「银河天」
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  SW.AIConfig = {
    /* ---------------- 决策频率（银河天） ---------------- */
    intervals: {
      economy: 4,      // 经济 / 建筑
      expansion: 8,    // 扩张 / 殖民
      military: 5,     // 军事 / 舰队调度
      research: 12,    // 科研（完成时也会立即重算）
      production: 5,   // 造舰
      diplomacy: 20
    },
    /* 最快重算间隔（防止 16x 时每帧都跑） */
    minRealSeconds: 0.05,

    /* ---------------- 系统级节流（银河天） ----------------
     * 这些系统不需要每个模拟步都全量重算，节流后
     * 即便 1000+ 舰船也能保持 60FPS
     */
    systemIntervals: {
      combatScan: 0.5,      // 战斗检测
      diplomacyScan: 3,     // 边境接触检测
      vision: 1.0,          // 探索范围刷新
      powerRecalc: 0.5,     // 舰队战力重算
      economyRecompute: 2   // 收入重算
    },

    /* ---------------- 经济 AI ---------------- */
    economy: {
      reserveRatio: 0.25,        // 保留资源比例，避免一次性花光
      devUpgradePriority: 1.0,   // 开发等级升级权重
      preferYieldWeight: { metal: 1.0, darkMatter: 1.5, materials: 2.2, research: 1.3 },
      shortageThreshold: 0.22,   // 某资源收入低于总需求比例视为短缺
      buildingScoreBase: 1.0,
      maxQueuePerStar: 2,
      upgradeDevWhenIncomeAbove: 260   // 金属日收入超过此值时更积极升级开发等级
    },

    /* ---------------- 扩张 AI ---------------- */
    expansion: {
      distanceWeight: -0.50,     // 距离惩罚（每跳）
      resourceWeight: 1.0,
      chokeWeight: 1.6,          // 战略瓶颈权重
      hubWeight: 1.3,            // 交通枢纽权重
      enemyThreatWeight: -1.1,
      neutralBonus: 1.05,
      maxConcurrentClaims: 3,    // 同时进行的殖民行动数上限
      claimsPerIncome: 230,      // 每 230 金属日收入 +1 条殖民队列（早期自然放缓）
      claimFleetPower: 12,       // 殖民舰队最低战力
      maxFrontierDistance: 5     // 距离己方领土最远考虑跳数
    },

    /* ---------------- 军事 AI ---------------- */
    military: {
      attackRatio: 1.15,         // 战力比高于此值才主动进攻
      defendRatio: 0.8,          // 战力比低于此值转入防守
      retreatRatio: 0.55,        // 战力比低于此值撤退
      reinforceRadius: 3,        // 增援搜索跳数
      garrisonPowerPerDev: 6,    // 每个开发等级需要的驻军战力
      borderGuardRatio: 0.35,    // 多少比例的舰队用于边境防守
      postAttackReserveRatio: 0.39, // 每个出发星系出击后至少保留的战力比例
      capitalDefenseRatio: 0.28, // 首都圈最低防守战力占比
      minAttackPower: 28,        // 发起进攻的最低战力
      attackCommitRatio: 1.32,   // 远征舰队相对目标综合防御的最低战力比
      arrivalForceRatio: 1.18,   // 抵达后重新评估，低于该比值立即撤退
      rallyTimeoutDays: 180,     // 集结计划超时后释放舰队
      rallyRadius: 5,            // 集结舰队允许跨越的最大航道跳数
      fleetMergePower: 400,      // 分舰队战力上限（超过则拆分）
      targetValueWeight: {
        resource: 1.0, choke: 1.8, hub: 1.4, capital: 3.0, weakDefense: 1.5,
        adjacent: 2.6, hostile: 1.8, distance: 0.65
      },
      remoteTargetHops: 3,
      superWeaponPanic: 1.6      // 敌方出现超级旗舰时的威胁放大
    },

    /* ---------------- 科研 AI ---------------- */
    research: {
      categoryBase: {
        industry: 1.0, ships: 1.25, weapons: 1.1, defense: 0.95, carriers: 0.9, economy: 1.05, unique: 1.4
      },
      /* 不同性格的科研权重偏移 */
      personality: {
        balanced: { industry: 0.2, economy: 0.25, weapons: 0.1, defense: 0.15 },
        aggressive: { ships: 0.45, weapons: 0.35, industry: 0.25 },
        tech: { weapons: 0.4, defense: 0.3, industry: 0.15, carriers: 0.3 },
        turtle: { defense: 0.45, industry: 0.3, ships: 0.2 }
      },
      warUrgency: 0.8,           // 战争状态下对武器/舰船科技的加权
      costTolerance: 1.0
    },

    /* ---------------- 生产 AI ---------------- */
    production: {
      desiredComposition: {
        // 低级舰承担数量主体；高级舰依靠稀缺资源和占比约束少量出现。
        corvette: 2.4, destroyer: 2.1, cruiser: 1.1, battlecruiser: 0.65,
        torpedoBoat: 0.45, battleship: 0.30, dreadnought: 0.16, carrier: 0.10
      },
      capitalDesire: { titan: 1.0, carrier: 1.0, flagship: 1.0 },
      keepReserveForCapital: 0.05,  // 为泰坦/旗舰预留的资源比例
      titanMinIncome: { metal: 55, darkMatter: 12, materials: 2.2 },
      flagshipMinIncome: { metal: 140, darkMatter: 34, materials: 6.5 },
      maxShipsPerTypeRatio: 0.45,   // 单一舰种不超过舰队总数的 45%
      /* 库存达到该阈值且有空闲船坞时，常态也要持续消费。 */
      spendingThreshold: { metal: 120, darkMatter: 18, materials: 3 },
      /* 资源达到 cap 约 50% 时逐步提高预算，并扩大一次决策可下的订单数。 */
      stockPressure: {
        startRatio: { metal: 0.38, darkMatter: 0.38, materials: 0.38 },
        triggerRatio: { metal: 0.50, darkMatter: 0.50, materials: 0.50 },
        budgetBoost: 0.38,
        maxBudgetRatio: 1.0,
        capitalReserveRatio: 0.18,
        pressureMetalThreshold: 45,
        extraOrders: 5
      },
      /* 常规舰队结构：先铺低级舰，再允许少量高等级舰。 */
      shipMix: {
        lowTierMaxSize: 2,
        highTierMinSize: 5,
        highTierMaxRatio: 0.18,
        highTierMinFleet: 10,
        initialHighShips: 0,
        lowTierOrderRatio: 0.70,
        lowTierBias: 18,
        mediumTierBias: 2,
        highTierPenalty: 14
      },
      minimumOperatingReserve: { metal: 50, darkMatter: 30, materials: 4 },
      reserveDays: 20,
      emergencyReserveDays: 18,
      normalBudgetRatio: 1.0,
      emergencyBuildRatio: 0.95,
      emergencyWarPressure: 0.75,
      emergencyStarLosses: 2,
      emergencyStockMultiplier: 2.20,
      maxOrdersPerRun: 9,
      pressureMaxOrdersPerRun: 14,
      emergencyMaxOrdersPerRun: 12,
      emergencyMaxShipSize: 3,
      emergencySizeWeight: 10,
      emergencyCostWeight: 0.08,
      emergencyBuildTimeWeight: 0.35
    },

    /* ---------------- 外交 ---------------- */
    diplomacy: {
      initialRelation: 0,
      borderFrictionPerDay: 0.010,  // 接壤后关系每日下降
      warDeclarationThreshold: -55,
      peaceThreshold: -25,
      warWearinessPerDay: 0.0011,   // 战争疲劳累积速度（约 2 年达到厌倦）
      peaceWearinessNeed: 0.85,     // 双方厌倦度超过该值才可能停战
      allyChance: 0.35,             // 形成 2v2 的可能性权重
      truceMinDays: 1100            // 停战协议最短持续时间
    },

    /* ---------------- 战略层总览 ---------------- */
    strategic: {
      evaluateEveryDays: 30,
      /* 阶段划分（银河天）：早期拓荒 -> 中期争霸 -> 后期决战 -> 终局 */
      phaseThresholds: { early: 1800, mid: 7200, late: 16000 }
    }
  };
})(window.SW);
