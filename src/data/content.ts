import {
  AchievementDef,
  MachineRecipeDef,
  MachineType,
  NpcDef,
  NpcId,
  PlotId,
  PotatoVarietyDef,
  PotatoVarietyId,
  QualityGrade,
  QuestDef,
  Season,
  ToolId,
  UpgradeDef,
  UpgradeId
} from './types';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const DAYS_PER_SEASON = 7;
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 22;
/** Default 240 real seconds (4 minutes) for 16 active in-game hours => 15 real seconds per in-game hour */
export const REAL_SECONDS_PER_GAME_HOUR = 15;

export const QUALITY_MULTIPLIERS: Record<QualityGrade, number> = {
  standard: 1.0,
  prime: 1.35,
  artisan: 1.85
};

export const QUALITY_LABELS: Record<QualityGrade, string> = {
  standard: 'Standard',
  prime: 'Prime [Tier II]',
  artisan: 'Artisan [Tier III]'
};

export const POTATO_VARIETIES: Record<PotatoVarietyId, PotatoVarietyDef> = {
  sunburst: {
    id: 'sunburst',
    name: 'Yukon Sunburst',
    subtitle: 'Buttery Golden All-Rounder',
    description:
      'A cheerful, fast-bulking golden tuber with thin skin and buttery flesh. Forgiving of slight moisture swings and responds eagerly to early hilling.',
    preferredSeasons: ['spring', 'summer'],
    growthHours: 36, // ~2.25 active days
    yieldMin: 3,
    yieldMax: 4,
    optimalMoisture: [35, 80],
    waterNeedLabel: 'Moderate',
    frostTolerant: false,
    seedCost: 20,
    baseSellPrice: 16,
    qualityCeiling: 100,
    unlockDay: 1,
    colorHex: '#e8bc4a',
    blossomHex: '#fff8d2'
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Rose',
    subtitle: 'High-Yield Waxy Red Tuber',
    description:
      'A thirsty, vigorous red variety that produces generous clusters of smooth waxy tubers. Thrives in damp Spring and Autumn rains.',
    preferredSeasons: ['spring', 'autumn'],
    growthHours: 48, // ~3 active days
    yieldMin: 4,
    yieldMax: 6,
    optimalMoisture: [50, 95],
    waterNeedLabel: 'High',
    frostTolerant: false,
    seedCost: 26,
    baseSellPrice: 15,
    qualityCeiling: 105,
    unlockDay: 1,
    colorHex: '#cc4844',
    blossomHex: '#ffb6cd'
  },
  russet: {
    id: 'russet',
    name: 'Ironclad Russet',
    subtitle: 'Hardy Starchy Baker',
    description:
      'Thick-skinned and drought-resilient with floury, high-starch flesh prized for kettle chips. Prefers moderate moisture and double-hilled ridges.',
    preferredSeasons: ['summer', 'autumn'],
    growthHours: 54,
    yieldMin: 3,
    yieldMax: 4,
    optimalMoisture: [25, 68],
    waterNeedLabel: 'Low',
    frostTolerant: false,
    seedCost: 30,
    baseSellPrice: 25,
    qualityCeiling: 110,
    unlockDay: 2,
    colorHex: '#a47044',
    blossomHex: '#f5f5fa'
  },
  violet: {
    id: 'violet',
    name: 'Violet Majesty',
    subtitle: 'Heirloom Purple Fingerling',
    description:
      'An amethyst-fleshed gourmet fingerling sought after by Chef Mireille. Demands rich soil fertility and steady moisture to reach Artisan grade.',
    preferredSeasons: ['summer', 'autumn'],
    growthHours: 64,
    yieldMin: 2,
    yieldMax: 4,
    optimalMoisture: [45, 78],
    waterNeedLabel: 'Precise',
    frostTolerant: false,
    seedCost: 42,
    baseSellPrice: 38,
    qualityCeiling: 120,
    unlockDay: 3,
    colorHex: '#7e44a8',
    blossomHex: '#cd96ff'
  },
  frostbite: {
    id: 'frostbite',
    name: 'Glacier Finger',
    subtitle: 'Frost-Sweetened Winter Spec',
    description:
      'Bred in alpine terraces, this pale ivory tuber converts cold starches into sweet sugars during frost and snow. Grows outdoors even in deep Winter.',
    preferredSeasons: ['autumn', 'winter', 'spring'],
    growthHours: 52,
    yieldMin: 3,
    yieldMax: 4,
    optimalMoisture: [30, 75],
    waterNeedLabel: 'Low',
    frostTolerant: true,
    seedCost: 36,
    baseSellPrice: 30,
    qualityCeiling: 115,
    unlockDay: 4,
    colorHex: '#dae8f5',
    blossomHex: '#afebff'
  },
  truffle: {
    id: 'truffle',
    name: 'Golden Truffle Spud',
    subtitle: 'Solanum Aurum Crown Variety',
    description:
      'The legendary crown jewel of Spudstead. Knobby, shimmering tubers with a roasted hazelnut aroma. Requires composted soil and careful hilling.',
    preferredSeasons: ['spring', 'summer', 'autumn'],
    growthHours: 76,
    yieldMin: 2,
    yieldMax: 3,
    optimalMoisture: [45, 82],
    waterNeedLabel: 'Precise',
    frostTolerant: false,
    seedCost: 68,
    baseSellPrice: 64,
    qualityCeiling: 130,
    unlockDay: 5,
    colorHex: '#da9e2a',
    blossomHex: '#ffe15f'
  }
};

