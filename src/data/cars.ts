/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CarSpec {
  id: string;
  name: string;
  category: 'Supercar' | 'Hypercar' | 'Tuner' | 'Concept';
  color: string;
  underglowColor: string;
  price: number;
  unlocked: boolean;
  baseSpecs: {
    topSpeed: number; // in km/h (e.g. 260 - 380)
    acceleration: number; // 0-100 km/h in sec (e.g. 2.2s - 3.8s)
    handling: number; // 1 - 10 scale
    nitroPower: number; // 1 - 10 scale
  };
  description: string;
}

export interface UpgradeLevel {
  level: number;
  name: string;
  price: number;
  bonusText: string;
  speedDelta: number;
  accelDelta: number;
  handlingDelta: number;
  nitroDelta: number;
}

export interface UpgradeCategory {
  id: 'engine' | 'nos' | 'tires' | 'chassis';
  name: string;
  iconName: string;
  description: string;
  levels: UpgradeLevel[];
}

export const CAR_CATALOGUE: CarSpec[] = [
  {
    id: 'viper',
    name: 'Apex Viper GT',
    category: 'Supercar',
    color: '#3b82f6',
    underglowColor: '#06b6d4',
    price: 0,
    unlocked: true,
    baseSpecs: {
      topSpeed: 280,
      acceleration: 3.2,
      handling: 7.5,
      nitroPower: 7.0,
    },
    description: 'A precision-engineered track beast with balanced high-speed stability and sharp handling.',
  },
  {
    id: 'phantom',
    name: 'Phantom GT',
    category: 'Tuner',
    color: '#e11d48',
    underglowColor: '#f43f5e',
    price: 1,
    unlocked: false,
    baseSpecs: {
      topSpeed: 310,
      acceleration: 2.8,
      handling: 8.2,
      nitroPower: 8.0,
    },
    description: 'Lightweight Japanese twin-turbo V6 built for explosive acceleration and agile drifting.',
  },
  {
    id: 'cyber_razor',
    name: 'Cyber Razor 2077',
    category: 'Concept',
    color: '#10b981',
    underglowColor: '#10b981',
    price: 5,
    unlocked: false,
    baseSpecs: {
      topSpeed: 335,
      acceleration: 2.4,
      handling: 8.8,
      nitroPower: 8.5,
    },
    description: 'Futuristic electric hypercar featuring active aerodynamic torque vectoring and instant torque.',
  },
  {
    id: 'hyper_specter',
    name: 'Hyper Specter V12',
    category: 'Hypercar',
    color: '#a855f7',
    underglowColor: '#c084fc',
    price: 10,
    unlocked: false,
    baseSpecs: {
      topSpeed: 360,
      acceleration: 2.1,
      handling: 9.2,
      nitroPower: 9.2,
    },
    description: 'Quad-turbocharged V12 carbon monocoque masterpiece designed for uncompromising track dominance.',
  },
  {
    id: 'volcano_r8',
    name: 'Volcano R8 Flame',
    category: 'Supercar',
    color: '#f97316',
    underglowColor: '#f97316',
    price: 25,
    unlocked: false,
    baseSpecs: {
      topSpeed: 375,
      acceleration: 1.9,
      handling: 9.5,
      nitroPower: 9.8,
    },
    description: 'Raw high-revving naturally aspirated V10 beast tuned specifically for extreme nitro purges.',
  },
  {
    id: 'thunderbolt',
    name: 'Thunderbolt Spec-X',
    category: 'Concept',
    color: '#eab308',
    underglowColor: '#eab308',
    price: 50,
    unlocked: false,
    baseSpecs: {
      topSpeed: 395,
      acceleration: 1.7,
      handling: 9.9,
      nitroPower: 10.0,
    },
    description: 'The pinnacle of racing technology with plasma booster overdrive and ground-effect vacuum downforce.',
  },
  {
    id: 'sentinel',
    name: 'Sentinel V-Spec',
    category: 'Tuner',
    color: '#64748b',
    underglowColor: '#64748b',
    price: 2,
    unlocked: false,
    baseSpecs: {
      topSpeed: 295,
      acceleration: 3.0,
      handling: 8.0,
      nitroPower: 7.5,
    },
    description: 'The absolute legend of underground street racing with a legendary inline-6 engine and active four-wheel steering.',
  },
  {
    id: 'zenith',
    name: 'Zenith Electra',
    category: 'Concept',
    color: '#f43f5e',
    underglowColor: '#f43f5e',
    price: 15,
    unlocked: false,
    baseSpecs: {
      topSpeed: 345,
      acceleration: 2.2,
      handling: 8.5,
      nitroPower: 9.0,
    },
    description: 'An avant-garde luxury hyper-cruiser fueled by twin hydrogen fuel-cells with zero-latency torque management.',
  },
  {
    id: 'valkyrie',
    name: 'Valkyrie AMR Aero',
    category: 'Hypercar',
    color: '#14b8a6',
    underglowColor: '#14b8a6',
    price: 100,
    unlocked: false,
    baseSpecs: {
      topSpeed: 405,
      acceleration: 1.6,
      handling: 10.0,
      nitroPower: 9.9,
    },
    description: 'A revolutionary hyper-aerodynamic endurance racer powered by a high-revving naturally aspirated hybrid powertrain.',
  },
  {
    id: 'interceptor',
    name: 'Interceptor Interstellar',
    category: 'Concept',
    color: '#6366f1',
    underglowColor: '#6366f1',
    price: 250,
    unlocked: false,
    baseSpecs: {
      topSpeed: 420,
      acceleration: 1.5,
      handling: 10.0,
      nitroPower: 10.0,
    },
    description: 'A high-concept jet-propelled landspeed project featuring carbon-nanotube hull structural panels.',
  },
  {
    id: 'monarch',
    name: 'Monarch Royale',
    category: 'Hypercar',
    color: '#ec4899',
    underglowColor: '#ec4899',
    price: 500,
    unlocked: false,
    baseSpecs: {
      topSpeed: 440,
      acceleration: 1.4,
      handling: 9.8,
      nitroPower: 10.0,
    },
    description: 'The absolute ultimate luxury performance vehicle featuring solid-gold detailing and a record-breaking quad-charged W16.',
  },
];

