/* ===========================================================
 *  resourceConfig —— 四种核心资源 + 恒星类型 + 恒星特性
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  SW.ResourceConfig = {
    order: ['metal', 'darkMatter', 'materials', 'research'],
    defs: {
      metal:      { key: 'metal',      name: '金属',     short: '金属', color: '#9fb4c7', icon: '◆' },
      darkMatter: { key: 'darkMatter', name: '暗物质',   short: '暗物质', color: '#b06cff', icon: '✦' },
      materials:  { key: 'materials',  name: '高级材料', short: '高材', color: '#ffc861', icon: '⬢' },
      research:   { key: 'research',   name: '研究点',   short: '科研', color: '#5ce1e6', icon: '⌬' }
    },
    /* 每种资源的全局产出系数，可分别调节，不共享金属系数。 */
    globalMult: { metal: 0.62, darkMatter: 0.46, materials: 0.40, research: 1.0 },
    /*
     * 早中晚产出曲线：1x 的首年仍保留发展、科研和造舰余量，
     * 中后期再逐步恢复产能，避免开局扩张直接把库存推到 cap。
     * phaseDays 与银河天数对应，不依赖 AI 当前阶段字段，兼容旧存档。
     */
    tempo: {
      phaseDays: { early: 1800, mid: 7200 },
      phaseMult: {
        early: { metal: 0.88, darkMatter: 0.72, materials: 0.64, research: 1.0 },
        mid:   { metal: 0.96, darkMatter: 0.90, materials: 0.82, research: 1.0 },
        late:  { metal: 1.00, darkMatter: 1.00, materials: 1.00, research: 1.0 }
      },
      /* 接近库存上限时只降低新增速度，不清空已有资源。 */
      inventory: {
        softCapRatio: { metal: 0.72, darkMatter: 0.72, materials: 0.62, research: 0.96 },
        floorMultiplier: { metal: 0.18, darkMatter: 0.20, materials: 0.16, research: 0.65 }
      }
    },
    /* 存储上限保持不变，旧存档仍按原 cap 截断。 */
    cap: { metal: 250000, darkMatter: 60000, materials: 12000, research: 999999 }
  };

  /* ---------------- 恒星类型 ---------------- */
  SW.StarTypeConfig = {
    redDwarf: {
      id: 'redDwarf', name: '红矮星', weight: 22, color: '#ff7a5c', radius: 7,
      yield: { metal: 1.0, darkMatter: 1.0, materials: 1.0, research: 1.0 }, desc: '常见的小质量恒星，环境稳定。'
    },
    yellowDwarf: {
      id: 'yellowDwarf', name: '黄矮星', weight: 24, color: '#ffd76a', radius: 9,
      yield: { metal: 1.15, darkMatter: 1.0, materials: 1.1, research: 1.15 }, desc: '温和宜居，殖民效率极高。'
    },
    blueGiant: {
      id: 'blueGiant', name: '蓝巨星', weight: 10, color: '#7bb8ff', radius: 14,
      yield: { metal: 1.35, darkMatter: 1.2, materials: 1.3, research: 1.1 }, desc: '强烈的辐射带来充沛能源，工业加成显著。'
    },
    redGiant: {
      id: 'redGiant', name: '红巨星', weight: 12, color: '#ff5f3d', radius: 15,
      yield: { metal: 1.7, darkMatter: 1.0, materials: 1.2, research: 0.9 }, desc: '外层物质松散，金属资源极其丰富。'
    },
    whiteDwarf: {
      id: 'whiteDwarf', name: '白矮星', weight: 9, color: '#dff3ff', radius: 6,
      yield: { metal: 0.9, darkMatter: 1.5, materials: 1.4, research: 1.3 }, desc: '超高密度残骸，利于材料精炼。'
    },
    neutron: {
      id: 'neutron', name: '中子星', weight: 7, color: '#a9f0ff', radius: 5,
      yield: { metal: 0.8, darkMatter: 1.6, materials: 1.2, research: 2.0 }, desc: '极端物理环境，科研产出翻倍。'
    },
    pulsar: {
      id: 'pulsar', name: '脉冲星', weight: 5, color: '#7ef7d4', radius: 5,
      yield: { metal: 0.7, darkMatter: 2.0, materials: 1.0, research: 1.7 }, desc: '周期性脉冲，暗物质采集效率极高。'
    },
    blackHole: {
      id: 'blackHole', name: '黑洞', weight: 4, color: '#c58bff', radius: 11,
      yield: { metal: 0.6, darkMatter: 2.6, materials: 1.3, research: 2.2 }, desc: '事件视界边缘是暗物质与高能物理的天然实验室。'
    }
  };

  /* ---------------- 恒星特性 ---------------- */
  SW.StarFeatureConfig = {
    none: { id: 'none', name: '', weight: 46, yield: {}, desc: '' },
    mineralRich: { id: 'mineralRich', name: '矿物星系', weight: 14, yield: { metal: 2.2 }, desc: '金属产量极高' },
    darkMatterWell: { id: 'darkMatterWell', name: '暗物质星', weight: 10, yield: { darkMatter: 2.8 }, desc: '暗物质产量高' },
    ancientRuins: { id: 'ancientRuins', name: '远古遗迹', weight: 8, yield: { research: 2.6 }, desc: '研究点产量高' },
    rareDeposit: { id: 'rareDeposit', name: '稀有资源星', weight: 7, yield: { materials: 3.0 }, desc: '高级材料产量高' },
    barren: { id: 'barren', name: '贫瘠星系', weight: 12, yield: { metal: 0.35, darkMatter: 0.35, materials: 0.35, research: 0.5 }, desc: '资源贫瘠，但可能拥有重要战略位置' },
    forgeWorld: { id: 'forgeWorld', name: '铸造世界', weight: 5, yield: { metal: 1.5, materials: 1.6 }, desc: '天然工业星球，造船效率 +25%', shipyard: 0.25 },
    nexusPoint: { id: 'nexusPoint', name: '航道枢纽', weight: 6, yield: {}, desc: '星际物流枢纽，附近舰队补给 +30%', logistics: 0.30 }
  };
})(window.SW);