export const VARIETY_ORDER: PotatoVarietyId[] = [
  'sunburst',
  'crimson',
  'russet',
  'violet',
  'frostbite',
  'truffle'
];

export interface ToolDef {
  id: ToolId;
  name: string;
  hotkey: string;
  staminaCost: number;
  description: string;
  usageHint: string;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  spade: {
    id: 'spade',
    name: 'Homestead Spade',
    hotkey: '1',
    staminaCost: 4,
    description: 'Clears field stones/weeds and tills turf into loose potato furrows.',
    usageHint: 'Use on grass/debris in unlocked plots to clear and till soil.'
  },
  hoe: {
    id: 'hoe',
    name: 'Hilling Hoe',
    hotkey: '2',
    staminaCost: 3,
    description:
      'Mounds dark soil around growing potato stems (up to 2x) to prevent greening, boost yield, and clear weeds or beetles.',
    usageHint: 'Use on growing crops (Stages 1–3) to hill ridges or remove weeds/pests.'
  },
  watering_can: {
    id: 'watering_can',
    name: 'Watering Can',
    hotkey: '3',
    staminaCost: 2,
    description: 'Hydrates tilled furrows and growing crops. Refill at the Pond or Stone Well.',
    usageHint: 'Use on dry soil/crops, or click the Pond/Well to refill water.'
  },
  fork: {
    id: 'fork',
    name: 'Harvest Fork',
    hotkey: '4',
    staminaCost: 3,
    description: 'Gently lifts mature Stage 4 potato ridges without bruising the tubers.',
    usageHint: 'Use on Harvest-Ready (Stage 4) potato ridges.'
  },
  pouch: {
    id: 'pouch',
    name: 'Seed & Compost Pouch',
    hotkey: '5',
    staminaCost: 2,
    description: 'Plants selected seed potatoes into tilled soil or spreads Compost/Fertilizer.',
    usageHint: 'Select a seed or compost in your pouch and apply to tilled soil.'
  }
};

export interface SupplyDef {
  itemId: string;
  name: string;
  category: 'supply';
  buyPrice: number;
  sellPrice: number;
  fertilityBoost: number;
  moistureBoost: number;
  careBoost: number;
  description: string;
}

export const SUPPLIES: Record<string, SupplyDef> = {
  supply_compost: {
    itemId: 'supply_compost',
    name: 'Rich Farm Compost',
    category: 'supply',
    buyPrice: 22,
    sellPrice: 10,
    fertilityBoost: 35,
    moistureBoost: 10,
    careBoost: 14,
    description: 'Dark, sweet-smelling humus (+35% Fertility, +10% Moisture, +14 Care).'
  },
  supply_fertilizer: {
    itemId: 'supply_fertilizer',
    name: 'Mineral Potash Tonic',
    category: 'supply',
    buyPrice: 38,
    sellPrice: 16,
    fertilityBoost: 55,
    moistureBoost: 0,
    careBoost: 24,
    description: 'Concentrated wood-ash & kelp mineral blend (+55% Fertility, +24 Care).'
  },
  supply_mulch: {
    itemId: 'supply_mulch',
    name: 'Field Clippings & Mulch',
    category: 'supply',
    buyPrice: 10,
    sellPrice: 4,
    fertilityBoost: 12,
    moistureBoost: 15,
    careBoost: 5,
    description: 'Gathered wild greens and straw. Compost in a Tumbler or spread as light mulch.'
  }
};