export const UPGRADE_CATEGORIES: UpgradeCategory[] = [
  {
    id: 'engine',
    name: 'Engine Tuning',
    iconName: 'Gauge',
    description: 'Boost peak horsepower and top speed capacity.',
    levels: [
      { level: 0, name: 'Stock Engine', price: 0, bonusText: 'Standard OEM Factory Engine', speedDelta: 0, accelDelta: 0, handlingDelta: 0, nitroDelta: 0 },
      { level: 1, name: 'Stage 1 ECU & Air Intake', price: 0.5, bonusText: '+15 km/h Top Speed', speedDelta: 15, accelDelta: 0.1, handlingDelta: 0, nitroDelta: 0 },
      { level: 2, name: 'Stage 2 Twin Turbocharger', price: 1.5, bonusText: '+30 km/h Top Speed, +0.3 Accel', speedDelta: 30, accelDelta: 0.3, handlingDelta: 0, nitroDelta: 0 },
      { level: 3, name: 'Stage 3 Pro Race Cams & Forged Pistons', price: 3.5, bonusText: '+50 km/h Top Speed, +0.6 Accel', speedDelta: 50, accelDelta: 0.6, handlingDelta: 0, nitroDelta: 0 },
    ],
  },
  {
    id: 'nos',
    name: 'NOS Booster Unit',
    iconName: 'Zap',
    description: 'Enhance Nitro injection purge power and recharge rate.',
    levels: [
      { level: 0, name: 'Factory NOS Tank', price: 0, bonusText: 'Standard 100LB Single Injection', speedDelta: 0, accelDelta: 0, handlingDelta: 0, nitroDelta: 0 },
      { level: 1, name: 'Dual Purge High-Flow Bottle', price: 0.5, bonusText: '+20% Nitro Duration & Burst', speedDelta: 5, accelDelta: 0.1, handlingDelta: 0, nitroDelta: 1.5 },
      { level: 2, name: 'Quad Injection Direct Purge', price: 1.5, bonusText: '+40% Nitro Power & Acceleration', speedDelta: 10, accelDelta: 0.3, handlingDelta: 0, nitroDelta: 3.0 },
      { level: 3, name: 'Plasma Booster Overdrive', price: 3.5, bonusText: '+75% Hyper Nitro Thrust', speedDelta: 20, accelDelta: 0.5, handlingDelta: 0, nitroDelta: 5.0 },
    ],
  },
  {
    id: 'tires',
    name: 'Performance Tires & Grip',
    iconName: 'Activity',
    description: 'Improve cornering grip, steering agility, and drift control.',
    levels: [
      { level: 0, name: 'All-Season Radials', price: 0, bonusText: 'Standard Street Compound', speedDelta: 0, accelDelta: 0, handlingDelta: 0, nitroDelta: 0 },
      { level: 1, name: 'Sport Semi-Slick Compounds', price: 0.5, bonusText: '+1.0 Handling & Drift Stability', speedDelta: 0, accelDelta: 0.1, handlingDelta: 1.0, nitroDelta: 0 },
      { level: 2, name: 'Track Soft Slicks', price: 1.5, bonusText: '+2.2 Handling & Cornering Grip', speedDelta: 0, accelDelta: 0.2, handlingDelta: 2.2, nitroDelta: 0 },
      { level: 3, name: 'Ultra-Grip GT Racing Slicks', price: 3.5, bonusText: '+3.5 Precision Steering Agility', speedDelta: 5, accelDelta: 0.3, handlingDelta: 3.5, nitroDelta: 0 },
    ],
  },
  {
    id: 'chassis',
    name: 'Chassis Weight Reduction',
    iconName: 'Sparkles',
    description: 'Reduce vehicle weight for faster zero-to-hundred launch.',
    levels: [
      { level: 0, name: 'Factory Steel Frame', price: 0, bonusText: 'Original OEM Weight', speedDelta: 0, accelDelta: 0, handlingDelta: 0, nitroDelta: 0 },
      { level: 1, name: 'Alloy Panel Weight Reduction', price: 0.5, bonusText: '-60kg Weight, +0.2 Accel', speedDelta: 5, accelDelta: 0.2, handlingDelta: 0.5, nitroDelta: 0 },
      { level: 2, name: 'Full Carbon Fiber Body', price: 1.5, bonusText: '-140kg Lightening, +0.5 Accel', speedDelta: 10, accelDelta: 0.5, handlingDelta: 1.0, nitroDelta: 0 },
      { level: 3, name: 'Titanium-Carbon Monocoque', price: 3.5, bonusText: '-220kg Featherweight, +0.8 Accel', speedDelta: 15, accelDelta: 0.8, handlingDelta: 1.8, nitroDelta: 0 },
    ],
  },
];

