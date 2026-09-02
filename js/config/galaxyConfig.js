/* ===========================================================
 *  galaxyConfig —— 银河生成 / 时间 / 开发等级 配置
 *  所有数值集中在此，方便调参
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  SW.GalaxyConfig = {
    /* ---------- 规模 ---------- */
    starCount: 128,          // 默认恒星数量（可在新游戏界面调 100~160）
    starCountMin: 100,
    starCountMax: 160,
    radius: 2600,            // 银河半径（世界坐标）
    minStarDist: 210,        // 恒星最小间距（泊松盘）
    centerHole: 120,         // 中心禁区

    /* ---------- 航道 ---------- */
    lane: {
      kNearest: 3,           // 每颗恒星基础连接数
      extraLoopChance: 0.30, // 额外环路航道概率（制造环形路线）
      longRangeChance: 0.06, // 少量远距离"战略跳线"
      maxLaneLength: 1150,   // 超过此长度的航道丢弃
      maxDegree: 5
    },

    /* ---------- 势力起始 ---------- */
    start: {
      homeDevLevel: 4,        // 母星初始开发等级
      homeBonusStars: 2,      // 母星额外赠送的邻近星系（含唯一出口星）
      startingFleets: 2,      // 初始舰队数量
      startingMetal: 900,
      startingDarkMatter: 220,
      startingMaterials: 40,
      startingResearch: 120
    },

    /* ---------- 恒星开发等级 ---------- */
    devLevel: {
      max: 5,
      names: ['未开发', '前哨基地', '基础采矿设施', '工业殖民地', '大型星际基地', '核心星系'],
      /* 升级到下一级所需金属（按目标等级索引） */
      upgradeCost: [
        { metal: 120, materials: 0 },   // 0 -> 1
        { metal: 320, materials: 4 },   // 1 -> 2
        { metal: 700, materials: 12 },  // 2 -> 3
        { metal: 1500, materials: 28 }, // 3 -> 4
        { metal: 3200, materials: 60 }  // 4 -> 5
      ],
      upgradeDays: [12, 22, 36, 55, 80],
      yieldPerLevel: 0.20,     // 每级资源产出 +20%
      slotsPerLevel: 1,        // 每级提供 1 个建筑位（母星额外 +2）
      defensePerLevel: 6,      // 每级基础防御值
      garrisonPerLevel: 6      // 每级可驻扎舰船容量加成
    },

    /* ---------- 舰队维护费（防止舰船数量无限膨胀） ---------- */
    upkeep: {
      metalPerCost: 0.020,       // 每点金属造价每天消耗的金属
      darkMatterPerCost: 0.0040, // 每点暗物质造价每天消耗的暗物质
      capitalMult: 1.6           // 战略舰维护费倍率
    },

    /* ---------- 舰队规模软上限（经济与领土决定） ---------- */
    fleetCap: {
      baseShips: 55,
      shipsPerStar: 14,          // 满银河 128 星时约 1850 艘
      basePower: 240,
      powerPerStar: 150,
      warMult: 1.45,             // 战争期间允许超编
      normalOverageRatio: 0.08,  // 软上限：常态允许少量补齐另一项 room
      emergencyOverageRatio: 0.20 // 濒危时的临时超编上限
    },

    /* ---------- 占领 ---------- */
    capture: {
      baseDays: 10,           // 基础占领耗时（银河天）
      perDevLevel: 2.5,       // 每级开发等级增加耗时
      minShips: 1
    },

    /* ---------- 时间 ---------- */
    time: {
      daysPerYear: 360,
      startYear: 2387,
      /* 1 现实秒（1x）对应的银河天数 */
      /*
       * 1x 是观战基准：一年约两分钟，战斗和舰队移动有足够的
       * 可读时间；其它档位只按 speed 比例加速。
       */
      daysPerRealSecond: 3,
      speeds: [0, 1, 2, 4, 8, 16],
      defaultSpeed: 1,
      /* 模拟步长（银河天）；越小越平滑但越耗 CPU */
      stepDays: 0.25,
      maxStepsPerFrame: 160,
      combatTickDays: 0.10
    },

    /* ---------- 镜头与战术近景 ---------- */
    camera: {
      minZoom: 0.12,
      maxZoom: 4.5,
      defaultZoom: 0.5,
      wheelSensitivity: 0.0018,
      zoomSmoothRate: 10,
      tacticalZoom: 1.05,
      battleFocusZoom: 1.35,
      tactical: {
        arenaRadius: 150,
        fleetSpacing: 34,
        shipSpacing: 15,
        maxFleets: 10,
        maxBattles: 4,
        maxShipGlyphsPerFleet: 18,
        fleetPickRadius: 24,
        effectJitter: 5
      }
    },

    /* ---------- 舰队移动 ---------- */
    movement: {
      worldUnitsPerDay: 34,   // 速度 1.0 的舰队每天移动的世界距离
      minTravelDays: 1.2
    },

    /* ---------- 资源节点随机范围 ---------- */
    resources: {
      metal: [5, 50],
      darkMatter: [0, 20],
      materials: [0, 10],
      research: [0, 18]
    }
  };
})(window.SW);
