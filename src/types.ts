/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZKStateProof } from './services/zkVerifier';

export interface UpgradesState {
  engine: number; // level 0 - 3
  nos: number; // level 0 - 3
  tires: number; // level 0 - 3
  chassis: number; // level 0 - 3
}

export interface CosmeticsState {
  underglowColor: string;
  smokeColor: string;
  spoilerType: string;
}

export interface CarConfig {
  selectedCarId: string;
  color: string;
  upgrades: UpgradesState;
  cosmetics: CosmeticsState;
}

export type Player = {
  id: string;
  x?: number;
  y?: number;
  angle?: number;
  color: string;
  name: string;
  speed?: number;
  laps?: number;
  bestLapTime?: number;
  nitro?: number;
  drifting?: boolean;
  isCrashed?: boolean;
  carConfig?: CarConfig;
  isHost?: boolean;
  zkProof?: ZKStateProof;
  isReady?: boolean;
  paid?: boolean;
};