export const BODY_COLOR_PALETTE = [
  { name: 'Apex Blue', hex: '#3b82f6' },
  { name: 'Stealth Onyx', hex: '#18181b' },
  { name: 'Crimson Fury', hex: '#e11d48' },
  { name: 'Toxic Lime', hex: '#10b981' },
  { name: 'Solar Flare', hex: '#f97316' },
  { name: 'Hyper Yellow', hex: '#eab308' },
  { name: 'Deep Amethyst', hex: '#a855f7' },
  { name: 'Pure Diamond', hex: '#f8fafc' },
];

export const UNDERGLOW_COLORS = [
  { name: 'Off', hex: 'transparent' },
  { name: 'Electric Cyan', hex: '#06b6d4' },
  { name: 'Neon Pink', hex: '#f43f5e' },
  { name: 'Toxic Emerald', hex: '#10b981' },
  { name: 'Solar Gold', hex: '#eab308' },
  { name: 'Plasma Purple', hex: '#a855f7' },
];

export const SPOILER_TYPES = [
  { id: 'none', name: 'Factory Clean' },
  { id: 'gt_wing', name: 'GT Racing Wing' },
  { id: 'vortex', name: 'Vortex Carbon Blade' },
  { id: 'hyper_aero', name: 'Hyper Aero Wing' },
];

export const TIRE_SMOKE_COLORS = [
  { name: 'White Cloud', hex: '#ffffff' },
  { name: 'Crimson Flame', hex: '#ef4444' },
  { name: 'Plasma Blue', hex: '#3b82f6' },
  { name: 'Electric Violet', hex: '#a855f7' },
  { name: 'Lime Burst', hex: '#84cc16' },
];