export interface MachineBlueprintDef {
  type: MachineType;
  name: string;
  cost: number;
  description: string;
  operatingRule: string;
}

export const MACHINE_BLUEPRINTS: Record<MachineType, MachineBlueprintDef> = {
  sprinkler: {
    type: 'sprinkler',
    name: 'Rotary Brass Sprinkler',
    cost: 130,
    description: 'Automatically waters surrounding 3×3 (or 5×5 with upgrade) soil tiles every morning and midday.',
    operatingRule: 'Place on any unlocked farm or courtyard tile. Waters adjacent tiles at 06:00 and 13:00.'
  },
  composter: {
    type: 'composter',
    name: 'Oak Compost Tumbler',
    cost: 140,
    description: 'Turns Field Clippings or surplus potatoes into bags of Rich Farm Compost.',
    operatingRule: 'Load 2 Field Clippings or 1 Potato to brew 2 Rich Farm Compost over 8 hours.'
  },
  seed_cutter: {
    type: 'seed_cutter',
    name: 'Seed Tuber Cutter',
    cost: 165,
    description: 'Slices 1 harvested potato into 2 chitted Seed Potatoes of the same variety (3 with Mastery).',
    operatingRule: 'Load 1 harvested potato of any variety to prepare 2–3 matching Seed Potatoes over 6 hours.'
  },
  kitchen: {
    type: 'kitchen',
    name: 'Artisan Spud Kitchen',
    cost: 240,
    description: 'Roasts, kettles, and simmers harvested tubers into high-margin culinary delicacies.',
    operatingRule: 'Load 2 harvested potatoes to craft gourmet dishes worth 2.4×–3.0× raw value.'
  }
};

