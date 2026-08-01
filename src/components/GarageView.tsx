/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  CAR_CATALOGUE,
  UPGRADE_CATEGORIES,
  BODY_COLOR_PALETTE,
  UNDERGLOW_COLORS,
  SPOILER_TYPES,
  TIRE_SMOKE_COLORS,
  CarSpec
} from '../data/cars';
import { CarConfig, UpgradesState } from '../types';
import CarShowcaseEngine from './4d/CarShowcaseEngine';
import { KaspaWalletState } from '../services/kaspaMainnet';
import {
  Flag,
  Zap,
  Gauge,
  Activity,
  Sparkles,
  Coins,
  Check,
  ShoppingBag,
  Palette,
  Wrench,
  Car,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  X,
  Plus
} from 'lucide-react';

interface GarageViewProps {
  currentConfig: CarConfig;
  onSaveConfig: (newConfig: CarConfig) => void;
  onClose: () => void;
  walletState?: KaspaWalletState;
  onPurchaseKasItem?: (amountKas: number, itemName: string, itemMetadata: string) => Promise<boolean>;
  kaspaPrice?: number;
}

export default function GarageView({
  currentConfig,
  onSaveConfig,
  onClose,
  walletState,
  onPurchaseKasItem,
  kaspaPrice = 0.125
}: GarageViewProps) {
  const [config, setConfig] = useState<CarConfig>(() => {
    return {
      selectedCarId: currentConfig?.selectedCarId || 'viper',
      color: currentConfig?.color || '#3b82f6',
      upgrades: {
        engine: currentConfig?.upgrades?.engine ?? 0,
        nos: currentConfig?.upgrades?.nos ?? 0,
        tires: currentConfig?.upgrades?.tires ?? 0,
        chassis: currentConfig?.upgrades?.chassis ?? 0,
      },
      cosmetics: {
        underglowColor: currentConfig?.cosmetics?.underglowColor || 'transparent',
        smokeColor: currentConfig?.cosmetics?.smokeColor || '#ffffff',
        spoilerType: currentConfig?.cosmetics?.spoilerType || 'none',
      }
    };
  });
  const [activeTab, setActiveTab] = useState<'cars' | 'upgrades' | 'custom'>('cars');
  const [unlockedCarIds, setUnlockedCarIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('turbo_unlocked_cars');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return Array.from(new Set(['viper', ...parsed]));
        }
      }
    } catch {}
    return ['viper'];
  });
  const [mobileView, setMobileView] = useState<'showcase' | 'shop'>('showcase');
  const [isProcessingTx, setIsProcessingTx] = useState(false);

  const selectedCar = CAR_CATALOGUE.find(c => c.id === config.selectedCarId) || CAR_CATALOGUE[0];

  // Calculate stats after upgrades
  const engineUpgrade = UPGRADE_CATEGORIES.find(u => u.id === 'engine')?.levels[config.upgrades.engine] || UPGRADE_CATEGORIES[0].levels[0];
  const nosUpgrade = UPGRADE_CATEGORIES.find(u => u.id === 'nos')?.levels[config.upgrades.nos] || UPGRADE_CATEGORIES[1].levels[0];
  const tireUpgrade = UPGRADE_CATEGORIES.find(u => u.id === 'tires')?.levels[config.upgrades.tires] || UPGRADE_CATEGORIES[2].levels[0];
  const chassisUpgrade = UPGRADE_CATEGORIES.find(u => u.id === 'chassis')?.levels[config.upgrades.chassis] || UPGRADE_CATEGORIES[3].levels[0];

  const totalTopSpeed = selectedCar.baseSpecs.topSpeed + engineUpgrade.speedDelta + nosUpgrade.speedDelta + chassisUpgrade.speedDelta;
  const totalAccel = Math.max(1.2, +(selectedCar.baseSpecs.acceleration - engineUpgrade.accelDelta - nosUpgrade.accelDelta - chassisUpgrade.accelDelta).toFixed(2));
  const totalHandling = +(selectedCar.baseSpecs.handling + tireUpgrade.handlingDelta + chassisUpgrade.handlingDelta).toFixed(1);
  const totalNitro = +(selectedCar.baseSpecs.nitroPower + nosUpgrade.nitroDelta).toFixed(1);

  const handleSelectCar = (car: CarSpec) => {
    const updated = { ...config, selectedCarId: car.id, color: car.color };
    setConfig(updated);
    if (unlockedCarIds.includes(car.id)) {
      onSaveConfig(updated);
    }
  };

  const handleUnlockCar = async (car: CarSpec) => {
    if (unlockedCarIds.includes(car.id)) return;
    const priceKas = car.price;

    if (onPurchaseKasItem) {
      setIsProcessingTx(true);
      const metadata = `item_type:car|car_id:${car.id}|name:${car.name}|category:${car.category}|priceKas:${priceKas}`;
      const success = await onPurchaseKasItem(priceKas, `Vehicle: ${car.name}`, metadata);
      setIsProcessingTx(false);

      if (success) {
        const nextUnlocked = Array.from(new Set([...unlockedCarIds, car.id]));
        setUnlockedCarIds(nextUnlocked);
        localStorage.setItem('turbo_unlocked_cars', JSON.stringify(nextUnlocked));
        const updated = { ...config, selectedCarId: car.id, color: car.color };
        setConfig(updated);
        onSaveConfig(updated);
      }
    }
  };

  const handleCycleCar = (direction: 'next' | 'prev') => {
    const currentIndex = CAR_CATALOGUE.findIndex(c => c.id === config.selectedCarId);
    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= CAR_CATALOGUE.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = CAR_CATALOGUE.length - 1;
    
    const targetCar = CAR_CATALOGUE[nextIndex];
    const updated = { ...config, selectedCarId: targetCar.id, color: targetCar.color };
    setConfig(updated);
    if (unlockedCarIds.includes(targetCar.id)) {
      onSaveConfig(updated);
    }
  };

  const handleBuyUpgrade = async (catId: keyof UpgradesState, targetLevel: number, priceCredits: number, upgradeName: string) => {
    const priceKas = priceCredits;

    if (onPurchaseKasItem) {
      setIsProcessingTx(true);
      const metadata = `item_type:upgrade|category:${catId}|level:${targetLevel}|name:${upgradeName}|priceKas:${priceKas}`;
      const success = await onPurchaseKasItem(priceKas, `Upgrade: ${upgradeName}`, metadata);
      setIsProcessingTx(false);

      if (success) {
        const nextUpgrades = { ...config.upgrades, [catId]: targetLevel };
        const updated = { ...config, upgrades: nextUpgrades };
        setConfig(updated);
        onSaveConfig(updated);
      }
    }
  };

  const handleColorChange = (hex: string) => {
    const updated = { ...config, color: hex };
    setConfig(updated);
    onSaveConfig(updated);
  };

  const handleUnderglowChange = (hex: string) => {
    const updated = {
      ...config,
      cosmetics: {
        underglowColor: hex,
        smokeColor: config?.cosmetics?.smokeColor || '#ffffff',
        spoilerType: config?.cosmetics?.spoilerType || 'none',
      }
    };
    setConfig(updated);
    onSaveConfig(updated);
  };

  const handleSpoilerChange = (spoilerId: string) => {
    const updated = {
      ...config,
      cosmetics: {
        underglowColor: config?.cosmetics?.underglowColor || 'transparent',
        smokeColor: config?.cosmetics?.smokeColor || '#ffffff',
        spoilerType: spoilerId,
      }
    };
    setConfig(updated);
    onSaveConfig(updated);
  };

  const handleSmokeChange = (hex: string) => {
    const updated = {
      ...config,
      cosmetics: {
        underglowColor: config?.cosmetics?.underglowColor || 'transparent',
        smokeColor: hex,
        spoilerType: config?.cosmetics?.spoilerType || 'none',
      }
    };
    setConfig(updated);
    onSaveConfig(updated);
  };

  const handleClose = () => {
    if (!unlockedCarIds.includes(config.selectedCarId)) {
      const fallbackCarId = unlockedCarIds.includes(currentConfig.selectedCarId)
        ? currentConfig.selectedCarId
        : (unlockedCarIds[0] || 'viper');
      const fallbackCar = CAR_CATALOGUE.find(c => c.id === fallbackCarId) || CAR_CATALOGUE[0];
      const resetConfig = {
        ...config,
        selectedCarId: fallbackCarId,
        color: fallbackCar.color
      };
      onSaveConfig(resetConfig);
    } else {
      onSaveConfig(config);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16]/95 backdrop-blur-xl flex flex-col overflow-hidden text-slate-100 font-sans selection:bg-yellow-500 selection:text-black">
      {/* Floating Header Controls (Compact) */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[60] flex items-center gap-2 pointer-events-none">
        <button
          onClick={handleClose}
          className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-900/90 backdrop-blur-md hover:bg-slate-800 active:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 flex items-center gap-1 font-bold text-xs transition-all cursor-pointer pointer-events-auto shadow-xl"
        >
          <X className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Close</span>
        </button>
      </div>

      {/* Main Garage Workspace */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-0 flex flex-col lg:grid lg:grid-cols-12 gap-0 sm:gap-4 min-h-0 overflow-hidden">
        {/* Mobile View Toggle */}
        <div className="flex bg-slate-950 lg:hidden shrink-0">
          <button
            onClick={() => setMobileView('showcase')}
            className={`flex-1 py-3 rounded-none font-racing font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              mobileView === 'showcase'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Showcase & Stats</span>
          </button>
          <button
            onClick={() => setMobileView('shop')}
            className={`flex-1 py-3 rounded-none font-racing font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              mobileView === 'shop'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Upgrades & Tuning</span>
          </button>
        </div>

        {/* Left Column: 3D Showcase & Live Performance Radar (5 cols) */}
        <div className={`lg:col-span-5 flex flex-col gap-0 lg:h-full min-h-0 overflow-y-auto lg:overflow-visible pr-0 ${
          mobileView === 'showcase' ? 'flex flex-1 lg:flex-initial' : 'hidden lg:flex'
        }`}>
          {/* 3D Showcase Window */}
          <div className="h-[50dvh] min-h-[350px] sm:h-[55dvh] lg:h-auto lg:flex-1 min-h-0 relative group/showcase bg-slate-950/20 rounded-none overflow-hidden">
            <CarShowcaseEngine carConfig={config} />

            {/* Left/Right Floating Quick Cycle Chevrons */}
            <button
              onClick={() => handleCycleCar('prev')}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-90 shadow-xl cursor-pointer pointer-events-auto hover:border-yellow-500/50"
              title="Previous Car Model"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleCycleCar('next')}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-90 shadow-xl cursor-pointer pointer-events-auto hover:border-yellow-500/50"
              title="Next Car Model"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Performance Specs Panel */}
          <div className="bg-slate-900/90 p-2 sm:p-4 rounded-none lg:rounded-xl border-b lg:border border-slate-800 shadow-xl backdrop-blur-md space-y-1.5 sm:space-y-3.5 shrink-0">
            {/* Header with Title and Switcher Buttons */}
            <div className="flex justify-between items-center pb-1.5 sm:pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => handleCycleCar('prev')}
                  className="p-1 sm:p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all active:scale-95"
                  title="Previous Car Model"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <div>
                  <h2 className="text-xs sm:text-base font-black text-white leading-tight flex items-center gap-1 sm:gap-1.5">
                    {selectedCar.name}
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-slate-950 shrink-0" style={{ backgroundColor: config.color }} />
                  </h2>
                  <span className="text-[8px] sm:text-[9px] font-bold uppercase px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {selectedCar.category}
                  </span>
                </div>
                <button
                  onClick={() => handleCycleCar('next')}
                  className="p-1 sm:p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all active:scale-95"
                  title="Next Car Model"
                >
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
              <div className="text-right">
                <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Top Speed</span>
                <span className="text-xs sm:text-base font-mono font-black text-yellow-400">{totalTopSpeed} <span className="text-[9px] sm:text-[10px] text-slate-400 font-sans font-normal">KM/H</span></span>
              </div>
            </div>

            {/* Quick Paint Color Swatches directly under Title */}
            <div className="hidden sm:block py-2 border-b border-slate-800/80">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5 text-yellow-400" /> SELECT CAR COLOR:
                </span>
                <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20 uppercase font-mono">
                  {BODY_COLOR_PALETTE.find(p => p.hex === config.color)?.name || 'Custom'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {BODY_COLOR_PALETTE.map((p) => (
                  <button
                    key={p.hex}
                    onClick={() => handleColorChange(p.hex)}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 transition-all relative flex items-center justify-center shrink-0 active:scale-90 ${
                      config.color === p.hex
                        ? 'border-yellow-400 scale-110 shadow-md ring-2 ring-yellow-400/40'
                        : 'border-slate-700 hover:border-slate-500 hover:scale-105'
                    }`}
                    style={{ backgroundColor: p.hex }}
                    title={p.name}
                  >
                    {config.color === p.hex && <Check className="w-3.5 h-3.5 text-white drop-shadow animate-fade-in" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Spec Bars (Grid on mobile to save vertical space, Stack on desktop) */}
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 sm:flex sm:flex-col sm:space-y-2.5 text-[9px] sm:text-xs">
              {/* Speed Bar */}
              <div className="min-w-0">
                <div className="flex justify-between font-bold mb-0.5 text-[8.5px] sm:text-xs">
                  <span className="text-slate-400 flex items-center gap-0.5 sm:gap-1 truncate"><Gauge className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400" /> Max Speed</span>
                  <span className="text-slate-200 font-mono">{totalTopSpeed} KM/H</span>
                </div>
                <div className="w-full bg-slate-950 h-1 sm:h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-yellow-500 to-orange-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (totalTopSpeed / 420) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Acceleration Bar */}
              <div className="min-w-0">
                <div className="flex justify-between font-bold mb-0.5 text-[8.5px] sm:text-xs">
                  <span className="text-slate-400 flex items-center gap-0.5 sm:gap-1 truncate"><Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" /> Accel</span>
                  <span className="text-slate-200 font-mono">{totalAccel}s</span>
                </div>
                <div className="w-full bg-slate-950 h-1 sm:h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((4.0 - totalAccel) / 2.5) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Handling Bar */}
              <div className="min-w-0">
                <div className="flex justify-between font-bold mb-0.5 text-[8.5px] sm:text-xs">
                  <span className="text-slate-400 flex items-center gap-0.5 sm:gap-1 truncate"><Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400" /> Handling</span>
                  <span className="text-slate-200 font-mono">{totalHandling}/10</span>
                </div>
                <div className="w-full bg-slate-950 h-1 sm:h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(totalHandling / 10) * 100}%` }}
                  />
                </div>
              </div>

              {/* Nitro Power Bar */}
              <div className="min-w-0">
                <div className="flex justify-between font-bold mb-0.5 text-[8.5px] sm:text-xs">
                  <span className="text-slate-400 flex items-center gap-0.5 sm:gap-1 truncate"><Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-400" /> Nitro</span>
                  <span className="text-slate-200 font-mono">{totalNitro}/10</span>
                </div>
                <div className="w-full bg-slate-950 h-1 sm:h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(totalNitro / 10) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Equip / Purchase Button depending on Ownership */}
            {unlockedCarIds.includes(selectedCar.id) ? (
              <button
                onClick={() => {
                  onSaveConfig(config);
                  onClose();
                }}
                className="w-full mt-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-racing font-bold py-2.5 rounded-xl shadow-lg transition-all active:translate-y-0.5 flex items-center justify-center gap-2 text-xs sm:text-sm tracking-wider cursor-pointer border border-emerald-500/40"
              >
                <Flag className="w-4 h-4 fill-white" />
                EQUIP & RACE NOW
              </button>
            ) : (
              <button
                onClick={() => {
                  if (walletState?.isConnected && walletState.balanceKas >= selectedCar.price) {
                    handleUnlockCar(selectedCar);
                  }
                }}
                disabled={isProcessingTx || !walletState?.isConnected || walletState.balanceKas < selectedCar.price}
                className={`w-full mt-1 font-racing font-bold py-2.5 rounded-xl shadow-lg transition-all active:translate-y-0.5 flex items-center justify-center gap-2 text-xs sm:text-sm tracking-wider cursor-pointer ${
                  walletState?.isConnected && walletState.balanceKas >= selectedCar.price
                    ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                }`}
              >
                {walletState?.isConnected && walletState.balanceKas >= selectedCar.price ? (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    UNLOCK VEHICLE ({selectedCar.price} KAS)
                  </>
                ) : !walletState?.isConnected ? (
                  <>
                    <X className="w-4 h-4 text-rose-500" />
                    WALLET NOT CONNECTED
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 text-rose-500" />
                    INSUFFICIENT KAS
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Customization Tabs & Upgrades Shop (7 cols) */}
        <div className={`lg:col-span-7 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 p-2 sm:p-4 shadow-2xl backdrop-blur-md flex-1 min-h-0 overflow-hidden ${
          mobileView === 'shop' ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Tab Selection Header */}
          <div className="grid grid-cols-3 gap-1 sm:gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-2 sm:mb-4 shrink-0">
            <button
              onClick={() => setActiveTab('cars')}
              className={`py-2 px-1 sm:py-2.5 sm:px-3 rounded-lg font-racing font-bold text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-2 transition-all cursor-pointer ${
                activeTab === 'cars'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Car className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Vehicles</span>
            </button>

            <button
              onClick={() => setActiveTab('upgrades')}
              className={`py-2 px-1 sm:py-2.5 sm:px-3 rounded-lg font-racing font-bold text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-2 transition-all cursor-pointer ${
                activeTab === 'upgrades'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Boosters</span>
            </button>

            <button
              onClick={() => setActiveTab('custom')}
              className={`py-2 px-1 sm:py-2.5 sm:px-3 rounded-lg font-racing font-bold text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-2 transition-all cursor-pointer ${
                activeTab === 'custom'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Paint & Items</span>
            </button>
          </div>

          {/* TAB 1: VEHICLE CATALOGUE */}
          {activeTab === 'cars' && (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                {CAR_CATALOGUE.map((car) => {
                  const isUnlocked = unlockedCarIds.includes(car.id);
                  const isSelected = config.selectedCarId === car.id;

                  return (
                    <div
                      key={car.id}
                      onClick={() => handleSelectCar(car)}
                      className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                        isSelected
                          ? 'bg-slate-800/90 border-yellow-500/90 shadow-lg shadow-yellow-500/10 ring-1 ring-yellow-500'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Car Header info */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <div>
                            <h3 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                              {car.name}
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: car.color }} />
                            </h3>
                            <span className="text-[8px] sm:text-[9px] font-bold uppercase text-slate-400">{car.category}</span>
                          </div>
                          {isSelected ? (
                            <span className="text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-yellow-500 text-black flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> EQUIP
                            </span>
                          ) : isUnlocked ? (
                            <span className="text-[8px] sm:text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              OWNED
                            </span>
                          ) : (
                            <span className="text-[9px] sm:text-[10px] font-mono font-bold text-amber-400 flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              <Coins className="w-3 h-3 text-amber-400" /> {car.price} KAS
                            </span>
                          )}
                        </div>

                        {/* Specs grid */}
                        <div className="grid grid-cols-2 gap-1 text-[9px] sm:text-[10px] bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/80 mb-1.5">
                          <div className="flex justify-between text-slate-400 gap-1">
                            <span className="truncate">Speed:</span>
                            <span className="font-mono font-bold text-white shrink-0">{car.baseSpecs.topSpeed} km/h</span>
                          </div>
                          <div className="flex justify-between text-slate-400 gap-1">
                            <span className="truncate">0-100:</span>
                            <span className="font-mono font-bold text-white shrink-0">{car.baseSpecs.acceleration}s</span>
                          </div>
                        </div>
                      </div>

                      {/* Select/Buy Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isUnlocked) {
                            handleSelectCar(car);
                          } else {
                            handleUnlockCar(car);
                          }
                        }}
                        disabled={isProcessingTx || (!isUnlocked && (!walletState?.isConnected || walletState.balanceKas < car.price))}
                        className={`w-full py-1 sm:py-1.5 rounded-lg font-bold text-[10px] sm:text-xs transition-all flex items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-extrabold'
                            : isUnlocked
                            ? 'bg-slate-800 hover:bg-slate-700 text-white'
                            : walletState?.isConnected && walletState.balanceKas >= car.price
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md font-racing'
                            : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {isProcessingTx ? (
                          'BROADCASTING...'
                        ) : isSelected ? (
                          <>
                            <Check className="w-3 h-3" /> ACTIVE CAR
                          </>
                        ) : isUnlocked ? (
                          'SELECT VEHICLE'
                        ) : walletState?.isConnected && walletState.balanceKas >= car.price ? (
                          <>
                            <ShoppingBag className="w-3 h-3" /> UNLOCK ({car.price} KAS)
                          </>
                        ) : !walletState?.isConnected ? (
                          'CONNECT WALLET'
                        ) : (
                          `NEED ${car.price} KAS`
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PERFORMANCE BOOSTERS & UPGRADES */}
          {activeTab === 'upgrades' && (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {UPGRADE_CATEGORIES.map((cat) => {
                const currentLevel = config.upgrades[cat.id];
                const nextLevelObj = cat.levels[currentLevel + 1];

                return (
                  <div key={cat.id} className="bg-slate-950/70 p-2 sm:p-3 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5 sm:gap-2">
                          {cat.name}
                          <span className="text-[9px] sm:text-[10px] bg-slate-800 text-yellow-400 px-1.5 py-0.5 rounded font-mono font-bold">
                            Stage {currentLevel} / 3
                          </span>
                        </h3>
                      </div>
                    </div>

                    {/* Upgrade Steps List */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 pt-0.5">
                      {cat.levels.slice(1).map((lvl) => {
                        const isPurchased = currentLevel >= lvl.level;
                        const isNext = currentLevel + 1 === lvl.level;
                        const priceKas = lvl.price;

                        return (
                          <div
                            key={lvl.level}
                            className={`p-2 sm:p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 ${
                              isPurchased
                                ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-200'
                                : isNext
                                ? 'bg-slate-900 border-yellow-500/60 text-slate-200'
                                : 'bg-slate-950 border-slate-800 text-slate-500'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-[10px] sm:text-[11px] mb-0.5 flex justify-between gap-1">
                                <span className="truncate">{lvl.name}</span>
                                {isPurchased && <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />}
                              </div>
                              <span className="text-[9px] sm:text-[10px] text-slate-400 block mb-1">{lvl.bonusText}</span>
                            </div>

                            {isPurchased ? (
                              <span className="text-[9px] sm:text-[10px] font-bold text-emerald-400 uppercase text-center block py-1 bg-emerald-500/10 rounded">
                                INSTALLED
                              </span>
                            ) : isNext ? (
                              <button
                                onClick={() => handleBuyUpgrade(cat.id, lvl.level, lvl.price, lvl.name)}
                                disabled={isProcessingTx || !walletState?.isConnected || walletState.balanceKas < lvl.price}
                                className={`w-full py-1 sm:py-1.5 rounded font-bold text-[10px] sm:text-[11px] flex items-center justify-center gap-1 transition-all ${
                                  walletState?.isConnected && walletState.balanceKas >= lvl.price
                                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                {isProcessingTx ? 'BROADCASTING...' : !walletState?.isConnected ? 'CONNECT WALLET' : `UPGRADE (${priceKas} KAS)`}
                              </button>
                            ) : (
                              <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase text-center block py-1">
                                Stage {lvl.level} Locked
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: PAINT & COSMETIC ITEMS */}
          {activeTab === 'custom' && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Body Colors */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 mb-2.5">
                  Body Paint Color
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {BODY_COLOR_PALETTE.map((p) => (
                    <button
                      key={p.hex}
                      onClick={() => handleColorChange(p.hex)}
                      className={`h-10 rounded-lg border-2 transition-all relative flex items-center justify-center ${
                        config.color === p.hex
                          ? 'border-yellow-400 scale-105 shadow-md shadow-yellow-500/20 ring-2 ring-yellow-400/50'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={p.name}
                    >
                      {config.color === p.hex && <Check className="w-4 h-4 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Underglow Neon Lights */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 mb-2.5">
                  Underglow Neon Kit
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {UNDERGLOW_COLORS.map((u) => (
                    <button
                      key={u.hex}
                      onClick={() => handleUnderglowChange(u.hex)}
                      className={`p-2.5 rounded-lg border text-xs font-bold flex items-center gap-2 transition-all ${
                        config.cosmetics.underglowColor === u.hex
                          ? 'bg-slate-800 border-cyan-400 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-full border border-slate-600 shadow"
                        style={{ backgroundColor: u.hex === 'transparent' ? '#334155' : u.hex }}
                      />
                      <span>{u.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Spoiler Wings */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 mb-2.5">
                  Rear Spoiler Wing
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SPOILER_TYPES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSpoilerChange(s.id)}
                      className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                        config.cosmetics.spoilerType === s.id
                          ? 'bg-slate-800 border-yellow-400 text-yellow-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tire Smoke Trail */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 mb-2.5">
                  Drift Tire Smoke Color
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {TIRE_SMOKE_COLORS.map((sm) => (
                    <button
                      key={sm.hex}
                      onClick={() => handleSmokeChange(sm.hex)}
                      className={`p-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                        config.cosmetics.smokeColor === sm.hex
                          ? 'bg-slate-800 border-purple-400 text-purple-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: sm.hex }} />
                      <span className="truncate">{sm.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
