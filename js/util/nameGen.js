/* ===========================================================
 *  随机名称生成器 —— 恒星 / 舰船 / 舰队 / 人物风格名
 * =========================================================== */
window.SW = window.SW || {};
(function (SW) {
  'use strict';

  /* 恒星名：词根 A + 词根 B，另有希腊字母编号与代号 */
  const STAR_A = [
    '卡戎', '维克塔', '塞勒斯', '诺克提斯', '奥罗拉', '赫利俄斯', '塔罗斯', '泽塔', '欧米伽',
    '阿卡狄亚', '德尔塔', '忒修斯', '奥丁', '涅墨西斯', '厄里达诺斯', '法厄同', '塞壬', '克洛诺斯',
    '伊卡洛斯', '阿特拉斯', '普罗米修斯', '俄里翁', '安提戈涅', '吕卡翁', '刻耳柏洛斯', '许珀里翁',
    '忒亚', '瑞亚', '谟涅摩绪涅', '忒弥斯', '福柏', '科俄斯', '克利俄斯', '伊阿佩托斯', '忒堤斯',
    '忒尔弥努斯', '维斯塔', '密涅瓦', '朱诺', '伏尔甘', '涅普顿', '普鲁托', '克瑞斯', '法玛',
    '阿瑞斯', '赫菲斯托斯', '狄俄尼索斯', '赫尔墨斯', '阿尔忒弥斯', '得墨忒耳', '赫斯提亚', '波塞冬',
    '泽费罗斯', '玻瑞阿斯', '诺托斯', '欧洛斯', '阿斯忒里亚', '厄俄斯', '塞勒涅', '倪克斯', '盖亚',
    '厄洛斯', '塔纳托斯', '修普诺斯', '摩耳甫斯', '伊里斯', '赫柏', '厄里斯', '阿忒', '涅索斯'
  ];
  const STAR_B = [
    '', '', '', '', '之眼', '之门', '之环', '之矛', '之盾', '之冠', '之喉', '之心', '之影', '之焰',
    '深渊', '边境', '荒原', '穹顶', '回廊', '裂谷', '灯塔', '熔炉', '摇篮', '坟场', '王座', '壁垒',
    '节点', '锚点', '哨站', '遗产', '晨曦', '暮光', '寂静', '风暴', '寒霜', '炽阳', '幽径', '断崖'
  ];
  const GREEK = ['阿尔法', '贝塔', '伽马', '德尔塔', '厄普西隆', '泽塔', '艾塔', '西塔', '约塔', '卡帕',
    '兰姆达', '缪', '纽', '克西', '欧米克隆', '派', '罗', '西格玛', '陶', '宇普西隆', '斐', '奇', '普西', '欧米伽'];
  const SUFFIX_CODE = ['Prime', 'Majoris', 'Minoris', 'Secundus', 'Tertius', 'Ultima', 'Nexus', 'Extrema', 'Nova', 'Vetus'];

  /* 舰船名：大型舰用 */
  const SHIP_TITLE = ['ISS', 'ISS', 'ISV', 'ISD', 'HLV', 'RKV', 'VSS', 'IES', 'IRS'];
  const SHIP_NAME = [
    'Aurora', 'Void Spear', 'Endless Horizon', 'Imperium Rex', 'Eternal Dawn', 'Silent Thunder',
    'Obsidian Fang', 'Crimson Tide', 'Pale Horseman', 'Nova Lance', 'Stellar Hammer', 'Abyssal Crown',
    'Iron Resolve', 'Quantum Veil', 'Solar Wrath', 'Nebula Dancer', 'Frostbound', 'Last Vigil',
    'Starshatter', 'Genesis Ark', 'Dark Meridian', 'Aegis Eternal', 'Winter Fang', 'Burning Crown',
    'Silent Verdict', 'Titanborn', 'Omega Verdict', 'Hollow Star', 'Radiant Fury', 'Death Whisper',
    'Unbroken Will', 'Gravity Well', 'Photon Requiem', 'Iron Halo', 'Azure Dominion', 'Crimson Dawn',
    'Void Hammer', 'Astral Sentence', 'Final Dawn', 'Wandering Flame', 'Ghost of Charon', 'Skyfall',
    'Worldbreaker', 'Emerald Storm', 'Onyx Reign', 'Silver Cascade', 'Molten Sky', 'Bleak Horizon',
    'Pale Nova', 'Iron Requiem', 'Shattered Sun', 'Endless Vigil', 'Cold Vengeance', 'Astral Crown'
  ];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  /* 舰队名 */
  const FLEET_ADJ = ['第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
    '第十一', '第十二', '北方', '南方', '东方', '西方', '中央', '边境', '远征', '快速', '钢铁',
    '雷霆', '烈焰', '寒霜', '暗影', '黎明', '黄昏', '荣耀', '铁血', '星海', '深渊', '猎户'];
  const FLEET_NOUN = ['舰队', '战斗群', '远征军', '特遣队', '打击群', '守卫军团', '突击集群', '机动舰队', '讨伐军', '戍卫舰队'];

  const NameGen = {
    /** 恒星名 */
    star(rng) {
      const r = rng.next();
      if (r < 0.14) return rng.pick(GREEK) + '-' + rng.int(1, 99);
      if (r < 0.22) return rng.pick(STAR_A) + ' ' + rng.pick(SUFFIX_CODE);
      if (r < 0.30) return rng.pick(GREEK) + ' ' + rng.pick(STAR_A);
      if (r < 0.36) return rng.pick(STAR_A) + rng.pick(['', '', '']) + '·' + rng.pick(SUFFIX_CODE);
      return rng.pick(STAR_A) + rng.pick(STAR_B);
    },

    /** 大型舰名（泰坦/航母/旗舰） */
    capital(rng, factionTag) {
      const r = rng.next();
      const tag = factionTag || rng.pick(SHIP_TITLE);
      if (r < 0.35) return tag + ' ' + rng.pick(SHIP_NAME);
      if (r < 0.55) return rng.pick(SHIP_NAME) + ' ' + rng.pick(ROMAN);
      if (r < 0.72) return tag + ' ' + rng.pick(SHIP_NAME) + ' ' + rng.pick(ROMAN);
      if (r < 0.85) return '「' + rng.pick(SHIP_NAME) + '」';
      return tag + ' ' + rng.pick(GREEK) + '-' + rng.int(1, 999);
    },

    /** 舰队名 */
    fleet(rng, factionAdjective) {
      const r = rng.next();
      if (r < 0.55) return rng.pick(FLEET_ADJ) + rng.pick(FLEET_NOUN);
      if (r < 0.8) return (factionAdjective || '') + rng.pick(FLEET_NOUN);
      return rng.pick(FLEET_ADJ) + rng.pick(FLEET_NOUN) + '·' + rng.int(1, 99);
    },

    /** 势力母星名 */
    homeStar(rng) {
      return rng.pick(['起源', '黎明', '圣殿', '王座', '摇篮', '根基', '永恒', '中枢', '磐石', '晨星']) + '·' + rng.pick(SHIP_NAME);
    }
  };

  SW.NameGen = NameGen;
})(window.SW);