export const MACHINE_RECIPES: MachineRecipeDef[] = [
  {
    id: 'recipe_compost_weeds',
    machineType: 'composter',
    name: 'Brew Clippings Compost',
    description: 'Compost 2 Field Clippings & Mulch into 2 bags of Rich Farm Compost.',
    inputItemId: 'supply_mulch',
    inputQuantity: 2,
    durationHours: 6,
    outputItemId: 'supply_compost',
    outputName: 'Rich Farm Compost',
    outputCategory: 'supply',
    outputQuantity: 2,
    outputBaseValue: 10
  },
  {
    id: 'recipe_compost_cull',
    machineType: 'composter',
    name: 'Compost Surplus Tubers',
    description: 'Turn 1 harvested potato of any variety into 2 bags of Rich Farm Compost.',
    inputCategory: 'crop',
    inputQuantity: 1,
    durationHours: 6,
    outputItemId: 'supply_compost',
    outputName: 'Rich Farm Compost',
    outputCategory: 'supply',
    outputQuantity: 2,
    outputBaseValue: 10
  },
  ...VARIETY_ORDER.map((vId): MachineRecipeDef => {
    const v = POTATO_VARIETIES[vId];
    return {
      id: `recipe_seed_${vId}`,
      machineType: 'seed_cutter',
      name: `Chit ${v.name} Seeds`,
      description: `Cut 1 harvested ${v.name} into 2 fresh ${v.name} Seed Eyes.`,
      inputCategory: 'crop',
      inputVarietyId: vId,
      inputQuantity: 1,
      durationHours: 5,
      outputItemId: `seed_${vId}`,
      outputName: `${v.name} Seed`,
      outputCategory: 'seed',
      outputQuantity: 2,
      outputBaseValue: Math.floor(v.seedCost * 0.5)
    };
  }),
  {
    id: 'recipe_kettle_chips',
    machineType: 'kitchen',
    name: 'Sea-Salt Kettle Chips',
    description: 'Crisp kettle-cooked chips from 2 Yukon Sunburst or Ironclad Russet tubers.',
    inputCategory: 'crop',
    inputQuantity: 2,
    durationHours: 8,
    outputItemId: 'proc_kettle_chips',
    outputName: 'Sea-Salt Kettle Chips',
    outputCategory: 'processed',
    outputQuantity: 1,
    outputBaseValue: 72
  },
  {
    id: 'recipe_rose_gratin',
    machineType: 'kitchen',
    name: 'Bistro Crimson Gratin',
    description: 'Creamy layered bake made with 2 Crimson Rose tubers.',
    inputCategory: 'crop',
    inputVarietyId: 'crimson',
    inputQuantity: 2,
    durationHours: 8,
    outputItemId: 'proc_rose_gratin',
    outputName: 'Bistro Crimson Gratin',
    outputCategory: 'processed',
    outputQuantity: 1,
    outputBaseValue: 68
  },
  {
    id: 'recipe_hearth_chowder',
    machineType: 'kitchen',
    name: 'Glacier Hearth Chowder',
    description: 'Velvety cold-weather chowder simmered from 2 Glacier Finger tubers.',
    inputCategory: 'crop',
    inputVarietyId: 'frostbite',
    inputQuantity: 2,
    durationHours: 9,
    outputItemId: 'proc_hearth_chowder',
    outputName: 'Glacier Hearth Chowder',
    outputCategory: 'processed',
    outputQuantity: 1,
    outputBaseValue: 105
  },
  {
    id: 'recipe_truffle_galette',
    machineType: 'kitchen',
    name: 'Royal Truffle & Violet Galette',
    description: 'Showstopping gourmet galette crafted from 2 Violet Majesty or Golden Truffle tubers.',
    inputCategory: 'crop',
    inputQuantity: 2,
    durationHours: 10,
    outputItemId: 'proc_truffle_galette',
    outputName: 'Royal Truffle Galette',
    outputCategory: 'processed',
    outputQuantity: 1,
    outputBaseValue: 165
  }
];

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'tool_spade_1',
    name: 'Tempered Ash Spade',
    category: 'tools',
    cost: 85,
    description: 'Forged high-carbon blade that slices through sod and roots with less effort.',
    benefitText: '-1 Stamina cost on Spade; tills 1×2 furrow forward when holding Shift or upgraded.'
  },
  {
    id: 'tool_hoe_1',
    name: 'Broad Ridging Hoe',
    category: 'tools',
    cost: 110,
    description: 'Curved bronze wing draws deep, protective soil ridges in a single stroke.',
    benefitText: '+50% Care bonus when hilling; single hill action grants +2 Hill Level!'
  },
  {
    id: 'tool_fork_1',
    name: 'Spring-Tine Harvest Fork',
    category: 'tools',
    cost: 150,
    description: 'Rounded spring-steel tines lift tubers without a scratch.',
    benefitText: '+12 Quality Score on every harvest and +1 bonus tuber on well-hilled ridges.'
  },
  {
    id: 'water_can_1',
    name: 'Copper Rose Watering Can',
    category: 'water',
    cost: 90,
    description: 'Hand-hammered copper reservoir with a fine brass rose spout.',
    benefitText: 'Increases Max Water from 12 to 22 and waters a 3-tile row in front of you.'
  },
  {
    id: 'water_can_2',
    name: 'Pressurized Homestead Can',
    category: 'water',
    cost: 210,
    prerequisite: 'water_can_1',
    description: 'Pump-pressurized brass watering tank for effortless field hydration.',
    benefitText: 'Increases Max Water to 36 and waters a full 3×3 plot area at once.'
  },
  {
    id: 'pack_1',
    name: 'Waxed Canvas Field Pack',
    category: 'inventory',
    cost: 95,
    description: 'Reinforced side-pockets for carrying more seed varieties and harvests.',
    benefitText: 'Expands Backpack capacity from 12 to 18 item stacks.'
  },
  {
    id: 'pack_2',
    name: 'Master Tuber Panniers',
    category: 'inventory',
    cost: 220,
    prerequisite: 'pack_1',
    description: 'Ventilated wicker-and-leather panniers built for festival-scale harvests.',
    benefitText: 'Expands Backpack capacity to 24 item stacks.'
  },
  {
    id: 'boots_1',
    name: 'Hobnailed Loam Boots',
    category: 'inventory',
    cost: 125,
    description: 'Cushioned wool-lined boots that keep your stride brisk across damp furrows.',
    benefitText: 'Increases Max Stamina from 100 to 140 and boosts walking speed by 20%.'
  },
  {
    id: 'land_south',
    name: 'South Sun-Terrace Deed',
    category: 'land',
    cost: 180,
    description: 'Unlocks the sunny 32-tile South Terrace plot below the main homestead field.',
    benefitText: 'Unlocks 32 warm soil tiles in the South Sun-Terrace (+10% growth speed in Spring/Summer).'
  },
  {
    id: 'land_east',
    name: 'East Loam Hollow Deed',
    category: 'land',
    cost: 280,
    description: 'Unlocks the nutrient-dense 35-tile East Loam Hollow beside the Market Pavilion.',
    benefitText: 'Unlocks 35 deep-loam tiles with +25% natural baseline fertility.'
  },
  {
    id: 'land_greenhouse',
    name: 'All-Season Glass Coldframe',
    category: 'land',
    cost: 420,
    description: 'Constructs a timber-and-glass coldframe enclosure over the North-East terrace.',
    benefitText: 'Unlocks 28 sheltered greenhouse tiles where ALL potato varieties thrive year-round, even in Winter!'
  },
  {
    id: 'irrigation_1',
    name: 'High-Pressure Sprinkler Nozzles',
    category: 'irrigation',
    cost: 190,
    description: 'Precision brass nozzles that boost sprinkler misting efficiency.',
    benefitText: 'Placed Sprinklers grant +6 Care Score each morning and keep moisture at 85%.'
  },
  {
    id: 'irrigation_2',
    name: 'Wide-Arc Rainmakers',
    category: 'irrigation',
    cost: 340,
    prerequisite: 'irrigation_1',
    description: 'Counterweighted rotary arms that double the coverage of every sprinkler.',
    benefitText: 'Upgrades all placed Sprinklers from 3×3 (8 tiles) to 5×5 (24 tiles) coverage!'
  },
  {
    id: 'processing_mastery',
    name: 'Artisan Guild Seal',
    category: 'processing',
    cost: 290,
    description: 'Official seal from the Valley Culinary Guild and Master Seed Cutters.',
    benefitText: 'Seed Cutters yield 3 seeds instead of 2; Kitchen & Compost recipes finish 35% faster and sell for +20%.'
  }
];

export const PLOT_INFO: Record<
  PlotId,
  { name: string; unlockUpgrade?: UpgradeId; badge: string; signX: number; signY: number }
> = {
  plot_homestead: {
    name: 'Homestead Patch',
    badge: 'Starter Field',
    signX: 7,
    signY: 7
  },
  plot_south: {
    name: 'South Sun-Terrace',
    unlockUpgrade: 'land_south',
    badge: 'Deed: 180g',
    signX: 7,
    signY: 18
  },
  plot_east: {
    name: 'East Loam Hollow',
    unlockUpgrade: 'land_east',
    badge: 'Deed: 280g',
    signX: 21,
    signY: 8
  },
  plot_greenhouse: {
    name: 'All-Season Coldframe',
    unlockUpgrade: 'land_greenhouse',
    badge: 'Deed: 420g',
    signX: 21,
    signY: 18
  }
};

export const NPCS: Record<NpcId, NpcDef> = {
  barnaby: {
    id: 'barnaby',
    name: 'Barnaby Root',
    role: 'Seed Merchant & Agronomist',
    x: 25,
    y: 5,
    portrait: './assets/art/portrait-barnaby.png',
    greetings: {
      spring: [
        'Fine loam weather! Yukon Sunburst and Crimson Rose practically leap out of the ridges in Spring.',
        'Remember: a potato left unhilled turns green in the sun. Give your stems a good mounding with the Hilling Hoe!'
      ],
      summer: [
        'Warm days ahead! Ironclad Russet and Violet Majesty love this summer heat.',
        'If watering by hand wears you down, a Copper Watering Can or a Rotary Sprinkler will save your back.'
      ],
      autumn: [
        'Crisp harvest air! Stock up on Glacier Finger seeds before the first Winter frost rolls in.',
        'Cut your best tubers in the Seed Tuber Cutter—two or three seeds from one spud beats paying retail!'
      ],
      winter: [
        'Snow on the ridges! Only Glacier Finger braves the open frost, unless you have the Glass Coldframe.',
        'Winter is prime season for brewing compost and running the Artisan Kitchen.'
      ]
    },
    tips: [
      'Hill your potato plants during Stages 1–3 with the Hilling Hoe (Key 2) to boost tuber count and quality.',
      'Check the Daily Market Demand banner—selling the featured variety grants a +25% price bonus!'
    ]
  },
  mireille: {
    id: 'mireille',
    name: 'Chef Mireille',
    role: 'Bistro Culinary Buyer',
    x: 31,
    y: 6,
    portrait: './assets/art/portrait-mireille.png',
    greetings: {
      spring: [
        'Bonjour, farmer! My bistro menu is begging for buttery Yukon Sunbursts and crisp Kettle Chips.',
        'Care in the field tastes on the plate: well-watered, hilled, composted ridges yield Prime and Artisan tubers!'
      ],
      summer: [
        'Have you grown Violet Majesty yet? Their purple color in a galette makes the whole dining room gasp.',
        'Bring harvested tubers to the Artisan Spud Kitchen—cooked dishes fetch a handsome premium.'
      ],
      autumn: [
        'Autumn is gratin season! Crimson Rose and Ironclad Russet are flying out of my kitchen.',
        'Complete Daily Orders on the board beside me whenever you need quick gold and guild renown.'
      ],
      winter: [
        'Nothing warms a snowy evening like Glacier Hearth Chowder. Keep those winter pots bubbling!',
        'The Golden Spud Festival judges adore Artisan-grade Golden Truffle Spuds.'
      ]
    },
    tips: [
      'Artisan [Tier III] tubers sell for 1.85x base price and are required for top festival honors.',
      'The Artisan Spud Kitchen turns 2 raw potatoes into gourmet dishes worth up to 165g!'
    ]
  },
  mossy: {
    id: 'mossy',
    name: 'Old Mossy (Alder Thorne)',
    role: 'Master Soil Keeper & Festival Chair',
    x: 4,
    y: 19,
    portrait: './assets/art/portrait-mossy.png',
    greetings: {
      spring: [
        'Welcome to Spudstead, young sprout! Start with those three mature ridges in your field—they only need a splash of water or a quick fork.',
        'If your pockets ever run dry, come see me by the Grove. The valley never lets a potato grower go seedless.'
      ],
      summer: [
        'Feed the soil and the soil feeds the tuber. Toss weeds into the Compost Tumbler for free Rich Compost!',
        'Watch for weeds or Colorado beetles on your haulms—a quick tap with the Hilling Hoe clears them right off.'
      ],
      autumn: [
        'The Golden Spud Festival approaches! Check your Almanac to see which of the five Festival Pillars you still need.',
        'Every variety has its own rhythm. Read the crop inspector card when hovering over any ridge.'
      ],
      winter: [
        'Even in frost, the earth rests and prepares. Harvest wild mulch here in the grove to keep your composters turning.',
        'When all five Festival Pillars shine gold, open the Festival tab to host the Golden Spud Judging!'
      ]
    },
    tips: [
      'Out of gold or seeds? Visit Old Mossy in the South-West Grove for free emergency seed eyes and mulch.',
      'Win the Golden Spud Festival by completing all 5 Festival Pillars in the Almanac.'
    ]
  }
};

export const QUESTS: QuestDef[] = [
  {
    id: 'quest_first_harvest',
    title: '1. First Forks in the Loam',
    giver: 'mossy',
    description: 'Harvest 3 potatoes from the near-mature starter patch in your Homestead Field using the Harvest Fork (Key 4).',
    flavorText: 'Old Mossy left three ridges nearly ready for lifting so you can taste your first harvest right away.',
    requirement: { type: 'harvest_count', target: 3 },
    rewardGold: 45,
    rewardItems: [{ itemId: 'seed_sunburst', quantity: 3 }]
  },
  {
    id: 'quest_hill_care',
    title: '2. Earthing Up the Ridges',
    giver: 'barnaby',
    description: 'Use the Hilling Hoe (Key 2) to hill up growing potato plants 3 times.',
    flavorText: 'Potatoes form on underground stolons. Hilling mounds dark earth over them so they grow plump and never turn green.',
    requirement: { type: 'hill_count', target: 3 },
    rewardGold: 55,
    rewardItems: [{ itemId: 'supply_compost', quantity: 2 }]
  },
  {
    id: 'quest_crimson_harvest',
    title: '3. Ruby Tubers for the Bistro',
    giver: 'mireille',
    description: 'Grow and harvest 4 Crimson Rose potatoes.',
    flavorText: 'Chef Mireille needs waxy red tubers that hold their shape in a country casserole.',
    requirement: { type: 'harvest_variety', varietyId: 'crimson', target: 4 },
    rewardGold: 75,
    rewardItems: [{ itemId: 'seed_russet', quantity: 3 }]
  },
  {
    id: 'quest_first_upgrade',
    title: '4. Proper Homestead Gear',
    giver: 'barnaby',
    description: 'Purchase your first farm or tool upgrade from Barnaby’s Shop.',
    flavorText: 'Investing early harvests into a Copper Watering Can, Tempered Spade, or Broad Hoe pays dividends every single day.',
    requirement: { type: 'buy_upgradeCount', target: 1 },
    rewardGold: 80
  },
  {
    id: 'quest_compost_cycle',
    title: '5. Black Gold from the Tumbler',
    giver: 'mossy',
    description: 'Produce or collect 1 batch of output from a processing station (Compost Tumbler, Seed Cutter, or Kitchen).',
    flavorText: 'Turn field weeds or cull spuds into rich humus or chitted seed eyes.',
    requirement: { type: 'craft_count', target: 1 },
    rewardGold: 70,
    rewardItems: [{ itemId: 'supply_fertilizer', quantity: 2 }]
  },
  {
    id: 'quest_prime_quality',
    title: '6. Prime Selection',
    giver: 'mireille',
    description: 'Harvest 3 Prime or Artisan grade potatoes through proper watering, hilling, and soil fertility.',
    flavorText: 'Any farm can grow a field-grade spud; a true spudsteader coaxes out Prime flavor.',
    requirement: { type: 'harvest_quality', quality: 'prime', target: 3 },
    rewardGold: 110,
    rewardItems: [{ itemId: 'seed_violet', quantity: 3 }]
  },
  {
    id: 'quest_russet_baker',
    title: '7. The Ironclad Baker',
    giver: 'barnaby',
    description: 'Grow and harvest 4 Ironclad Russet potatoes.',
    flavorText: 'Russets dislike soggy feet—keep their moisture moderate and hill them well.',
    requirement: { type: 'harvest_variety', varietyId: 'russet', target: 4 },
    rewardGold: 115
  },
  {
    id: 'quest_sprinkler_setup',
    title: '8. Automated Morning Dew',
    giver: 'barnaby',
    description: 'Have at least 1 Rotary Brass Sprinkler placed on your farm (buy & place via Build Menu or Shop).',
    flavorText: 'Let brass gears handle the morning watering while you focus on soil care and expansion.',
    requirement: { type: 'place_sprinkler', target: 1 },
    rewardGold: 135,
    rewardItems: [{ itemId: 'seed_frostbite', quantity: 3 }]
  },
  {
    id: 'quest_violet_heur',
    title: '9. Amethyst Fingerlings',
    giver: 'mireille',
    description: 'Grow and harvest 3 Violet Majesty heirloom potatoes.',
    flavorText: 'Feed the soil with Rich Compost before planting Violet Majesty so they reach their regal potential.',
    requirement: { type: 'harvest_variety', varietyId: 'violet', target: 3 },
    rewardGold: 150,
    rewardItems: [{ itemId: 'seed_truffle', quantity: 2 }]
  },
  {
    id: 'quest_artisan_cook',
    title: '10. Culinary Alchemy',
    giver: 'mireille',
    description: 'Complete 3 processing batches across the Compost Tumbler, Seed Cutter, or Artisan Kitchen.',
    flavorText: 'Value-added goods turn a humble potato patch into a thriving estate.',
    requirement: { type: 'craft_count', target: 3 },
    rewardGold: 165
  },
  {
    id: 'quest_glacier_harvest',
    title: '11. Sweetened by the Frost',
    giver: 'mossy',
    description: 'Grow and harvest 3 Glacier Finger potatoes.',
    flavorText: 'Glacier Finger laughs at cold winds and keeps your farm productive through Autumn and Winter.',
    requirement: { type: 'harvest_variety', varietyId: 'frostbite', target: 3 },
    rewardGold: 160
  },
  {
    id: 'quest_artisan_grade',
    title: '12. Reserve-Grade Mastery',
    giver: 'mossy',
    description: 'Harvest 3 Artisan [Tier III] grade potatoes of any variety.',
    flavorText: 'Combine composted soil, steady moisture, and double-hilled ridges to achieve the golden Artisan seal.',
    requirement: { type: 'harvest_quality', quality: 'artisan', target: 3 },
    rewardGold: 200,
    rewardItems: [{ itemId: 'seed_truffle', quantity: 2 }]
  },
  {
    id: 'quest_truffle_crown',
    title: '13. Solanum Aurum',
    giver: 'mireille',
    description: 'Grow and harvest 2 Golden Truffle Spuds.',
    flavorText: 'Their nutty, golden flesh is the centerpiece of the annual Golden Spud Festival.',
    requirement: { type: 'harvest_variety', varietyId: 'truffle', target: 2 },
    rewardGold: 240
  },
  {
    id: 'quest_estate_upgrades',
    title: '14. A Thriving Spudstead',
    giver: 'barnaby',
    description: 'Own at least 5 Farm & Tool Upgrades.',
    flavorText: 'With expanded land, upgraded tools, and irrigation, your homestead is ready for the Golden Spud Festival!',
    requirement: { type: 'buy_upgradeCount', target: 5 },
    rewardGold: 300
  }
];

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'ach_first_spud',
    title: 'Humble Tuber',
    description: 'Harvest your very first potato on Spudstead.',
    icon: 'sprout'
  },
  {
    id: 'ach_ridge_master',
    title: 'Properly Earthed',
    description: 'Hill up potato ridges 10 times with the Hilling Hoe.',
    icon: 'hoe'
  },
  {
    id: 'ach_six_varieties',
    title: 'Heritage Botanist',
    description: 'Harvest all 6 distinct potato varieties at least once.',
    icon: 'sprout'
  },
  {
    id: 'ach_artisan_grower',
    title: 'Artisan Reserve',
    description: 'Harvest 5 Artisan [Tier III] quality potatoes.',
    icon: 'star'
  },
  {
    id: 'ach_compost_alchemist',
    title: 'Soil Alchemist',
    description: 'Complete 5 processing batches in machines.',
    icon: 'compost'
  },
  {
    id: 'ach_irrigated',
    title: 'Brass Rainmaker',
    description: 'Have at least 2 Rotary Sprinklers operating on your farm.',
    icon: 'water'
  },
  {
    id: 'ach_land_baron',
    title: 'Estate Baron',
    description: 'Unlock a new farm plot deed (South Terrace, East Hollow, or Coldframe).',
    icon: 'quests'
  },
  {
    id: 'ach_bistro_partner',
    title: 'Bistro Purveyor',
    description: 'Complete 6 authored town quests or daily contracts.',
    icon: 'kitchen'
  },
  {
    id: 'ach_thousand_gold',
    title: 'Golden Ledger',
    description: 'Earn 1,500g in lifetime farm revenue.',
    icon: 'coin'
  },
  {
    id: 'ach_winter_hardy',
    title: 'Frost Defier',
    description: 'Harvest Glacier Finger tubers or cultivate inside the Glass Coldframe.',
    icon: 'frost'
  },
  {
    id: 'ach_tool_smith',
    title: 'Master Equipped',
    description: 'Purchase 6 upgrades across tools, water, pack, land, or irrigation.',
    icon: 'build'
  },
  {
    id: 'ach_festival_champion',
    title: 'Golden Spud Laureate',
    description: 'Win the Golden Spud Festival and claim the Golden Spud Trophy!',
    icon: 'trophy'
  }
];

export interface FestivalPillarStatus {
  id: string;
  label: string;
  current: number;
  target: number;
  done: boolean;
}
