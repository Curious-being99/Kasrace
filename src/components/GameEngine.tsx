/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { socket } from '../services/socket';
import { initializeP2P, connectToPeer, broadcast, getActivePeers, subscribeToP2PChanges } from '../services/p2p';
import { verifyMovementProof, generateMovementProof } from '../services/zkVerifier';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Environment, Text, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Player, CarConfig } from '../types';
import { Trophy, Zap, Sparkles, Smartphone, Monitor, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Flag, Volume2, VolumeX, Gauge, Activity, Wrench, Menu, Settings, LogOut, X, RotateCcw, Music } from 'lucide-react';
import GarageView from './GarageView';
import { CAR_CATALOGUE, UPGRADE_CATEGORIES } from '../data/cars';

// Web Audio API Lightweight 4D Synthesizer Engine
class EngineAudioSynth {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;
  private turboGain: GainNode | null = null;
  private mainGain: GainNode | null = null;
  public enabled = false;
  public engineEnabled = true;
  public musicEnabled = true;
  public isScreeching = false;
  private musicAudio: HTMLAudioElement | null = null;

  init() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) {
        this.ctx = new AudioCtx();

        // Exhaust resonance filter
        this.exhaustFilter = this.ctx.createBiquadFilter();
        this.exhaustFilter.type = 'lowpass';
        this.exhaustFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

        // Osc 1 (Throaty Sawtooth)
        this.osc1 = this.ctx.createOscillator();
        this.osc1.type = 'sawtooth';

        // Osc 2 (Detuned Sawtooth for authentic chorus/vibration)
        this.osc2 = this.ctx.createOscillator();
        this.osc2.type = 'sawtooth';
        this.osc2.detune.setValueAtTime(10, this.ctx.currentTime);

        // Sub Osc (Triangle for heavy exhaust thud and rumble)
        this.subOsc = this.ctx.createOscillator();
        this.subOsc.type = 'triangle';

        // Turbo/Supercharger whistle (High Sine)
        this.turboOsc = this.ctx.createOscillator();
        this.turboOsc.type = 'sine';

        this.turboGain = this.ctx.createGain();
        this.turboGain.gain.setValueAtTime(0, this.ctx.currentTime);

        // Main output control
        this.mainGain = this.ctx.createGain();
        this.mainGain.gain.setValueAtTime(0, this.ctx.currentTime);

        // Routing
        this.osc1.connect(this.exhaustFilter);
        this.osc2.connect(this.exhaustFilter);
        this.subOsc.connect(this.exhaustFilter);
        
        this.turboOsc.connect(this.turboGain);
        this.turboGain.connect(this.mainGain);

        this.exhaustFilter.connect(this.mainGain);
        this.mainGain.connect(this.ctx.destination);

        // Start sound generators
        this.osc1.start();
        this.osc2.start();
        this.subOsc.start();
        this.turboOsc.start();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.enabled = true;
      if (this.musicEnabled) {
        this.playMusic();
      }
    } catch {
      // Audio fallback
    }
  }

  setEngineEnabled(val: boolean) {
    this.engineEnabled = val;
    if (!val && this.mainGain && this.ctx) {
      this.mainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  setMusicEnabled(val: boolean) {
    this.musicEnabled = val;
    if (val) {
      this.playMusic();
    } else {
      this.stopMusic();
    }
  }

  toggleCombo(val: boolean) {
    this.enabled = val;
    this.engineEnabled = val;
    this.musicEnabled = val;
    if (val) {
      this.init();
      this.playMusic();
    } else {
      this.stop();
    }
  }

  update(speedRatio: number, isNitro: boolean, isGasActive: boolean, isBrakeActive: boolean, isTurning: boolean) {
    if (!this.enabled || !this.ctx || !this.mainGain || !this.turboGain || !this.exhaustFilter) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.musicEnabled && this.musicAudio && this.musicAudio.paused) {
      this.musicAudio.play().catch(() => {});
    }

    if (!this.engineEnabled || !this.osc1 || !this.osc2 || !this.subOsc || !this.turboOsc) {
      this.mainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    const now = this.ctx.currentTime;

    // Realistic gear ratios & RPM curve simulation
    let gear = 1;
    let rpm = 0.2;
    const speed = speedRatio;
    
    if (speed < 0.15) {
      gear = 1;
      rpm = 0.22 + (speed / 0.15) * 0.78;
    } else if (speed < 0.35) {
      gear = 2;
      rpm = 0.32 + ((speed - 0.15) / 0.20) * 0.68;
    } else if (speed < 0.60) {
      gear = 3;
      rpm = 0.38 + ((speed - 0.35) / 0.25) * 0.62;
    } else if (speed < 0.82) {
      gear = 4;
      rpm = 0.42 + ((speed - 0.60) / 0.22) * 0.58;
    } else {
      gear = 5;
      rpm = 0.48 + ((speed - 0.82) / 0.18) * 0.52;
    }

    // Boost RPM slightly under load/revving
    if (isGasActive) {
      rpm = Math.min(1.0, rpm + 0.08);
    }
    if (isNitro) {
      rpm = Math.min(1.0, rpm + 0.15);
    }

    // Pitch mapping: base idle frequency is ~32Hz, redline is ~165Hz
    const baseFreq = 30 + (rpm * 135);
    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.015, now, 0.06);
    this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.06);

    // Dynamic lowpass resonance filter tracks engine speed
    const filterCutoff = 170 + (rpm * 750) + (isGasActive ? 200 : 0);
    this.exhaustFilter.frequency.setTargetAtTime(filterCutoff, now, 0.08);

    // Turbo whistle tracks RPM and load
    const turboFreq = 650 + (rpm * 1350);
    this.turboOsc.frequency.setTargetAtTime(turboFreq, now, 0.05);

    const turboVolume = isGasActive ? (0.008 + rpm * 0.035 + (isNitro ? 0.055 : 0)) : 0;
    this.turboGain.gain.setTargetAtTime(turboVolume, now, 0.08);

    // Master volume mix (Idle rumble when static, screaming when fully floored)
    let masterVolume = 0.065; // Idle rumble
    if (isGasActive) {
      masterVolume = 0.15 + (speedRatio * 0.07) + (isNitro ? 0.05 : 0);
    } else if (isBrakeActive) {
      masterVolume = 0.10; // Exhaust popping / engine drag
    }

    this.mainGain.gain.setTargetAtTime(masterVolume, now, 0.08);

    // Drift Screech control
    if (isTurning && speedRatio > 0.28) {
      if (!this.isScreeching) {
        this.playScreech();
        this.isScreeching = true;
      }
    } else {
      this.isScreeching = false;
    }
  }

  stop() {
    if (this.mainGain && this.ctx) {
      this.mainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    this.stopMusic();
    this.enabled = false;
  }

  stopMusic() {
    if (this.musicAudio) {
      this.musicAudio.pause();
    }
  }

  playMusic() {
    if (!this.enabled || !this.musicEnabled) return;
    try {
      if (!this.musicAudio) {
        this.musicAudio = new Audio(window.location.origin + '/racing_music.mp3');
        this.musicAudio.loop = true;
        this.musicAudio.volume = 0.5;
        this.musicAudio.addEventListener('error', () => {
          if (this.musicAudio) {
            const currentSrc = this.musicAudio.src;
            if (currentSrc.includes('/racing_music.mp3')) {
              console.log('GameEngine music fallback to /new_racing_music.mp3');
              this.musicAudio.src = window.location.origin + '/new_racing_music.mp3';
              this.musicAudio.play().catch(() => {});
            } else if (currentSrc.includes('/new_racing_music.mp3')) {
              console.log('GameEngine music fallback to /api/music');
              this.musicAudio.src = window.location.origin + '/api/music';
              this.musicAudio.play().catch(() => {});
            }
          }
        });
      }
      if (this.musicAudio.paused) {
        this.musicAudio.play().catch((err) => {
          console.warn('GameEngine music playback blocked or failed, trying fallback:', err);
          if (this.musicAudio) {
            const currentSrc = this.musicAudio.src;
            if (currentSrc.includes('/racing_music.mp3')) {
              this.musicAudio.src = window.location.origin + '/new_racing_music.mp3';
              this.musicAudio.play().catch(() => {});
            } else if (currentSrc.includes('/new_racing_music.mp3')) {
              this.musicAudio.src = window.location.origin + '/api/music';
              this.musicAudio.play().catch(() => {});
            }
          }
        });
      }
    } catch {
      // Graceful audio fallback
    }
  }

  playScreech() {
    // Disabled as requested to remove noise
    return;
  }

  playCrash() {
    // Disabled as requested to remove noise
    return;
  }

  playThud() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(140, now);
      thudOsc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
      thudGain.gain.setValueAtTime(0.35, now);
      thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      thudOsc.connect(thudGain);
      thudGain.connect(this.ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.2);
    } catch {
      // Audio fallback
    }
  }
}

const engineAudio = new EngineAudioSynth();

// Shared Geometries and Materials for performance optimization (Prevents WebGL context loss)
const BOX_GEOM = new THREE.BoxGeometry(1, 1, 1);
const SPHERE_GEOM = new THREE.SphereGeometry(1, 12, 12);
const PLANE_GEOM = new THREE.PlaneGeometry(1, 1);
const CONE_GEOM = new THREE.ConeGeometry(1, 1, 8);
const CYLINDER_GEOM = new THREE.CylinderGeometry(1, 1, 1, 8);
const DODECAHEDRON_GEOM = new THREE.DodecahedronGeometry(1, 0);

const BLACK_MAT = new THREE.MeshBasicMaterial({ color: '#000000' });
const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: '#f1f5f9', transparent: true });

const TRACK_WIDTH = 1200;
const TRACK_HEIGHT = 850;

// Car physics constants (Upgraded for high-speed, responsive, advanced turbo racing)
const ACCELERATION = 0.35;
const MAX_SPEED = 12.0;
const NITRO_SPEED = 18.5;
const NITRO_ACCEL = 0.75;
const FRICTION = 0.988;
const TURN_SPEED = 0.075;

// Track Geometry
const TRACK_RADIUS = 50; // Standard track width radius
const TRACK_SEGMENTS = [
    { start: {x: 150, y: 500}, end: {x: 450, y: 500}, angle: 0 },
    { start: {x: 450, y: 500}, end: {x: 450, y: 300}, angle: -Math.PI/2 },
    { start: {x: 450, y: 300}, end: {x: 300, y: 300}, angle: Math.PI },
    { start: {x: 300, y: 300}, end: {x: 300, y: 100}, angle: -Math.PI/2 },
    { start: {x: 300, y: 100}, end: {x: 750, y: 100}, angle: 0 },
    { start: {x: 750, y: 100}, end: {x: 750, y: 400}, angle: Math.PI/2 },
    { start: {x: 750, y: 400}, end: {x: 600, y: 400}, angle: Math.PI },
    { start: {x: 600, y: 400}, end: {x: 600, y: 600}, angle: Math.PI/2 },
    { start: {x: 600, y: 600}, end: {x: 950, y: 600}, angle: 0 },
    { start: {x: 950, y: 600}, end: {x: 950, y: 150}, angle: -Math.PI/2 },
    { start: {x: 950, y: 150}, end: {x: 1100, y: 150}, angle: 0 },
    { start: {x: 1100, y: 150}, end: {x: 1100, y: 750}, angle: Math.PI/2 },
    { start: {x: 1100, y: 750}, end: {x: 150, y: 750}, angle: Math.PI },
    { start: {x: 150, y: 750}, end: {x: 150, y: 500}, angle: -Math.PI/2 }
];

// Math helpers for collision
function getClosestPointOnSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return v;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
}

function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

function distToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

const isPointOnTrackMath = (x: number, y: number, buffer: number = 0): boolean => {
  const p = {x, y};
  let minDist = Infinity;
  
  for (const seg of TRACK_SEGMENTS) {
    const d = distToSegment(p, seg.start, seg.end);
    if (d < minDist) minDist = d;
  }

  return minDist <= (TRACK_RADIUS + buffer);
};

export const STREET_LAMPS: { pos: [number, number, number], rot: number }[] = [];

const generateSceneryDecorations = () => {
  const items: { type: 'tree' | 'rock', pos: [number, number, number], scale: number }[] = [];
  const count = 350;
  const seed = 42;
  const rng = (s: number) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
  };
  let s = seed;

  for (let i = 0; i < count; i++) {
    const x = rng(s++) * 2400 - 800; 
    const z = rng(s++) * 2200 - 800;
    
    if (!isPointOnTrackMath(x, z, 20)) {
      const type = rng(s++) > 0.4 ? 'tree' : 'rock';
      const scale = type === 'tree' ? 2.5 + rng(s++) * 3.5 : 3 + rng(s++) * 5;
      items.push({ type, pos: [x, 0, z], scale });
    }
  }
  return items;
};

export const SCENERY_DECORATIONS = generateSceneryDecorations();

export const ARCH_PILLARS = [
  { x: 625, z: 805, radius: 2.0 },
  { x: 625, z: 695, radius: 2.0 },
];

// 3D Supercar Model (Detailed Realistic Hypercar with Dynamic Custom Designs)
export const CarModel = ({ 
  color, 
  isLocal, 
  drifting, 
  isCrashed, 
  carConfig, 
  scale = 3.2,
  steeringAngle = 0,
  pitch = 0,
  roll = 0,
  speed = 0,
  localPlayerRef,
}: { 
  color: string, 
  isLocal?: boolean, 
  drifting?: boolean, 
  isCrashed?: boolean, 
  carConfig?: CarConfig, 
  scale?: number,
  steeringAngle?: number,
  pitch?: number,
  roll?: number,
  speed?: number,
  localPlayerRef?: React.MutableRefObject<any>,
}) => {
  const activeColor = isCrashed ? '#1c1917' : (carConfig?.color || color || '#3b82f6');
  const underglow = carConfig?.cosmetics?.underglowColor || 'transparent';
  const spoiler = carConfig?.cosmetics?.spoilerType || 'gt_wing';
  const carId = carConfig?.selectedCarId || 'viper';

  const smokeMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeDataRef = useRef<Array<{ active: boolean; pos: [number, number, number]; size: number; opacity: number }>>(
    Array.from({ length: 8 }, () => ({ active: false, pos: [0, 0, 0], size: 0.1, opacity: 0 }))
  );

  const steerWheelRefs = useRef<(THREE.Group | null)[]>([]);
  const spinWheelRefs = useRef<(THREE.Group | null)[]>([]);
  const rollAngleRef = useRef(0);

  useFrame((state, delta) => {
    let activeSpeed = speed || 0;
    let activeSteering = steeringAngle || 0;

    if (isLocal && localPlayerRef?.current) {
      activeSpeed = localPlayerRef.current.speed || 0;
      activeSteering = localPlayerRef.current.steeringAngle || 0;
    }

    const isMoving = Math.abs(activeSpeed) > 0.05;
    for (let i = 0; i < smokeDataRef.current.length; i++) {
      const p = smokeDataRef.current[i];
      if (p.active) {
        p.pos[0] += (Math.random() - 0.5) * 0.1 * delta;
        p.pos[1] += (0.3 + Math.abs(activeSpeed) * 0.2) * delta;
        p.pos[2] -= (1.0 + Math.abs(activeSpeed) * 12.0) * delta;
        p.size += 0.4 * delta;
        p.opacity -= 1.2 * delta;

        if (p.opacity <= 0) {
          p.active = false;
        }
      } else if (isMoving && Math.random() < 0.25) {
        p.active = true;
        p.pos = [i % 2 === 0 ? -0.4 : 0.4, 0.3, -2.2];
        p.size = 0.1;
        p.opacity = 0.22;
      }

      const mesh = smokeMeshRefs.current[i];
      if (mesh) {
        if (p.active) {
          mesh.visible = true;
          mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
          mesh.scale.set(p.size, p.size, p.size);
          (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.opacity);
        } else {
          mesh.visible = false;
        }
      }
    }

    // Accumulate wheel spin angle based on speed and frame delta
    rollAngleRef.current = (rollAngleRef.current + activeSpeed * 4.5 * delta) % (Math.PI * 2);

    const steerRot = -(activeSteering / 360) * 0.55;

    for (let i = 0; i < 4; i++) {
      if (i < 2) {
        const steerGroup = steerWheelRefs.current[i];
        if (steerGroup) {
          steerGroup.rotation.y = steerRot;
        }
      }
      const spinGroup = spinWheelRefs.current[i];
      if (spinGroup) {
        spinGroup.rotation.x = rollAngleRef.current;
      }
    }
  });

  // Real-time wheel spin angle proportional to car movement
  const wheelSpinAngle = (Date.now() * 0.018 * speed) % (Math.PI * 2);

  return (
    <group scale={[scale, scale, scale]} rotation={[pitch, 0, roll]}>
      {/* Light Exhaust Air Smoke Particles */}
      <group>
        {smokeDataRef.current.map((_, i) => (
          <mesh key={i} ref={el => { smokeMeshRefs.current[i] = el; }} geometry={SPHERE_GEOM} visible={false}>
            <meshBasicMaterial color="#f1f5f9" transparent opacity={0} />
          </mesh>
        ))}
      </group>

      {/* 3D Burning Wreck Fire & Smoke */}
      {isCrashed && (
        <group position={[0, 0.6, 0.3]}>
          <mesh position={[0, 0.8, 0.2]}>
            <coneGeometry args={[0.9, 2.2, 12]} />
            <meshBasicMaterial color="#f97316" />
          </mesh>
          <mesh position={[0.35, 1.2, -0.2]}>
            <coneGeometry args={[0.7, 1.8, 10]} />
            <meshBasicMaterial color="#eab308" />
          </mesh>
          <mesh position={[-0.35, 1.0, 0.4]}>
            <coneGeometry args={[0.65, 1.5, 10]} />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
          {/* Billowing Dark Smoke Clouds */}
          <mesh position={[0, 2.2, 0.1]}>
            <sphereGeometry args={[1.2, 10, 10]} />
            <meshStandardMaterial color="#1e293b" transparent opacity={0.85} />
          </mesh>
          <mesh position={[0.5, 3.2, -0.3]}>
            <sphereGeometry args={[1.6, 10, 10]} />
            <meshStandardMaterial color="#0f172a" transparent opacity={0.65} />
          </mesh>
        </group>
      )}

      {/* 4 Dedicated Tire Ground Contact Shadows (Locking tires directly onto asphalt ground) */}
      {[
        [1.18, 0.002, 1.3],
        [-1.18, 0.002, 1.3],
        [1.18, 0.002, -1.3],
        [-1.18, 0.002, -1.3],
      ].map((shadowPos, idx) => (
        <mesh key={`shadow-${idx}`} position={shadowPos as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]} geometry={PLANE_GEOM} scale={[0.55, 0.95, 1]}>
          <meshBasicMaterial color="#000000" transparent opacity={0.88} />
        </mesh>
      ))}
      {/* Soft Ambient Contact Shadow under Car Body */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={PLANE_GEOM} scale={[2.8, 4.6, 1]}>
        <meshBasicMaterial color="#020617" transparent opacity={0.5} />
      </mesh>

      {/* --- UNIQUE 3D CAR DESIGN SWITCHER --- */}
      {carId === 'viper' && (
        <>
          {/* Viper GT: Classic aggressive sports car lines with dual racing stripes */}
          {/* Front Carbon Fiber Splitter */}
          <mesh position={[0, 0.15, 2.25]} castShadow>
            <boxGeometry args={[2.4, 0.08, 0.5]} />
            <meshStandardMaterial color="#020617" metalness={0.95} roughness={0.1} />
          </mesh>

          {/* Front Bumper Air Intake Grille */}
          <mesh position={[0, 0.35, 2.15]}>
            <boxGeometry args={[2.0, 0.3, 0.15]} />
            <meshStandardMaterial color="#020617" metalness={0.8} roughness={0.5} />
          </mesh>

          {/* Main Low-Profile Hypercar Chassis */}
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.3, 0.55, 4.3]} />
            <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
          </mesh>

          {/* Slanted Aerodynamic Hood Nose */}
          <mesh position={[0, 0.62, 1.3]} rotation={[-0.12, 0, 0]} castShadow>
            <boxGeometry args={[2.0, 0.22, 1.8]} />
            <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
          </mesh>

          {/* Hood Carbon Air Vents */}
          <mesh position={[0.5, 0.73, 1.1]} rotation={[-0.12, 0, 0]}>
            <boxGeometry args={[0.35, 0.04, 0.6]} />
            <meshStandardMaterial color="#020617" metalness={0.9} />
          </mesh>
          <mesh position={[-0.5, 0.73, 1.1]} rotation={[-0.12, 0, 0]}>
            <boxGeometry args={[0.35, 0.04, 0.6]} />
            <meshStandardMaterial color="#020617" metalness={0.9} />
          </mesh>

          {/* Sculpted Side Skirts */}
          <mesh position={[1.2, 0.3, 0]} castShadow>
            <boxGeometry args={[0.18, 0.28, 3.4]} />
            <meshStandardMaterial color="#020617" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[-1.2, 0.3, 0]} castShadow>
            <boxGeometry args={[0.18, 0.28, 3.4]} />
            <meshStandardMaterial color="#020617" metalness={0.9} roughness={0.2} />
          </mesh>

          {/* Sleek Aerodynamic Roof Cabin */}
          <mesh position={[0, 1.0, -0.3]} rotation={[-0.15, 0, 0]} castShadow>
            <boxGeometry args={[1.75, 0.55, 2.2]} />
            <meshStandardMaterial color="#020617" metalness={0.95} roughness={0.05} transparent opacity={0.92} />
          </mesh>

          {/* Front Windshield Frame Pillars */}
          <mesh position={[0.82, 0.95, 0.4]} rotation={[-0.4, 0, 0.15]}>
            <boxGeometry args={[0.08, 0.5, 1.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.8} />
          </mesh>
          <mesh position={[-0.82, 0.95, 0.4]} rotation={[-0.4, 0, -0.15]}>
            <boxGeometry args={[0.08, 0.5, 1.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.8} />
          </mesh>

          {/* Dual Center Racing Stripe */}
          <mesh position={[0, 0.79, 0.1]}>
            <boxGeometry args={[0.45, 0.02, 4.0]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.2} />
          </mesh>

          {/* Aggressive LED Headlight Eyebrows */}
          <mesh position={[0.75, 0.58, 2.14]} rotation={[0, 0.1, 0]}>
            <boxGeometry args={[0.55, 0.12, 0.12]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={4} />
          </mesh>
          <mesh position={[-0.75, 0.58, 2.14]} rotation={[0, -0.1, 0]}>
            <boxGeometry args={[0.55, 0.12, 0.12]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={4} />
          </mesh>

          {/* Continuous Rear LED Tail-Light Bar with individual real bulb array */}
          <group position={[0, 0.58, -2.16]}>
            {/* Outer Clear Red Glass Cover */}
            <mesh>
              <boxGeometry args={[2.2, 0.12, 0.1]} />
              <meshStandardMaterial color="#ef4444" transparent opacity={0.35} roughness={0.02} metalness={0.9} />
            </mesh>
            {/* Back Housing Plate */}
            <mesh position={[0, 0, -0.04]}>
              <boxGeometry args={[2.18, 0.1, 0.02]} />
              <meshStandardMaterial color="#0b0f19" metalness={0.9} />
            </mesh>
            {/* Array of 10 glowing real LED bulbs inside */}
            {[-0.95, -0.74, -0.53, -0.32, -0.11, 0.11, 0.32, 0.53, 0.74, 0.95].map((x, idx) => (
              <group key={idx} position={[x, 0, -0.02]}>
                {/* Silver base */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.025, 0.025, 0.03, 8]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.1} />
                </mesh>
                {/* Glowing Red Bulb Sphere */}
                <mesh position={[0, 0, 0.02]}>
                  <sphereGeometry args={[0.03, 12, 12]} />
                  <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={6} />
                </mesh>
                {/* Hot yellow center filament */}
                <mesh position={[0, 0, 0.02]}>
                  <sphereGeometry args={[0.01, 8, 8]} />
                  <meshBasicMaterial color="#fef08a" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Quad Rear Exhaust Pipes */}
          <group position={[0, 0.32, -2.18]}>
            {[0.5, 0.32, -0.32, -0.5].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.08, 0.08, 0.2, 12]} />
                  <meshStandardMaterial color="#94a3b8" metalness={0.95} />
                </mesh>
                <mesh position={[0, -0.098, 0]}>
                  <cylinderGeometry args={[0.062, 0.062, 0.01, 12]} />
                  <meshBasicMaterial color="#000000" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Detailed left/right physical doors */}
          <group position={[-1.16, 0.55, 0]}>
            {/* Left Door Panel with aerodynamic cutout */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.45, 1.35]} />
              <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Panel gap outlining seam */}
            <mesh position={[-0.01, 0, 0]}>
              <boxGeometry args={[0.045, 0.47, 1.37]} />
              <meshStandardMaterial color="#020617" roughness={1} />
            </mesh>
            {/* Chrome/Steel grab handle */}
            <mesh position={[-0.03, 0.12, -0.45]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.02, 0.03, 0.18]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.99} roughness={0.05} />
            </mesh>
          </group>
          <group position={[1.16, 0.55, 0]}>
            {/* Right Door Panel with aerodynamic cutout */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.45, 1.35]} />
              <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Panel gap outlining seam */}
            <mesh position={[0.01, 0, 0]}>
              <boxGeometry args={[0.045, 0.47, 1.37]} />
              <meshStandardMaterial color="#020617" roughness={1} />
            </mesh>
            {/* Chrome/Steel grab handle */}
            <mesh position={[0.03, 0.12, -0.45]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.02, 0.03, 0.18]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.99} roughness={0.05} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'phantom' && (
        <>
          {/* Phantom GT: Low-slung Widebody Tuner with intercooler */}
          {/* Aggressive JDM front bumper lip */}
          <mesh position={[0, 0.22, 2.22]} castShadow>
            <boxGeometry args={[2.45, 0.15, 0.45]} />
            <meshStandardMaterial color="#0b1329" metalness={0.95} />
          </mesh>

          {/* Polished Front Intercooler Core */}
          <mesh position={[0, 0.32, 2.2]} rotation={[0, 0, 0]}>
            <boxGeometry args={[1.4, 0.28, 0.15]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.98} roughness={0.1} />
          </mesh>

          {/* Widebody Lower Stance Chassis */}
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.42, 0.48, 4.15]} />
            <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
          </mesh>

          {/* Sport Tuner Vent Hood */}
          <mesh position={[0, 0.56, 1.25]} rotation={[-0.08, 0, 0]} castShadow>
            <boxGeometry args={[2.15, 0.18, 1.7]} />
            <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Carbon hood vent */}
          <mesh position={[0, 0.66, 1.0]}>
            <boxGeometry args={[0.95, 0.02, 0.6]} />
            <meshStandardMaterial color="#020617" metalness={0.92} />
          </mesh>

          {/* Bolt-on fender arches */}
          <mesh position={[1.23, 0.45, 1.15]} castShadow>
            <boxGeometry args={[0.15, 0.42, 1.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.85} />
          </mesh>
          <mesh position={[-1.23, 0.45, 1.15]} castShadow>
            <boxGeometry args={[0.15, 0.42, 1.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.85} />
          </mesh>
          <mesh position={[1.23, 0.45, -1.15]} castShadow>
            <boxGeometry args={[0.15, 0.42, 1.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.85} />
          </mesh>
          <mesh position={[-1.23, 0.45, -1.15]} castShadow>
            <boxGeometry args={[0.15, 0.42, 1.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.85} />
          </mesh>

          {/* JDM Tuner Cabin */}
          <mesh position={[0, 0.94, -0.22]} rotation={[-0.1, 0, 0]} castShadow>
            <boxGeometry args={[1.82, 0.5, 2.0]} />
            <meshStandardMaterial color="#020617" metalness={0.95} roughness={0.05} transparent opacity={0.9} />
          </mesh>

          {/* Slanted Xenon Tuner Headlights */}
          <mesh position={[0.82, 0.48, 2.12]} rotation={[0.08, 0.15, -0.05]}>
            <boxGeometry args={[0.42, 0.14, 0.1]} />
            <meshStandardMaterial color="#ffffff" emissive="#e2e8f0" emissiveIntensity={3} />
          </mesh>
          <mesh position={[-0.82, 0.48, 2.12]} rotation={[0.08, -0.15, 0.05]}>
            <boxGeometry args={[0.42, 0.14, 0.1]} />
            <meshStandardMaterial color="#ffffff" emissive="#e2e8f0" emissiveIntensity={3} />
          </mesh>

          {/* Real dual-bulb circular tail-lights */}
          <group position={[0, 0.54, -2.12]}>
            {[0.7, 0.45, -0.45, -0.7].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]}>
                {/* Deep Chrome Housing Cup */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.14, 0.14, 0.06, 16]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.95} roughness={0.1} />
                </mesh>
                <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.12, 0.12, 0.02, 16]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={1.0} roughness={0.05} />
                </mesh>
                {/* Glowing red bulb sphere */}
                <mesh position={[0, 0, 0.02]}>
                  <sphereGeometry args={[0.065, 16, 16]} />
                  <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={6} roughness={0.1} />
                </mesh>
                {/* Center yellow hot filament */}
                <mesh position={[0, 0, 0.02]}>
                  <sphereGeometry args={[0.015, 8, 8]} />
                  <meshBasicMaterial color="#fef08a" />
                </mesh>
                {/* Outer clear transparent lens */}
                <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.13, 0.13, 0.01, 16]} />
                  <meshStandardMaterial color="#ef4444" transparent opacity={0.35} roughness={0.01} metalness={0.9} />
                </mesh>
              </group>
            ))}
          </group>

          {/* Massive Titanium Cannons Exhaust */}
          <group position={[0, 0.28, -2.12]}>
            <group position={[0.82, 0, -0.1]} rotation={[Math.PI / 2, 0, 0.12]}>
              <mesh>
                <cylinderGeometry args={[0.15, 0.15, 0.4, 12]} />
                <meshStandardMaterial color="#38bdf8" metalness={0.98} roughness={0.05} />
              </mesh>
              <mesh position={[0, -0.198, 0]}>
                <cylinderGeometry args={[0.115, 0.115, 0.01, 12]} />
                <meshBasicMaterial color="#000000" />
              </mesh>
            </group>
            <group position={[-0.82, 0, -0.1]} rotation={[Math.PI / 2, 0, -0.12]}>
              <mesh>
                <cylinderGeometry args={[0.15, 0.15, 0.4, 12]} />
                <meshStandardMaterial color="#38bdf8" metalness={0.98} roughness={0.05} />
              </mesh>
              <mesh position={[0, -0.198, 0]}>
                <cylinderGeometry args={[0.115, 0.115, 0.01, 12]} />
                <meshBasicMaterial color="#000000" />
              </mesh>
            </group>
          </group>

          {/* Detailed premium coach (suicide-style) doors */}
          <group position={[-1.22, 0.44, 0]}>
            {/* Left Door Panel */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.42, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Panel gap outlining seam */}
            <mesh position={[-0.01, 0, 0]}>
              <boxGeometry args={[0.045, 0.44, 1.32]} />
              <meshStandardMaterial color="#020617" roughness={1} />
            </mesh>
            {/* Chrome/Steel suicide coach grab handle (mounted near front edge since coach door opens rearward) */}
            <mesh position={[-0.03, 0.08, 0.45]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.02, 0.03, 0.18]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.99} roughness={0.05} />
            </mesh>
          </group>
          <group position={[1.22, 0.44, 0]}>
            {/* Right Door Panel */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.42, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Panel gap outlining seam */}
            <mesh position={[0.01, 0, 0]}>
              <boxGeometry args={[0.045, 0.44, 1.32]} />
              <meshStandardMaterial color="#020617" roughness={1} />
            </mesh>
            {/* Chrome/Steel suicide coach grab handle */}
            <mesh position={[0.03, 0.08, 0.45]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.02, 0.03, 0.18]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.99} roughness={0.05} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'cyber_razor' && (
        <>
          {/* Cyber Razor: Purely polygonal futuristic wedge with glowing laser lines */}
          {/* Front wedge edge */}
          <mesh position={[0, 0.25, 2.05]} rotation={[-0.38, 0, 0]} castShadow>
            <boxGeometry args={[2.3, 0.16, 0.85]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.08} />
          </mesh>

          {/* Angular Main Hull */}
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.32, 0.44, 4.4]} />
            <meshStandardMaterial color="#0f172a" metalness={0.98} roughness={0.05} />
          </mesh>

          {/* Low Poly Sharp Cockpit Canopy */}
          <mesh position={[0, 0.86, -0.35]} rotation={[-0.34, 0, 0]} castShadow>
            <boxGeometry args={[1.58, 0.54, 2.35]} />
            <meshStandardMaterial color={activeColor} metalness={0.99} roughness={0.08} transparent opacity={0.75} />
          </mesh>

          {/* Cyan Laser Headlight Ribbon */}
          <mesh position={[0, 0.38, 2.25]}>
            <boxGeometry args={[2.25, 0.06, 0.06]} />
            <meshStandardMaterial color="#00f5ff" emissive="#10b981" emissiveIntensity={5} />
          </mesh>

          {/* Lateral Neon Strips */}
          <mesh position={[1.16, 0.45, 0]}>
            <boxGeometry args={[0.02, 0.14, 3.4]} />
            <meshBasicMaterial color="#10b981" />
          </mesh>
          <mesh position={[-1.16, 0.45, 0]}>
            <boxGeometry args={[0.02, 0.14, 3.4]} />
            <meshBasicMaterial color="#10b981" />
          </mesh>

          {/* High-tech Cyber Pink LED bulb cluster bar */}
          <group position={[0, 0.46, -2.23]}>
            {/* Dark backing chamber */}
            <mesh>
              <boxGeometry args={[2.25, 0.06, 0.06]} />
              <meshStandardMaterial color="#1e1b4b" metalness={0.9} />
            </mesh>
            {/* Casing glass */}
            <mesh position={[0, 0, 0.02]}>
              <boxGeometry args={[2.23, 0.05, 0.03]} />
              <meshStandardMaterial color="#ff007f" transparent opacity={0.4} roughness={0.01} />
            </mesh>
            {/* Glowing neon pink bulbs array */}
            {[-1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0].map((x, idx) => (
              <group key={idx} position={[x, 0, 0.015]}>
                <mesh>
                  <sphereGeometry args={[0.022, 10, 10]} />
                  <meshStandardMaterial color="#ff007f" emissive="#f43f5e" emissiveIntensity={6} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.008, 6, 6]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Detailed Cyber geometric doors */}
          <group position={[-1.17, 0.44, 0]}>
            {/* Left Door Panel */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.045, 0.38, 1.4]} />
              <meshStandardMaterial color="#0f172a" metalness={0.99} roughness={0.05} />
            </mesh>
            {/* Geometric flush door handle */}
            <mesh position={[-0.03, 0.08, -0.4]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.015, 0.02, 0.15]} />
              <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2} />
            </mesh>
          </group>
          <group position={[1.17, 0.44, 0]}>
            {/* Right Door Panel */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.045, 0.38, 1.4]} />
              <meshStandardMaterial color="#0f172a" metalness={0.99} roughness={0.05} />
            </mesh>
            {/* Geometric flush door handle */}
            <mesh position={[0.03, 0.08, -0.4]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.015, 0.02, 0.15]} />
              <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'hyper_specter' && (
        <>
          {/* Hyper Specter V12: Forward-cabin extreme curves with visible chrome motor block */}
          {/* Complex carbon splitter scoops */}
          <mesh position={[0, 0.22, 2.18]} castShadow>
            <boxGeometry args={[2.42, 0.1, 0.65]} />
            <meshStandardMaterial color="#020617" metalness={0.98} />
          </mesh>
          <mesh position={[0.72, 0.42, 1.85]} rotation={[0.12, 0, 0.22]}>
            <boxGeometry args={[0.82, 0.14, 0.82]} />
            <meshStandardMaterial color={activeColor} metalness={0.92} />
          </mesh>
          <mesh position={[-0.72, 0.42, 1.85]} rotation={[0.12, 0, -0.22]}>
            <boxGeometry args={[0.82, 0.14, 0.82]} />
            <meshStandardMaterial color={activeColor} metalness={0.92} />
          </mesh>

          {/* Low carbon hypercar tub */}
          <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.3, 0.52, 4.4]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.12} />
          </mesh>

          {/* Forward-thrusted glass cockpit capsule */}
          <mesh position={[0, 0.9, 0.35]} rotation={[-0.24, 0, 0]} castShadow>
            <boxGeometry args={[1.56, 0.52, 1.75]} />
            <meshStandardMaterial color="#020617" metalness={0.99} roughness={0.01} transparent opacity={0.94} />
          </mesh>

          {/* Exposed Detailed Chrome V12 Engine */}
          <group position={[0, 0.65, -1.05]}>
            {/* Wireframe protective cover */}
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[1.25, 0.1, 1.35]} />
              <meshStandardMaterial color="#111827" metalness={0.95} wireframe />
            </mesh>
            {/* Manifold headers */}
            <mesh position={[0.22, 0.02, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.95, 12]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.98} roughness={0.05} />
            </mesh>
            <mesh position={[-0.22, 0.02, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.95, 12]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.98} roughness={0.05} />
            </mesh>
            {/* Gold filters */}
            <mesh position={[0.22, 0.02, 0.48]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.22, 12]} />
              <meshStandardMaterial color="#ca8a04" metalness={0.92} />
            </mesh>
            <mesh position={[-0.22, 0.02, 0.48]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.22, 12]} />
              <meshStandardMaterial color="#ca8a04" metalness={0.92} />
            </mesh>
          </group>

          {/* Aero side channels */}
          <mesh position={[1.18, 0.42, -0.32]} rotation={[0, -0.06, 0]} castShadow>
            <boxGeometry args={[0.1, 0.42, 2.1]} />
            <meshStandardMaterial color="#020617" metalness={0.95} />
          </mesh>
          <mesh position={[-1.18, 0.42, -0.32]} rotation={[0, 0.06, 0]} castShadow>
            <boxGeometry args={[0.1, 0.42, 2.1]} />
            <meshStandardMaterial color="#020617" metalness={0.95} />
          </mesh>

          {/* Tri-lens purple LED vertical headlights */}
          <group position={[0, 0.52, 2.08]}>
            <mesh position={[0.84, 0, 0]}>
              <boxGeometry args={[0.2, 0.32, 0.12]} />
              <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={5} />
            </mesh>
            <mesh position={[-0.84, 0, 0]}>
              <boxGeometry args={[0.2, 0.32, 0.12]} />
              <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={5} />
            </mesh>
          </group>

          {/* Extreme center-exit triple exhaust in triangle */}
          <group position={[0, 0.54, -2.22]}>
            {[
              { pos: [0, 0.1, 0] as [number, number, number] },
              { pos: [0.08, -0.04, 0] as [number, number, number] },
              { pos: [-0.08, -0.04, 0] as [number, number, number] }
            ].map((p, idx) => (
              <group key={idx} position={p.pos} rotation={[Math.PI/2, 0, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.07, 0.07, 0.25, 12]} />
                  <meshStandardMaterial color="#f1f5f9" metalness={0.99} />
                </mesh>
                <mesh position={[0, -0.123, 0]}>
                  <cylinderGeometry args={[0.05, 0.05, 0.01, 12]} />
                  <meshBasicMaterial color="#000000" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Hyper Specter real bulb taillights */}
          <group position={[0, 0.62, -2.18]}>
            {/* Left tri-bulb housing */}
            <group position={[0.72, 0, 0]}>
              <mesh>
                <boxGeometry args={[0.42, 0.16, 0.08]} />
                <meshStandardMaterial color="#0f172a" metalness={0.95} />
              </mesh>
              {/* Bulbs */}
              {[-0.14, 0, 0.14].map((bx, bidx) => (
                <group key={bidx} position={[bx, 0, 0.02]}>
                  <mesh>
                    <sphereGeometry args={[0.045, 12, 12]} />
                    <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5} />
                  </mesh>
                  <mesh>
                    <sphereGeometry args={[0.012, 8, 8]} />
                    <meshBasicMaterial color="#fef08a" />
                  </mesh>
                </group>
              ))}
            </group>
            {/* Right tri-bulb housing */}
            <group position={[-0.72, 0, 0]}>
              <mesh>
                <boxGeometry args={[0.42, 0.16, 0.08]} />
                <meshStandardMaterial color="#0f172a" metalness={0.95} />
              </mesh>
              {/* Bulbs */}
              {[-0.14, 0, 0.14].map((bx, bidx) => (
                <group key={bidx} position={[bx, 0, 0.02]}>
                  <mesh>
                    <sphereGeometry args={[0.045, 12, 12]} />
                    <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5} />
                  </mesh>
                  <mesh>
                    <sphereGeometry args={[0.012, 8, 8]} />
                    <meshBasicMaterial color="#fef08a" />
                  </mesh>
                </group>
              ))}
            </group>
          </group>

          {/* Detailed Hyper Specter Butterfly Doors */}
          <group position={[-1.16, 0.48, 0.2]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.4, 1.25]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.12} />
            </mesh>
            {/* High fidelity carbon fiber weave wing mirror stem/door accent */}
            <mesh position={[-0.01, 0.08, 0.2]}>
              <boxGeometry args={[0.02, 0.08, 0.45]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.8} />
            </mesh>
            {/* Sleek metallic flush handle */}
            <mesh position={[-0.022, 0.06, -0.32]}>
              <boxGeometry args={[0.01, 0.02, 0.15]} />
              <meshStandardMaterial color="#f1f5f9" metalness={0.99} roughness={0.01} />
            </mesh>
          </group>
          <group position={[1.16, 0.48, 0.2]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.4, 1.25]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.12} />
            </mesh>
            {/* High fidelity carbon fiber weave wing mirror stem/door accent */}
            <mesh position={[0.01, 0.08, 0.2]}>
              <boxGeometry args={[0.02, 0.08, 0.45]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.8} />
            </mesh>
            {/* Sleek metallic flush handle */}
            <mesh position={[0.022, 0.06, -0.32]}>
              <boxGeometry args={[0.01, 0.02, 0.15]} />
              <meshStandardMaterial color="#f1f5f9" metalness={0.99} roughness={0.01} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'volcano_r8' && (
        <>
          {/* Volcano R8: Mid-engine V10 with slatted louver engine deck and inner engine glow */}
          {/* Flared pointed nose */}
          <mesh position={[0, 0.16, 2.22]} rotation={[0.08, 0, 0]}>
            <boxGeometry args={[2.3, 0.08, 0.5]} />
            <meshStandardMaterial color="#020617" metalness={0.9} />
          </mesh>
          <mesh position={[0, 0.58, 1.3]} rotation={[-0.15, 0, 0]} castShadow>
            <boxGeometry args={[1.88, 0.2, 1.7]} />
            <meshStandardMaterial color={activeColor} metalness={0.9} roughness={0.15} />
          </mesh>

          {/* Ground hugging racing tub */}
          <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.3, 0.52, 4.3]} />
            <meshStandardMaterial color={activeColor} metalness={0.9} roughness={0.15} />
          </mesh>

          {/* Vented Louvers with red hot engine fire background */}
          <group position={[0, 0.62, -1.0]}>
            {/* Pulsing deep orange engine base */}
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[1.35, 0.04, 1.45]} />
              <meshBasicMaterial color="#f97316" />
            </mesh>
            {/* Louver Blades */}
            {[0.48, 0.24, 0, -0.24, -0.48].map((z, idx) => (
              <mesh key={idx} position={[0, 0.04, z]} rotation={[0.26, 0, 0]}>
                <boxGeometry args={[1.42, 0.04, 0.16]} />
                <meshStandardMaterial color="#111827" metalness={0.95} />
              </mesh>
            ))}
          </group>

          {/* Bright orange race livery panels */}
          <mesh position={[1.16, 0.55, 0.45]} rotation={[0, 0, -0.08]}>
            <boxGeometry args={[0.02, 0.2, 1.45]} />
            <meshBasicMaterial color="#ea580c" />
          </mesh>
          <mesh position={[-1.16, 0.55, 0.45]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.02, 0.2, 1.45]} />
            <meshBasicMaterial color="#ea580c" />
          </mesh>

          {/* Low curved cabin */}
          <mesh position={[0, 0.94, -0.2]} rotation={[-0.12, 0, 0]} castShadow>
            <boxGeometry args={[1.68, 0.48, 2.05]} />
            <meshStandardMaterial color="#020617" metalness={0.95} roughness={0.05} transparent opacity={0.9} />
          </mesh>

          {/* Sharp pointed fire-orange headlights */}
          <mesh position={[0.78, 0.52, 2.1]} rotation={[0.08, 0.18, 0]}>
            <boxGeometry args={[0.42, 0.12, 0.1]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={5} />
          </mesh>
          <mesh position={[-0.78, 0.52, 2.1]} rotation={[0.08, -0.18, 0]}>
            <boxGeometry args={[0.42, 0.12, 0.1]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={5} />
          </mesh>

          {/* Volcano R8 real rear red bulbs */}
          <group position={[0, 0.58, -2.12]}>
            {/* Left Light Pod */}
            <group position={[0.85, 0, 0]}>
              <mesh>
                <boxGeometry args={[0.32, 0.14, 0.06]} />
                <meshStandardMaterial color="#090d16" metalness={0.9} />
              </mesh>
              <group position={[-0.07, 0, 0.02]}>
                <mesh><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5.5} /></mesh>
                <mesh><sphereGeometry args={[0.01, 8, 8]} /><meshBasicMaterial color="#fef08a" /></mesh>
              </group>
              <group position={[0.07, 0, 0.02]}>
                <mesh><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5.5} /></mesh>
                <mesh><sphereGeometry args={[0.01, 8, 8]} /><meshBasicMaterial color="#fef08a" /></mesh>
              </group>
            </group>
            {/* Right Light Pod */}
            <group position={[-0.85, 0, 0]}>
              <mesh>
                <boxGeometry args={[0.32, 0.14, 0.06]} />
                <meshStandardMaterial color="#090d16" metalness={0.9} />
              </mesh>
              <group position={[-0.07, 0, 0.02]}>
                <mesh><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5.5} /></mesh>
                <mesh><sphereGeometry args={[0.01, 8, 8]} /><meshBasicMaterial color="#fef08a" /></mesh>
              </group>
              <group position={[0.07, 0, 0.02]}>
                <mesh><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5.5} /></mesh>
                <mesh><sphereGeometry args={[0.01, 8, 8]} /><meshBasicMaterial color="#fef08a" /></mesh>
              </group>
            </group>
          </group>

          {/* Detailed Volcano Scissor Doors */}
          <group position={[-1.16, 0.52, 0.1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.44, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.9} roughness={0.15} />
            </mesh>
            {/* Scissor lift hinge hardware node at front edge */}
            <mesh position={[-0.01, 0.05, 0.55]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.05, 8]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.99} />
            </mesh>
            {/* Carbon-fiber detailed handle pocket */}
            <mesh position={[-0.015, -0.05, -0.35]}>
              <boxGeometry args={[0.015, 0.06, 0.18]} />
              <meshStandardMaterial color="#111827" roughness={0.9} />
            </mesh>
          </group>
          <group position={[1.16, 0.52, 0.1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.44, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.9} roughness={0.15} />
            </mesh>
            {/* Scissor lift hinge hardware node at front edge */}
            <mesh position={[0.01, 0.05, 0.55]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.05, 8]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.99} />
            </mesh>
            {/* Carbon-fiber detailed handle pocket */}
            <mesh position={[0.015, -0.05, -0.35]}>
              <boxGeometry args={[0.015, 0.06, 0.18]} />
              <meshStandardMaterial color="#111827" roughness={0.9} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'thunderbolt' && (
        <>
          {/* Thunderbolt: Cyber-Fighter extreme concept with out-board pods */}
          {/* Main central bullet pod */}
          <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.18, 0.52, 4.55]} />
            <meshStandardMaterial color={activeColor} metalness={0.98} roughness={0.05} />
          </mesh>

          {/* Left Wing and Fender Pod */}
          <group position={[1.22, 0.2, 0]}>
            {/* Support Strut */}
            <mesh position={[-0.45, 0.15, 0]} rotation={[0, 0, -0.22]}>
              <boxGeometry args={[0.65, 0.08, 1.15]} />
              <meshStandardMaterial color="#020617" metalness={0.95} />
            </mesh>
            {/* Pontoon Pod */}
            <mesh position={[0, 0.1, 0]} castShadow>
              <boxGeometry args={[0.4, 0.42, 3.7]} />
              <meshStandardMaterial color={activeColor} metalness={0.9} roughness={0.15} />
            </mesh>
          </group>

          {/* Right Wing and Fender Pod */}
          <group position={[-1.22, 0.2, 0]}>
            {/* Support Strut */}
            <mesh position={[0.45, 0.15, 0]} rotation={[0, 0, 0.22]}>
              <boxGeometry args={[0.65, 0.08, 1.15]} />
              <meshStandardMaterial color="#020617" metalness={0.95} />
            </mesh>
            {/* Pontoon Pod */}
            <mesh position={[0, 0.1, 0]} castShadow>
              <boxGeometry args={[0.4, 0.42, 3.7]} />
              <meshStandardMaterial color={activeColor} metalness={0.9} roughness={0.15} />
            </mesh>
          </group>

          {/* Fighter Jet dome canopy */}
          <mesh position={[0, 0.92, 0.1]} rotation={[-0.16, 0, 0]} castShadow>
            <boxGeometry args={[0.88, 0.48, 1.75]} />
            <meshStandardMaterial color="#0ea5e9" metalness={0.99} roughness={0.01} transparent opacity={0.88} />
          </mesh>

          {/* F1 front wing extension */}
          <mesh position={[0, 0.18, 2.12]} castShadow>
            <boxGeometry args={[2.75, 0.06, 0.52]} />
            <meshStandardMaterial color="#020617" metalness={0.95} />
          </mesh>

          {/* Centered Dual Jet Rocket Boosters */}
          <group position={[0, 0.48, -2.25]}>
            <mesh position={[0.22, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 0.75, 16]} />
              <meshStandardMaterial color="#1f2937" metalness={0.95} />
            </mesh>
            <mesh position={[0.22, 0, -0.4]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.1, 16]} />
              <meshStandardMaterial color="#38bdf8" emissive="#06b6d4" emissiveIntensity={6} />
            </mesh>

            <mesh position={[-0.22, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 0.75, 16]} />
              <meshStandardMaterial color="#1f2937" metalness={0.95} />
            </mesh>
            <mesh position={[-0.22, 0, -0.4]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.1, 16]} />
              <meshStandardMaterial color="#38bdf8" emissive="#06b6d4" emissiveIntensity={6} />
            </mesh>
          </group>

          {/* Plasma yellow headlights */}
          <mesh position={[0.4, 0.52, 2.12]}>
            <boxGeometry args={[0.15, 0.15, 0.15]} />
            <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={5} />
          </mesh>
          <mesh position={[-0.4, 0.52, 2.12]}>
            <boxGeometry args={[0.15, 0.15, 0.15]} />
            <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={5} />
          </mesh>

          {/* Thunderbolt center safety red bulb light */}
          <group position={[0, 0.26, -2.18]}>
            <mesh>
              <boxGeometry args={[0.26, 0.26, 0.06]} />
              <meshStandardMaterial color="#090d16" metalness={0.95} />
            </mesh>
            {/* Grid of 4 glowing safety red bulbs */}
            {[-0.06, 0.06].map((x) => 
              [-0.06, 0.06].map((y) => (
                <group key={`${x}-${y}`} position={[x, y, 0.02]}>
                  <mesh>
                    <sphereGeometry args={[0.025, 10, 10]} />
                    <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={7} />
                  </mesh>
                  <mesh>
                    <sphereGeometry args={[0.008, 6, 6]} />
                    <meshBasicMaterial color="#fef08a" />
                  </mesh>
                </group>
              ))
            )}
          </group>

          {/* Detailed Thunderbolt sliding/canopy entry doors */}
          <group position={[-0.59, 0.52, 0.1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.03, 0.4, 1.25]} />
              <meshStandardMaterial color={activeColor} metalness={0.98} roughness={0.05} />
            </mesh>
            {/* Sliding channel rails on the door */}
            <mesh position={[-0.012, 0, 0]}>
              <boxGeometry args={[0.015, 0.02, 1.28]} />
              <meshStandardMaterial color="#1e293b" metalness={0.99} />
            </mesh>
            {/* High-voltage electronic handle sensor */}
            <mesh position={[-0.02, 0.08, -0.2]}>
              <boxGeometry args={[0.012, 0.015, 0.12]} />
              <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={3} />
            </mesh>
          </group>
          <group position={[0.59, 0.52, 0.1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.03, 0.4, 1.25]} />
              <meshStandardMaterial color={activeColor} metalness={0.98} roughness={0.05} />
            </mesh>
            {/* Sliding channel rails on the door */}
            <mesh position={[0.012, 0, 0]}>
              <boxGeometry args={[0.015, 0.02, 1.28]} />
              <meshStandardMaterial color="#1e293b" metalness={0.99} />
            </mesh>
            {/* High-voltage electronic handle sensor */}
            <mesh position={[0.02, 0.08, -0.2]}>
              <boxGeometry args={[0.012, 0.015, 0.12]} />
              <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={3} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'sentinel' && (
        <>
          {/* Sentinel V-Spec: Muscular Japanese Street Legend */}
          {/* Carbon Front Splitter */}
          <mesh position={[0, 0.16, 2.22]} castShadow>
            <boxGeometry args={[2.4, 0.1, 0.5]} />
            <meshStandardMaterial color="#111827" metalness={0.9} roughness={0.3} />
          </mesh>

          {/* Large intercooler grille with mesh look */}
          <mesh position={[0, 0.38, 2.15]}>
            <boxGeometry args={[1.7, 0.32, 0.15]} />
            <meshStandardMaterial color="#334155" metalness={0.95} roughness={0.2} />
          </mesh>

          {/* Main muscular widebody chassis */}
          <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.35, 0.54, 4.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
          </mesh>

          {/* Muscular Hood with center power bulge */}
          <mesh position={[0, 0.62, 1.25]} rotation={[-0.1, 0, 0]} castShadow>
            <boxGeometry args={[1.9, 0.22, 1.8]} />
            <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.68, 1.2]} rotation={[-0.1, 0, 0]}>
            <boxGeometry args={[0.6, 0.12, 1.4]} />
            <meshStandardMaterial color="#020617" metalness={0.9} roughness={0.3} />
          </mesh>

          {/* Bold widebody fender flares */}
          <group>
            <mesh position={[1.2, 0.42, 1.25]} castShadow>
              <boxGeometry args={[0.15, 0.46, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} />
            </mesh>
            <mesh position={[-1.2, 0.42, 1.25]} castShadow>
              <boxGeometry args={[0.15, 0.46, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} />
            </mesh>
            <mesh position={[1.2, 0.42, -1.25]} castShadow>
              <boxGeometry args={[0.15, 0.46, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} />
            </mesh>
            <mesh position={[-1.2, 0.42, -1.25]} castShadow>
              <boxGeometry args={[0.15, 0.46, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} />
            </mesh>
          </group>

          {/* GT High cabin roof */}
          <mesh position={[0, 0.98, -0.2]} rotation={[-0.08, 0, 0]} castShadow>
            <boxGeometry args={[1.78, 0.52, 2.1]} />
            <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.1} transparent opacity={0.9} />
          </mesh>

          {/* Quad circular JDM headlights */}
          <group position={[0, 0.52, 2.12]}>
            <mesh position={[0.62, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.05, 12]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={4} />
            </mesh>
            <mesh position={[0.82, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.05, 12]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={4} />
            </mesh>
            <mesh position={[-0.62, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.05, 12]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={4} />
            </mesh>
            <mesh position={[-0.82, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.05, 12]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={4} />
            </mesh>
          </group>

          {/* Skyline classic quad circular taillights with real bulbs */}
          <group position={[0, 0.54, -2.12]}>
            {[
              { x: 0.6, r: 0.12, intensity: 5 },
              { x: 0.8, r: 0.09, intensity: 4 },
              { x: -0.6, r: 0.12, intensity: 5 },
              { x: -0.8, r: 0.09, intensity: 4 }
            ].map((cfg, idx) => (
              <group key={idx} position={[cfg.x, 0, 0]}>
                {/* Circular reflective socket */}
                <mesh rotation={[Math.PI/2, 0, 0]}>
                  <cylinderGeometry args={[cfg.r + 0.02, cfg.r + 0.02, 0.05, 16]} />
                  <meshStandardMaterial color="#090d16" metalness={0.9} />
                </mesh>
                <mesh position={[0, 0, -0.015]} rotation={[Math.PI/2, 0, 0]}>
                  <cylinderGeometry args={[cfg.r, cfg.r, 0.02, 16]} />
                  <meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.1} />
                </mesh>
                {/* Real physical round bulb */}
                <mesh position={[0, 0, 0.015]}>
                  <sphereGeometry args={[cfg.r * 0.65, 12, 12]} />
                  <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={cfg.intensity} />
                </mesh>
                {/* Filament */}
                <mesh position={[0, 0, 0.015]}>
                  <sphereGeometry args={[0.012, 8, 8]} />
                  <meshBasicMaterial color="#fef08a" />
                </mesh>
                {/* Convex glassy light cover */}
                <mesh position={[0, 0, 0.03]} rotation={[Math.PI/2, 0, 0]}>
                  <cylinderGeometry args={[cfg.r, cfg.r, 0.01, 16]} />
                  <meshStandardMaterial color="#ef4444" transparent opacity={0.35} roughness={0.01} metalness={0.9} />
                </mesh>
              </group>
            ))}
          </group>

          {/* Large Dual Titanium Exhaust Pipes */}
          <group position={[0, 0.26, -2.14]}>
            {[0.72, -0.72].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.14, 0.14, 0.35, 12]} />
                  <meshStandardMaterial color="#60a5fa" metalness={0.99} roughness={0.1} />
                </mesh>
                <mesh position={[0, -0.173, 0]}>
                  <cylinderGeometry args={[0.105, 0.105, 0.01, 12]} />
                  <meshBasicMaterial color="#000000" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Detailed Sentinel JDM sports doors */}
          <group position={[-1.18, 0.48, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.44, 1.2]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Black rubber protective side molding strip */}
            <mesh position={[-0.01, -0.06, 0]}>
              <boxGeometry args={[0.03, 0.05, 1.22]} />
              <meshStandardMaterial color="#0b0f19" roughness={0.9} />
            </mesh>
            {/* Classic JDM black grab handle with silver lock cylinder */}
            <mesh position={[-0.02, 0.1, -0.35]}>
              <boxGeometry args={[0.015, 0.03, 0.14]} />
              <meshStandardMaterial color="#020617" roughness={0.7} />
            </mesh>
            {/* Lock cylinder keyhole */}
            <mesh position={[-0.022, 0.1, -0.22]} rotation={[0, 0, Math.PI/2]}>
              <cylinderGeometry args={[0.005, 0.005, 0.01, 6]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.9} />
            </mesh>
          </group>
          <group position={[1.18, 0.48, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.44, 1.2]} />
              <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Black rubber protective side molding strip */}
            <mesh position={[0.01, -0.06, 0]}>
              <boxGeometry args={[0.03, 0.05, 1.22]} />
              <meshStandardMaterial color="#0b0f19" roughness={0.9} />
            </mesh>
            {/* Classic JDM black grab handle with silver lock cylinder */}
            <mesh position={[0.02, 0.1, -0.35]}>
              <boxGeometry args={[0.015, 0.03, 0.14]} />
              <meshStandardMaterial color="#020617" roughness={0.7} />
            </mesh>
            {/* Lock cylinder keyhole */}
            <mesh position={[0.022, 0.1, -0.22]} rotation={[0, 0, Math.PI/2]}>
              <cylinderGeometry args={[0.005, 0.005, 0.01, 6]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.9} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'zenith' && (
        <>
          {/* Zenith Electra: Elegant futuristic hydrogen luxury hyper-cruiser */}
          {/* Continuous sweeping futuristic low chassis */}
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.25, 0.42, 4.5]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.08} />
          </mesh>

          {/* Smooth sloped aerodynamic nose */}
          <mesh position={[0, 0.48, 1.45]} rotation={[-0.08, 0, 0]} castShadow>
            <boxGeometry args={[2.0, 0.18, 1.6]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.08} />
          </mesh>

          {/* Panoramic edge-to-edge curved glass canopy */}
          <mesh position={[0, 0.82, -0.1]} rotation={[-0.1, 0, 0]} castShadow>
            <boxGeometry args={[1.7, 0.46, 2.5]} />
            <meshStandardMaterial color="#10b981" metalness={0.98} roughness={0.01} transparent opacity={0.8} />
          </mesh>

          {/* Sweeping side aero-blades */}
          <mesh position={[1.15, 0.48, -0.4]} rotation={[0, -0.04, 0]}>
            <boxGeometry args={[0.08, 0.32, 2.6]} />
            <meshStandardMaterial color="#111827" metalness={0.9} />
          </mesh>
          <mesh position={[-1.15, 0.48, -0.4]} rotation={[0, 0.04, 0]}>
            <boxGeometry args={[0.08, 0.32, 2.6]} />
            <meshStandardMaterial color="#111827" metalness={0.9} />
          </mesh>

          {/* Wraparound continuous LED head-ribbon */}
          <mesh position={[0, 0.46, 2.22]} rotation={[0, 0, 0]}>
            <boxGeometry args={[2.1, 0.05, 0.08]} />
            <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={4} />
          </mesh>

          {/* Sweeping sci-fi light strips on the roof sides */}
          <mesh position={[0.82, 0.88, -0.1]} rotation={[-0.1, 0, 0]}>
            <boxGeometry args={[0.03, 0.04, 2.2]} />
            <meshBasicMaterial color="#34d399" />
          </mesh>
          <mesh position={[-0.82, 0.88, -0.1]} rotation={[-0.1, 0, 0]}>
            <boxGeometry args={[0.03, 0.04, 2.2]} />
            <meshBasicMaterial color="#34d399" />
          </mesh>

          {/* Dual glowing cyan Hydrogen Core Rings at rear */}
          <group position={[0, 0.48, -2.18]}>
            <mesh position={[0.4, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
              <meshStandardMaterial color="#111827" metalness={0.9} />
            </mesh>
            <mesh position={[0.4, 0, 0.02]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.1, 16]} />
              <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={5} />
            </mesh>

            <mesh position={[-0.4, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
              <meshStandardMaterial color="#111827" metalness={0.9} />
            </mesh>
            <mesh position={[-0.4, 0, 0.02]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.1, 16]} />
              <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={5} />
            </mesh>
          </group>

          {/* Zenith futuristic side red bulbs */}
          <group position={[0, 0.44, -2.18]}>
            {[0.84, -0.84].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]}>
                <mesh>
                  <boxGeometry args={[0.26, 0.12, 0.06]} />
                  <meshStandardMaterial color="#090d16" metalness={0.95} />
                </mesh>
                {/* Dual tiny futuristic bulbs */}
                {[-0.06, 0.06].map((bx, bidx) => (
                  <group key={bidx} position={[bx, 0, 0.015]}>
                    <mesh>
                      <sphereGeometry args={[0.035, 12, 12]} />
                      <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5} />
                    </mesh>
                    <mesh>
                      <sphereGeometry args={[0.009, 6, 6]} />
                      <meshBasicMaterial color="#a7f3d0" />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}
          </group>

          {/* Futuristic Zenith Hydrogen doors */}
          <group position={[-1.125, 0.44, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.38, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.08} />
            </mesh>
            {/* Glowing hydrogen power status cell */}
            <mesh position={[-0.015, -0.06, 0.1]}>
              <boxGeometry args={[0.02, 0.04, 0.22]} />
              <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={3} />
            </mesh>
            {/* High-tech flush-fit handle */}
            <mesh position={[-0.02, 0.08, -0.32]}>
              <boxGeometry args={[0.012, 0.02, 0.14]} />
              <meshStandardMaterial color="#111827" metalness={0.99} />
            </mesh>
          </group>
          <group position={[1.125, 0.44, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.38, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.08} />
            </mesh>
            {/* Glowing hydrogen power status cell */}
            <mesh position={[0.015, -0.06, 0.1]}>
              <boxGeometry args={[0.02, 0.04, 0.22]} />
              <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={3} />
            </mesh>
            {/* High-tech flush-fit handle */}
            <mesh position={[0.02, 0.08, -0.32]}>
              <boxGeometry args={[0.012, 0.02, 0.14]} />
              <meshStandardMaterial color="#111827" metalness={0.99} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'valkyrie' && (
        <>
          {/* Valkyrie AMR Aero: Extreme Venturi-Tunnel Hybrid Race Hypercar */}
          {/* Central narrow teardrop survival tub */}
          <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.35, 0.44, 4.3]} />
            <meshStandardMaterial color={activeColor} metalness={0.98} roughness={0.06} />
          </mesh>

          {/* Narrow Le Mans bubble cockpit cabin */}
          <mesh position={[0, 0.88, 0.2]} rotation={[-0.15, 0, 0]} castShadow>
            <boxGeometry args={[1.0, 0.5, 1.8]} />
            <meshStandardMaterial color="#020617" metalness={0.99} roughness={0.01} transparent opacity={0.95} />
          </mesh>

          {/* Separate outboard front left fender */}
          <mesh position={[1.1, 0.36, 1.4]} castShadow>
            <boxGeometry args={[0.36, 0.38, 1.3]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} />
          </mesh>
          <mesh position={[0.75, 0.28, 1.4]}>
            <boxGeometry args={[0.4, 0.06, 0.4]} />
            <meshStandardMaterial color="#020617" />
          </mesh>

          {/* Separate outboard front right fender */}
          <mesh position={[-1.1, 0.36, 1.4]} castShadow>
            <boxGeometry args={[0.36, 0.38, 1.3]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} />
          </mesh>
          <mesh position={[-0.75, 0.28, 1.4]}>
            <boxGeometry args={[0.4, 0.06, 0.4]} />
            <meshStandardMaterial color="#020617" />
          </mesh>

          {/* Sweeping Venturi side aerodynamic floors */}
          <mesh position={[1.15, 0.14, -0.4]} castShadow>
            <boxGeometry args={[0.35, 0.06, 2.5]} />
            <meshStandardMaterial color="#020617" metalness={0.9} />
          </mesh>
          <mesh position={[-1.15, 0.14, -0.4]} castShadow>
            <boxGeometry args={[0.35, 0.06, 2.5]} />
            <meshStandardMaterial color="#020617" metalness={0.9} />
          </mesh>

          {/* F1-style active carbon front wing */}
          <mesh position={[0, 0.18, 2.22]} castShadow>
            <boxGeometry args={[2.5, 0.05, 0.45]} />
            <meshStandardMaterial color="#090d16" metalness={0.95} />
          </mesh>

          {/* Tiny vertical razor-sharp LED headlights */}
          <group position={[0, 0.44, 2.05]}>
            <mesh position={[0.55, 0, 0]}>
              <boxGeometry args={[0.06, 0.24, 0.08]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={5} />
            </mesh>
            <mesh position={[-0.55, 0, 0]}>
              <boxGeometry args={[0.06, 0.24, 0.08]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={5} />
            </mesh>
          </group>

          {/* Thin continuous laser line tail-light with real bulb beads */}
          <group position={[0, 0.58, -2.18]}>
            {/* Clear red outer tube */}
            <mesh>
              <boxGeometry args={[1.3, 0.04, 0.06]} />
              <meshStandardMaterial color="#ef4444" transparent opacity={0.4} roughness={0.01} metalness={0.95} />
            </mesh>
            {/* Bulb array inside */}
            {[-0.55, -0.39, -0.23, -0.07, 0.07, 0.23, 0.39, 0.55].map((x, idx) => (
              <group key={idx} position={[x, 0, 0.01]}>
                <mesh>
                  <sphereGeometry args={[0.016, 8, 8]} />
                  <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={6} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.005, 4, 4]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Detailed Valkyrie Le Mans doors */}
          <group position={[-0.675, 0.42, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.03, 0.38, 1.2]} />
              <meshStandardMaterial color={activeColor} metalness={0.98} roughness={0.06} />
            </mesh>
            {/* Exposed carbon fiber structural weave accent */}
            <mesh position={[-0.01, -0.05, 0]}>
              <boxGeometry args={[0.02, 0.15, 0.9]} />
              <meshStandardMaterial color="#1e293b" roughness={0.8} />
            </mesh>
            {/* Lightweight fabric pull loop handle (racing style) */}
            <mesh position={[-0.02, 0.08, -0.2]} rotation={[0, 0, 0.15]}>
              <boxGeometry args={[0.01, 0.012, 0.12]} />
              <meshStandardMaterial color="#ef4444" roughness={0.9} />
            </mesh>
          </group>
          <group position={[0.675, 0.42, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.03, 0.38, 1.2]} />
              <meshStandardMaterial color={activeColor} metalness={0.98} roughness={0.06} />
            </mesh>
            {/* Exposed carbon fiber structural weave accent */}
            <mesh position={[0.01, -0.05, 0]}>
              <boxGeometry args={[0.02, 0.15, 0.9]} />
              <meshStandardMaterial color="#1e293b" roughness={0.8} />
            </mesh>
            {/* Lightweight fabric pull loop handle */}
            <mesh position={[0.02, 0.08, -0.2]} rotation={[0, 0, -0.15]}>
              <boxGeometry args={[0.01, 0.012, 0.12]} />
              <meshStandardMaterial color="#ef4444" roughness={0.9} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'interceptor' && (
        <>
          {/* Interceptor Interstellar: Fighter-Jet Land Rocket */}
          {/* Main rocket/fuselage central tube */}
          <mesh position={[0, 0.46, 0]} rotation={[0, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.0, 0.48, 4.6]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.05} />
          </mesh>

          {/* Long pointed needle nose cone */}
          <mesh position={[0, 0.4, 2.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.5, 1.2, 16]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.05} />
          </mesh>

          {/* Fighter Jet Single Bubble Glass Canopy */}
          <group position={[0, 0.88, 0]} rotation={[-0.08, 0, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.38, 0.38, 1.6, 16]} />
              <meshStandardMaterial color="#6366f1" metalness={0.99} roughness={0.01} transparent opacity={0.85} />
            </mesh>
          </group>

          {/* Dual side-mounted jet intake turbine pods */}
          <group position={[1.16, 0.42, -0.2]} castShadow>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.32, 0.32, 2.6, 16]} />
              <meshStandardMaterial color="#1e293b" metalness={0.95} />
            </mesh>
            {/* Glowing intake ring at the front */}
            <mesh position={[0, 0, 1.32]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.28, 0.28, 0.06, 16]} />
              <meshStandardMaterial color="#818cf8" emissive="#6366f1" emissiveIntensity={5} />
            </mesh>
          </group>

          <group position={[-1.16, 0.42, -0.2]} castShadow>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.32, 0.32, 2.6, 16]} />
              <meshStandardMaterial color="#1e293b" metalness={0.95} />
            </mesh>
            {/* Glowing intake ring at the front */}
            <mesh position={[0, 0, 1.32]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.28, 0.28, 0.06, 16]} />
              <meshStandardMaterial color="#818cf8" emissive="#6366f1" emissiveIntensity={5} />
            </mesh>
          </group>

          {/* Center-rear vertical stabilizer fin */}
          <mesh position={[0, 1.15, -1.8]} rotation={[-0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.06, 0.9, 0.95]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} />
          </mesh>

          {/* Massively glowing center jet rocket engine nozzle at back */}
          <group position={[0, 0.46, -2.35]}>
            <mesh rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.38, 0.28, 0.6, 16]} />
              <meshStandardMaterial color="#334155" metalness={0.98} />
            </mesh>
            <mesh position={[0, 0, -0.32]} rotation={[Math.PI/2, 0, 0]}>
              <cylinderGeometry args={[0.22, 0.22, 0.08, 16]} />
              <meshStandardMaterial color="#cbd5e1" emissive="#6366f1" emissiveIntensity={8} />
            </mesh>
          </group>

          {/* Interceptor dual vertical red bulb safety lights */}
          <group position={[0, 0.42, -1.35]}>
            {[1.16, -1.16].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]}>
                {/* Vertical black pod slot */}
                <mesh>
                  <boxGeometry args={[0.08, 0.35, 0.06]} />
                  <meshStandardMaterial color="#020617" metalness={0.9} />
                </mesh>
                {/* Column of 3 glowing circular safety bulbs */}
                {[-0.11, 0, 0.11].map((y, bidx) => (
                  <group key={bidx} position={[0, y, 0.02]}>
                    <mesh>
                      <sphereGeometry args={[0.025, 10, 10]} />
                      <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={6.5} />
                    </mesh>
                    <mesh>
                      <sphereGeometry args={[0.008, 6, 6]} />
                      <meshBasicMaterial color="#fef08a" />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}
          </group>

          {/* Detailed Interceptor Fighter Jet doors */}
          <group position={[-0.5, 0.46, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.03, 0.4, 1.2]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.05} />
            </mesh>
            {/* Rescue yellow stencil arrow decals */}
            <mesh position={[-0.016, 0.1, 0.3]} rotation={[0, 0, Math.PI/2]}>
              <coneGeometry args={[0.04, 0.08, 3]} />
              <meshBasicMaterial color="#eab308" />
            </mesh>
            {/* Ejection pull-loop handle (bright orange/yellow stripe) */}
            <mesh position={[-0.02, 0.08, -0.2]}>
              <boxGeometry args={[0.015, 0.03, 0.1]} />
              <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={2} />
            </mesh>
          </group>
          <group position={[0.5, 0.46, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.03, 0.4, 1.2]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.05} />
            </mesh>
            {/* Rescue yellow stencil arrow decals */}
            <mesh position={[0.016, 0.1, 0.3]} rotation={[0, 0, -Math.PI/2]}>
              <coneGeometry args={[0.04, 0.08, 3]} />
              <meshBasicMaterial color="#eab308" />
            </mesh>
            {/* Ejection pull-loop handle */}
            <mesh position={[0.02, 0.08, -0.2]}>
              <boxGeometry args={[0.015, 0.03, 0.1]} />
              <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={2} />
            </mesh>
          </group>
        </>
      )}

      {carId === 'monarch' && (
        <>
          {/* Monarch Royale: Ultra-Luxury Sovereign Hyper-Beast */}
          {/* Bold, heavy, stately premium chassis */}
          <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.32, 0.56, 4.4]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.1} />
          </mesh>

          {/* Majestic long hood */}
          <mesh position={[0, 0.68, 1.1]} rotation={[-0.05, 0, 0]} castShadow>
            <boxGeometry args={[2.0, 0.26, 2.0]} />
            <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.1} />
          </mesh>

          {/* Solid gold front waterfall grille */}
          <mesh position={[0, 0.46, 2.22]} rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[1.3, 0.42, 0.12]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.08} />
          </mesh>

          {/* Gold plated fender flares/trim strips */}
          <group>
            <mesh position={[1.18, 0.58, 0]} castShadow>
              <boxGeometry args={[0.04, 0.1, 4.0]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.08} />
            </mesh>
            <mesh position={[-1.18, 0.58, 0]} castShadow>
              <boxGeometry args={[0.04, 0.1, 4.0]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.08} />
            </mesh>
          </group>

          {/* Elegant sweeping high cabin roof */}
          <mesh position={[0, 1.05, -0.4]} rotation={[-0.14, 0, 0]} castShadow>
            <boxGeometry args={[1.76, 0.52, 2.1]} />
            <meshStandardMaterial color="#020617" metalness={0.99} roughness={0.01} transparent opacity={0.92} />
          </mesh>

          {/* Royal gold dual-lens jewel LED headlights */}
          <group position={[0, 0.56, 2.15]}>
            <mesh position={[0.78, 0, 0]}>
              <boxGeometry args={[0.26, 0.12, 0.1]} />
              <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={4} />
            </mesh>
            <mesh position={[-0.78, 0, 0]}>
              <boxGeometry args={[0.26, 0.12, 0.1]} />
              <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={4} />
            </mesh>
          </group>

          {/* Quad solid-gold exhausts at the rear */}
          <group position={[0, 0.32, -2.22]}>
            {[0.42, 0.24, -0.24, -0.42].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.09, 0.09, 0.25, 12]} />
                  <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.05} />
                </mesh>
                <mesh position={[0, -0.123, 0]}>
                  <cylinderGeometry args={[0.068, 0.068, 0.01, 12]} />
                  <meshBasicMaterial color="#000000" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Monarch Royale premium jewel red taillights with crystal bulbs */}
          <group position={[0, 0.58, -2.18]}>
            {[0.94, -0.94].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]}>
                {/* Polished Gold/Brass backing */}
                <mesh>
                  <boxGeometry args={[0.18, 0.36, 0.08]} />
                  <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.05} />
                </mesh>
                {/* Two large vertical glowing jewel bulbs */}
                {[-0.1, 0.1].map((y, bidx) => (
                  <group key={bidx} position={[0, y, 0.03]}>
                    {/* Brass seat */}
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                      <cylinderGeometry args={[0.05, 0.05, 0.02, 12]} />
                      <meshStandardMaterial color="#d97706" metalness={0.95} />
                    </mesh>
                    {/* Glowing jewel (octahedron/diamond style) */}
                    <mesh position={[0, 0, 0.015]} rotation={[0, Math.PI / 4, 0]}>
                      <sphereGeometry args={[0.042, 6, 6]} />
                      <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5} roughness={0.02} metalness={0.8} />
                    </mesh>
                    <mesh position={[0, 0, 0.015]}>
                      <sphereGeometry args={[0.01, 6, 6]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                  </group>
                ))}
                {/* High luxury outer clear red fluted lens cover */}
                <mesh position={[0, 0, 0.05]}>
                  <boxGeometry args={[0.16, 0.34, 0.02]} />
                  <meshStandardMaterial color="#ef4444" transparent opacity={0.35} roughness={0.01} metalness={0.9} />
                </mesh>
              </group>
            ))}
          </group>

          {/* Stately Monarch Royale Gold-Accented Coach Doors */}
          <group position={[-1.16, 0.52, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.46, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.1} />
            </mesh>
            {/* Gold coachline pinstripe */}
            <mesh position={[-0.01, 0.12, 0]}>
              <boxGeometry args={[0.025, 0.02, 1.32]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.08} />
            </mesh>
            {/* Heavy solid brass/gold vertical pull handle (mounted near front edge for coach door style) */}
            <mesh position={[-0.025, 0.02, 0.42]}>
              <boxGeometry args={[0.02, 0.14, 0.025]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.08} />
            </mesh>
          </group>
          <group position={[1.16, 0.52, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.04, 0.46, 1.3]} />
              <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.1} />
            </mesh>
            {/* Gold coachline pinstripe */}
            <mesh position={[0.01, 0.12, 0]}>
              <boxGeometry args={[0.025, 0.02, 1.32]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.08} />
            </mesh>
            {/* Heavy solid brass/gold vertical pull handle */}
            <mesh position={[0.025, 0.02, 0.42]}>
              <boxGeometry args={[0.02, 0.14, 0.025]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.99} roughness={0.08} />
            </mesh>
          </group>
        </>
      )}

      {/* Robust Fallback Sports Car Body if ID matches nothing above */}
      {!['viper', 'phantom', 'cyber_razor', 'hyper_specter', 'volcano_r8', 'thunderbolt', 'sentinel', 'zenith', 'valkyrie', 'interceptor', 'monarch'].includes(carId) && (
        <>
          <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.25, 0.5, 4.2]} />
            <meshStandardMaterial color={activeColor} metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.94, -0.2]} rotation={[-0.1, 0, 0]} castShadow>
            <boxGeometry args={[1.7, 0.5, 2.0]} />
            <meshStandardMaterial color="#020617" metalness={0.9} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0.75, 0.5, 2.1]}>
            <boxGeometry args={[0.3, 0.12, 0.1]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={3} />
          </mesh>
          <mesh position={[-0.75, 0.5, 2.1]}>
            <boxGeometry args={[0.3, 0.12, 0.1]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={3} />
          </mesh>

          {/* Fallback sports car tail-lights with real glowing red bulbs */}
          <group position={[0, 0.5, -2.08]}>
            {[0.75, -0.75].map((x, idx) => (
              <group key={idx} position={[x, 0, 0]}>
                {/* Black housing box */}
                <mesh>
                  <boxGeometry args={[0.3, 0.14, 0.06]} />
                  <meshStandardMaterial color="#111827" metalness={0.9} />
                </mesh>
                {/* Metallic bulb socket */}
                <mesh position={[0, 0, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.02, 10]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.15} />
                </mesh>
                {/* Glowing red bulb sphere */}
                <mesh position={[0, 0, 0.025]}>
                  <sphereGeometry args={[0.052, 12, 12]} />
                  <meshStandardMaterial color="#ef4444" emissive="#ff0000" emissiveIntensity={5.5} />
                </mesh>
                {/* Yellow center filament */}
                <mesh position={[0, 0, 0.025]}>
                  <sphereGeometry args={[0.012, 8, 8]} />
                  <meshBasicMaterial color="#fef08a" />
                </mesh>
                {/* Outer clear lens cover */}
                <mesh position={[0, 0, 0.032]}>
                  <boxGeometry args={[0.28, 0.12, 0.02]} />
                  <meshStandardMaterial color="#ef4444" transparent opacity={0.4} roughness={0.01} />
                </mesh>
              </group>
            ))}
          </group>
        </>
      )}

      {/* --- ACTIVE REAR WING / SPOILER ASSEMBLY --- */}
      {spoiler !== 'none' && (
        <group position={[0, 1.22, -2.0]}>
          {spoiler === 'gt_wing' && (
            <>
              {/* Left Support Pillar */}
              <mesh position={[0.75, -0.25, 0]}>
                <boxGeometry args={[0.06, 0.45, 0.35]} />
                <meshStandardMaterial color="#020617" metalness={0.95} />
              </mesh>
              {/* Right Support Pillar */}
              <mesh position={[-0.75, -0.25, 0]}>
                <boxGeometry args={[0.06, 0.45, 0.35]} />
                <meshStandardMaterial color="#020617" metalness={0.95} />
              </mesh>
              {/* Aerodynamic Wing Blade */}
              <mesh position={[0, 0.02, 0]} castShadow>
                <boxGeometry args={[2.6, 0.08, 0.65]} />
                <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
              </mesh>
              {/* Wing Endplates */}
              <mesh position={[1.32, 0.02, 0]}>
                <boxGeometry args={[0.04, 0.35, 0.7]} />
                <meshStandardMaterial color="#020617" metalness={0.95} />
              </mesh>
              <mesh position={[-1.32, 0.02, 0]}>
                <boxGeometry args={[0.04, 0.35, 0.7]} />
                <meshStandardMaterial color="#020617" metalness={0.95} />
              </mesh>
            </>
          )}

          {spoiler === 'vortex' && (
            <>
              {/* Low profile sleek dual mounts */}
              <mesh position={[0.6, -0.32, 0]}>
                <boxGeometry args={[0.1, 0.25, 0.3]} />
                <meshStandardMaterial color="#0f172a" metalness={0.95} />
              </mesh>
              <mesh position={[-0.6, -0.32, 0]}>
                <boxGeometry args={[0.1, 0.25, 0.3]} />
                <meshStandardMaterial color="#0f172a" metalness={0.95} />
              </mesh>
              {/* Vortex dual blade */}
              <mesh position={[0, -0.2, 0]} castShadow>
                <boxGeometry args={[2.4, 0.05, 0.5]} />
                <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh position={[0, -0.05, -0.1]} castShadow>
                <boxGeometry args={[2.5, 0.05, 0.45]} />
                <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
              </mesh>
            </>
          )}

          {spoiler === 'hyper_aero' && (
            <>
              {/* Curved sci-fi center support */}
              <mesh position={[0, -0.2, 0.1]} rotation={[0.2, 0, 0]}>
                <boxGeometry args={[0.5, 0.4, 0.2]} />
                <meshStandardMaterial color="#020617" metalness={0.95} />
              </mesh>
              {/* Floating hyper wing */}
              <mesh position={[0, 0.1, -0.15]} castShadow>
                <boxGeometry args={[2.9, 0.06, 0.75]} />
                <meshStandardMaterial color={activeColor} metalness={0.95} roughness={0.1} />
              </mesh>
              {/* Aerodynamic wingtips curled down */}
              <mesh position={[1.45, 0.01, -0.15]} rotation={[0, 0, -0.4]}>
                <boxGeometry args={[0.04, 0.25, 0.75]} />
                <meshStandardMaterial color="#020617" metalness={0.95} />
              </mesh>
              <mesh position={[-1.45, 0.01, -0.15]} rotation={[0, 0, 0.4]}>
                <boxGeometry args={[0.04, 0.25, 0.75]} />
                <meshStandardMaterial color="#020617" metalness={0.95} />
              </mesh>
            </>
          )}
        </group>
      )}

      {/* High Performance Alloy Wheels & Brake Discs */}
      {[
        { pos: [1.18, 0.42, 1.3] as [number, number, number] },
        { pos: [-1.18, 0.42, 1.3] as [number, number, number] },
        { pos: [1.18, 0.42, -1.3] as [number, number, number] },
        { pos: [-1.18, 0.42, -1.3] as [number, number, number] },
      ].map((w, i) => {
        // Front wheels turn in 3D in response to steering wheel rotation
        const wheelSteerRot = i < 2 ? -(steeringAngle / 360) * 0.45 : 0;
        return (
          <group 
            key={i} 
            ref={el => { steerWheelRefs.current[i] = el; }} 
            position={w.pos} 
            rotation={[0, wheelSteerRot, 0]}
          >
            {/* Spinning Tire Group */}
            <group 
              ref={el => { spinWheelRefs.current[i] = el; }} 
              rotation={[wheelSpinAngle, 0, 0]}
            >
              {/* Tread Rubber Tire touching ground at radius 0.42 */}
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
                <cylinderGeometry args={[0.42, 0.42, 0.42, 28]} />
                <meshStandardMaterial color="#0b0f19" roughness={0.92} metalness={0.1} />
              </mesh>
              {/* Metallic Alloy Rim Base */}
              <group rotation={[0, 0, Math.PI / 2]} position={[i % 2 === 0 ? 0.02 : -0.02, 0, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.29, 0.29, 0.44, 18]} />
                  <meshStandardMaterial color="#e2e8f0" metalness={0.96} roughness={0.08} />
                </mesh>
                {/* 5-Spoke Star Design on Alloy Wheel */}
                {[0, 72, 144, 216, 288].map((deg) => (
                  <mesh key={deg} rotation={[0, (deg * Math.PI) / 180, 0]}>
                    <boxGeometry args={[0.05, 0.42, 0.1]} />
                    <meshStandardMaterial color="#64748b" metalness={0.98} roughness={0.1} />
                  </mesh>
                ))}
              </group>
            </group>
            {/* Sport Brake Disc & Red Caliper (Mounted to axle) */}
            <mesh position={[0, 0.08, 0]}>
              <cylinderGeometry args={[0.22, 0.22, 0.06, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.14, 0.06]}>
              <boxGeometry args={[0.18, 0.14, 0.18]} />
              <meshStandardMaterial color="#dc2626" metalness={0.8} />
            </mesh>
          </group>
        );
      })}

      {/* --- REALISTIC PHYSICAL 3D SIDE MIRRORS ASSEMBLY --- */}
      <group>
        {/* Left Side Mirror */}
        <group position={[-1.23, 0.84, 0.45]}>
          {/* Mounting Bracket / Base plate on the door */}
          <mesh castShadow>
            <boxGeometry args={[0.06, 0.12, 0.16]} />
            <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.2} />
          </mesh>
          
          {/* Sleek Aerodynamic Mounting Arm / Stalk */}
          <mesh position={[-0.08, 0.02, 0]} rotation={[0, 0, 0.25]} castShadow>
            <boxGeometry args={[0.18, 0.04, 0.06]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.1} />
          </mesh>
          
          {/* Main Aerodynamic Mirror Housing Shell */}
          <group position={[-0.18, 0.05, -0.02]}>
            {/* Housing Body Cover (Body-colored matching the car) */}
            <mesh castShadow>
              <boxGeometry args={[0.26, 0.14, 0.16]} />
              <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
            </mesh>
            
            {/* High-tech Carbon Fiber Housing Trim/Backing */}
            <mesh position={[0.02, 0, 0.02]} castShadow>
              <boxGeometry args={[0.24, 0.12, 0.14]} />
              <meshStandardMaterial color="#0b1329" metalness={0.9} roughness={0.3} />
            </mesh>
            
            {/* Embedded Glowing LED Indicator Strip (Facing forward / +Z) */}
            <mesh position={[0, 0, 0.082]}>
              <boxGeometry args={[0.16, 0.025, 0.01]} />
              <meshStandardMaterial color="#f97316" emissive="#fb923c" emissiveIntensity={5} />
            </mesh>
            
            {/* Recessed Mirror Glass Holder / Frame (Facing rear / -Z) */}
            <mesh position={[0, 0, -0.081]}>
              <boxGeometry args={[0.23, 0.11, 0.01]} />
              <meshStandardMaterial color="#020617" metalness={0.95} roughness={0.4} />
            </mesh>
            
            {/* Real reflective Mirror Glass Lens (Angled 8° inward towards the driver) */}
            <mesh position={[-0.01, 0, -0.083]} rotation={[0, -0.14, 0]}>
              <boxGeometry args={[0.21, 0.09, 0.01]} />
              <meshStandardMaterial color="#ffffff" metalness={1.0} roughness={0.0} emissive="#0f172a" emissiveIntensity={0.15} />
            </mesh>
          </group>
        </group>

        {/* Right Side Mirror */}
        <group position={[1.23, 0.84, 0.45]}>
          {/* Mounting Bracket / Base plate on the door */}
          <mesh castShadow>
            <boxGeometry args={[0.06, 0.12, 0.16]} />
            <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.2} />
          </mesh>
          
          {/* Sleek Aerodynamic Mounting Arm / Stalk */}
          <mesh position={[0.08, 0.02, 0]} rotation={[0, 0, -0.25]} castShadow>
            <boxGeometry args={[0.18, 0.04, 0.06]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.1} />
          </mesh>
          
          {/* Main Aerodynamic Mirror Housing Shell */}
          <group position={[0.18, 0.05, -0.02]}>
            {/* Housing Body Cover (Body-colored matching the car) */}
            <mesh castShadow>
              <boxGeometry args={[0.26, 0.14, 0.16]} />
              <meshStandardMaterial color={activeColor} metalness={0.85} roughness={0.15} />
            </mesh>
            
            {/* High-tech Carbon Fiber Housing Trim/Backing */}
            <mesh position={[-0.02, 0, 0.02]} castShadow>
              <boxGeometry args={[0.24, 0.12, 0.14]} />
              <meshStandardMaterial color="#0b1329" metalness={0.9} roughness={0.3} />
            </mesh>
            
            {/* Embedded Glowing LED Indicator Strip (Facing forward / +Z) */}
            <mesh position={[0, 0, 0.082]}>
              <boxGeometry args={[0.16, 0.025, 0.01]} />
              <meshStandardMaterial color="#f97316" emissive="#fb923c" emissiveIntensity={5} />
            </mesh>
            
            {/* Recessed Mirror Glass Holder / Frame (Facing rear / -Z) */}
            <mesh position={[0, 0, -0.081]}>
              <boxGeometry args={[0.23, 0.11, 0.01]} />
              <meshStandardMaterial color="#020617" metalness={0.95} roughness={0.4} />
            </mesh>
            
            {/* Real reflective Mirror Glass Lens (Angled 8° inward towards the driver) */}
            <mesh position={[0.01, 0, -0.083]} rotation={[0, 0.14, 0]}>
              <boxGeometry args={[0.21, 0.09, 0.01]} />
              <meshStandardMaterial color="#ffffff" metalness={1.0} roughness={0.0} emissive="#0f172a" emissiveIntensity={0.15} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Underglow Neon Light Aura */}
      {underglow && underglow !== 'transparent' ? (
        <group>
          <pointLight position={[0, -0.05, 0]} color={underglow} intensity={3.5} distance={6} />
          <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.2, 4.0]} />
            <meshBasicMaterial color={underglow} transparent opacity={0.6} />
          </mesh>
        </group>
      ) : (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.2, 4.0]} />
          <meshBasicMaterial color={activeColor} transparent opacity={0.2} />
        </mesh>
      )}

      {/* Nitro / Drift Exhaust Flames & Smoke */}
      {drifting && (
        <>
          <mesh position={[0.4, 0.32, -2.7]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.25, 0.9, 12]} />
            <meshBasicMaterial color="#06b6d4" />
          </mesh>
          <mesh position={[-0.4, 0.32, -2.7]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.25, 0.9, 12]} />
            <meshBasicMaterial color="#06b6d4" />
          </mesh>
          <mesh position={[1.2, 0.2, -1.6]}>
            <sphereGeometry args={[0.45, 8, 8]} />
            <meshBasicMaterial color="#cbd5e1" transparent opacity={0.6} />
          </mesh>
          <mesh position={[-1.2, 0.2, -1.6]}>
            <sphereGeometry args={[0.45, 8, 8]} />
            <meshBasicMaterial color="#cbd5e1" transparent opacity={0.6} />
          </mesh>
        </>
      )}

      {/* Headlight Light for Local Player */}
      {isLocal && (
        <pointLight
          position={[0, 1.2, 4.0]}
          intensity={8}
          color="#38bdf8"
          distance={45}
        />
      )}
    </group>
  );
};

const Tree = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      {/* Wood Trunk with bark shadow */}
      <mesh position={[0, 3, 0]} castShadow geometry={CYLINDER_GEOM}>
        <meshStandardMaterial color="#3e2723" roughness={0.9} />
      </mesh>
      {/* Tier 1 Pine Foliage */}
      <mesh position={[0, 7.5, 0]} castShadow geometry={CONE_GEOM} scale={[4.2, 8.5, 4.2]}>
        <meshStandardMaterial color="#14532d" roughness={0.7} />
      </mesh>
      {/* Tier 2 Pine Foliage */}
      <mesh position={[0, 11.5, 0]} castShadow geometry={CONE_GEOM} scale={[3.4, 7, 3.4]}>
        <meshStandardMaterial color="#15803d" roughness={0.65} />
      </mesh>
      {/* Tier 3 Top Needle Tip */}
      <mesh position={[0, 15, 0]} castShadow geometry={CONE_GEOM} scale={[2.2, 5, 2.2]}>
        <meshStandardMaterial color="#16a34a" roughness={0.6} />
      </mesh>
    </group>
  );
};

const OakTree = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 3.5, 0]} castShadow geometry={CYLINDER_GEOM} scale={[1.2, 7, 1.2]}>
        <meshStandardMaterial color="#4a2e19" roughness={0.95} />
      </mesh>
      {/* Leafy Canopy Clusters */}
      <mesh position={[0, 9, 0]} castShadow geometry={DODECAHEDRON_GEOM} scale={[5.5, 5, 5.5]}>
        <meshStandardMaterial color="#1b4332" roughness={0.8} />
      </mesh>
      <mesh position={[-2, 10.5, 1.5]} castShadow geometry={DODECAHEDRON_GEOM} scale={[3.8, 3.8, 3.8]}>
        <meshStandardMaterial color="#2d6a4f" roughness={0.75} />
      </mesh>
      <mesh position={[2, 11, -1]} castShadow geometry={DODECAHEDRON_GEOM} scale={[3.5, 3.5, 3.5]}>
        <meshStandardMaterial color="#40916c" roughness={0.7} />
      </mesh>
    </group>
  );
};

const Rock = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow receiveShadow geometry={DODECAHEDRON_GEOM}>
        <meshStandardMaterial color="#475569" roughness={0.95} metalness={0.05} />
      </mesh>
      {/* Moss Patch on Rock Top */}
      <mesh position={[0, 0.4, 0]} scale={[0.8, 0.3, 0.8]}>
        <meshStandardMaterial color="#365314" roughness={0.9} />
      </mesh>
    </group>
  );
};

// Majestic 3D Mountain Horizon Range surrounding the circuit perimeter
const MountainRange = () => {
  const mountains = useMemo(() => {
    const list: { x: number; z: number; scale: [number, number, number]; rot: number; color: string }[] = [];
    const count = 48;
    const radius = 2400;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = radius + (Math.sin(i * 3) * 200);
      const x = Math.cos(angle) * dist + 600;
      const z = Math.sin(angle) * dist + 450;
      const height = 180 + Math.abs(Math.sin(i * 5.7)) * 260;
      const width = 280 + Math.abs(Math.cos(i * 2.3)) * 220;
      const rot = Math.sin(i) * Math.PI;
      const color = i % 2 === 0 ? '#334155' : '#1e293b';
      list.push({ x, z, scale: [width, height, width], rot, color });
    }
    return list;
  }, []);

  return (
    <group>
      {mountains.map((m, i) => (
        <group key={i} position={[m.x, m.scale[1] / 2 - 10, m.z]} rotation={[0, m.rot, 0]}>
          {/* Main Mountain Body */}
          <mesh castShadow receiveShadow geometry={CONE_GEOM} scale={m.scale}>
            <meshStandardMaterial color={m.color} roughness={0.95} metalness={0.1} />
          </mesh>
          {/* Snow-Capped Peak */}
          <mesh position={[0, m.scale[1] * 0.38, 0]} geometry={CONE_GEOM} scale={[m.scale[0] * 0.28, m.scale[1] * 0.25, m.scale[2] * 0.28]}>
            <meshStandardMaterial color="#f8fafc" roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Trackside Sponsor Billboard
const SponsorBoard = ({ position, rotation, label, color = '#dc2626' }: { position: [number, number, number], rotation: number, label: string, color?: string }) => {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Left Frame Post */}
      <mesh position={[-12, 4, 0]} castShadow>
        <boxGeometry args={[0.8, 8, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>
      {/* Right Frame Post */}
      <mesh position={[12, 4, 0]} castShadow>
        <boxGeometry args={[0.8, 8, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>
      {/* Main Banner Board */}
      <mesh position={[0, 6.5, 0]} castShadow>
        <boxGeometry args={[25, 3.8, 0.6]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </mesh>
      {/* White Trim Border */}
      <mesh position={[0, 6.5, 0.35]}>
        <boxGeometry args={[25.2, 4.0, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
    </group>
  );
};

// 3D Start / Finish Overhead Arch
const FinishArch = ({ position }: { position: [number, number, number] }) => {
  return (
    <group position={position}>
      {/* Left Structural Truss Pillar */}
      <mesh position={[0, 14, 58]} castShadow>
        <boxGeometry args={[5, 28, 5]} />
        <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Right Structural Truss Pillar */}
      <mesh position={[0, 14, -58]} castShadow>
        <boxGeometry args={[5, 28, 5]} />
        <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Overhead Truss Bridge */}
      <mesh position={[0, 25, 0]} castShadow>
        <boxGeometry args={[7, 5, 120]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Glowing Sponsor Race Banner */}
      <mesh position={[0, 25, 0]}>
        <boxGeometry args={[7.5, 3.5, 76]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.8} />
      </mesh>
      {/* Overhead High-Power Spotlights */}
      <pointLight position={[0, 22, 20]} intensity={16} distance={100} color="#fef08a" />
      <pointLight position={[0, 22, -20]} intensity={16} distance={100} color="#fef08a" />
    </group>
  );
};

// 3D Trackside Street Lamp
const StreetLamp = ({ position, rotation = 0 }: { position: [number, number, number], rotation?: number }) => {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Vertical Post */}
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 16, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.8} />
      </mesh>
      {/* Curved Arm */}
      <mesh position={[2, 16, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <boxGeometry args={[4, 0.3, 0.3]} />
        <meshStandardMaterial color="#475569" metalness={0.8} />
      </mesh>
      {/* Lamp Head */}
      <mesh position={[3.8, 15, 0]}>
        <boxGeometry args={[1, 0.4, 1.2]} />
        <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={4} />
      </mesh>
      {/* Glowing Cone Beam Effect */}
      <mesh position={[3.8, 7.5, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[8, 15, 12, 1, true]} />
        <meshBasicMaterial color="#fef08a" transparent opacity={0.08} depthWrite={false} />
      </mesh>
    </group>
  );
};

const TrackMesh = () => {
  const segments = useMemo(() => {
    return TRACK_SEGMENTS.map((seg, i) => {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (seg.start.x + seg.end.x) / 2;
      const centerY = (seg.start.y + seg.end.y) / 2;
      return { length, angle, centerX, centerY, start: seg.start, end: seg.end, id: i };
    });
  }, []);

  const corners = useMemo(() => {
    return TRACK_SEGMENTS.map((seg) => seg.start);
  }, []);

  // Generate procedural realistic asphalt CanvasTexture with fine grain & tire skid marks
  const asphaltTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Base bright asphalt color
      ctx.fillStyle = '#5c677d';
      ctx.fillRect(0, 0, 512, 512);

      // Subtle rubber tire wear streaks
      ctx.strokeStyle = 'rgba(40, 48, 62, 0.2)';
      ctx.lineWidth = 18;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 90 + i * 85);
        ctx.lineTo(512, 90 + i * 85 + (Math.random() * 20 - 10));
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    return tex;
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
      {/* Deep Natural Terrain Grass Field */}
      <mesh position={[TRACK_WIDTH / 2, TRACK_HEIGHT / 2, -0.05]} receiveShadow>
        <planeGeometry args={[4500, 4500]} />
        <meshStandardMaterial color="#1b4d24" roughness={0.9} polygonOffset polygonOffsetFactor={10} polygonOffsetUnits={10} />
      </mesh>

      {/* Lighter Organic Grass Fairway Insets */}
      <mesh position={[650, 450, -0.02]} receiveShadow>
        <planeGeometry args={[2200, 1800]} />
        <meshStandardMaterial color="#23632f" roughness={0.85} polygonOffset polygonOffsetFactor={8} polygonOffsetUnits={8} />
      </mesh>

      {/* Corner Junction Circles (Base layer for corners under straight segments) */}
      {corners.map((pos, i) => (
        <group key={`corner-${i}`} position={[pos.x, pos.y, 0.1]}>
          {/* Outer Sand / Gravel Run-off Trap */}
          <mesh position={[0, 0, -0.01]} receiveShadow>
            <circleGeometry args={[TRACK_RADIUS + 16, 32]} />
            <meshStandardMaterial color="#d97706" roughness={0.98} polygonOffset polygonOffsetFactor={6} polygonOffsetUnits={6} />
          </mesh>

          {/* Main Asphalt Corner Junction */}
          <mesh receiveShadow>
            <circleGeometry args={[TRACK_RADIUS, 32]} />
            <meshStandardMaterial color="#64748b" roughness={0.6} metalness={0.08} polygonOffset polygonOffsetFactor={4} polygonOffsetUnits={4} />
          </mesh>

          {/* 3D Raised Red & White Racing Kerbs (Rumble Strips) on Corner Apex */}
          <mesh position={[0, 0, 0.25]} receiveShadow castShadow>
            <ringGeometry args={[TRACK_RADIUS - 1.5, TRACK_RADIUS + 3.2, 32]} />
            <meshStandardMaterial color="#dc2626" roughness={0.35} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
          </mesh>
          <mesh position={[0, 0, 0.27]} receiveShadow castShadow>
            <ringGeometry args={[TRACK_RADIUS - 0.2, TRACK_RADIUS + 1.8, 16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.25} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-5} />
          </mesh>
        </group>
      ))}

      {/* Main Track Asphalt Segments */}
      {segments.map((seg) => (
        <group key={seg.id}>
          {/* Real Asphalt Pavement */}
          <mesh position={[seg.centerX, seg.centerY, 0.12]} rotation={[0, 0, seg.angle]} receiveShadow>
            <planeGeometry args={[seg.length, TRACK_RADIUS * 2]} />
            <meshStandardMaterial map={asphaltTexture || undefined} color="#64748b" roughness={0.6} metalness={0.08} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
          </mesh>

          {/* Left Edge White Boundary Line */}
          <mesh position={[seg.centerX + Math.cos(seg.angle + Math.PI/2) * (TRACK_RADIUS - 1.8), seg.centerY + Math.sin(seg.angle + Math.PI/2) * (TRACK_RADIUS - 1.8), 0.16]} rotation={[0, 0, seg.angle]}>
            <planeGeometry args={[seg.length, 1.4]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.2} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>

          {/* Right Edge White Boundary Line */}
          <mesh position={[seg.centerX - Math.cos(seg.angle + Math.PI/2) * (TRACK_RADIUS - 1.8), seg.centerY - Math.sin(seg.angle + Math.PI/2) * (TRACK_RADIUS - 1.8), 0.16]} rotation={[0, 0, seg.angle]}>
            <planeGeometry args={[seg.length, 1.4]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.2} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>

          {/* Yellow Center Racing Lane Lines */}
          <mesh position={[seg.centerX, seg.centerY, 0.18]} rotation={[0, 0, seg.angle]}>
            <planeGeometry args={[seg.length, 1.4]} />
            <meshStandardMaterial color="#facc15" roughness={0.25} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>

          {/* Metallic Guardrails on Outer Track Perimeter */}
          <mesh position={[seg.centerX + Math.cos(seg.angle + Math.PI/2) * (TRACK_RADIUS + 4.5), seg.centerY + Math.sin(seg.angle + Math.PI/2) * (TRACK_RADIUS + 4.5), 1.4]} rotation={[0, 0, seg.angle]} castShadow>
            <boxGeometry args={[seg.length, 0.5, 2.4]} />
            <meshStandardMaterial color="#64748b" metalness={0.95} roughness={0.15} />
          </mesh>
          <mesh position={[seg.centerX - Math.cos(seg.angle + Math.PI/2) * (TRACK_RADIUS + 4.5), seg.centerY - Math.sin(seg.angle + Math.PI/2) * (TRACK_RADIUS + 4.5), 1.4]} rotation={[0, 0, seg.angle]} castShadow>
            <boxGeometry args={[seg.length, 0.5, 2.4]} />
            <meshStandardMaterial color="#64748b" metalness={0.95} roughness={0.15} />
          </mesh>
        </group>
      ))}

      {/* Trackside Sponsor Banners along Straightaways */}
      <SponsorBoard position={[300, 810, 0]} rotation={0} label="PIRELLI" color="#dc2626" />
      <SponsorBoard position={[600, 810, 0]} rotation={0} label="BREMBO" color="#0284c7" />
      <SponsorBoard position={[900, 810, 0]} rotation={0} label="TURBO" color="#d97706" />

      {/* Navigational Holographic Corner Arrows */}
      {TRACK_SEGMENTS.map((seg, i) => {
        const nextSeg = TRACK_SEGMENTS[(i + 1) % TRACK_SEGMENTS.length];
        const rotY = -nextSeg.angle + Math.PI / 2;
        
        // Push the arrow slightly forward into the corner intersection so it's visible as you approach
        // We put it exactly at the segment end point (the turn apex)
        return (
          <CornerArrow 
            key={`arrow-${i}`} 
            position={[seg.end.x, 1.5, seg.end.y]} 
            rotation={rotY} 
          />
        );
      })}

      {/* Grandstand Spectator Seating along Main Straightaway */}
      <group position={[450, 830, 0]}>
        <mesh position={[0, 0, 6]} castShadow receiveShadow>
          <boxGeometry args={[350, 36, 12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.7} />
        </mesh>
        {/* Canopy Roof */}
        <mesh position={[0, 0, 15]} castShadow>
          <boxGeometry args={[370, 42, 2.0]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.85} roughness={0.2} />
        </mesh>
      </group>

      {/* Checkered Start/Finish Grid Line */}
      <group position={[625, 750, 0.22]}>
        {[-40, -20, 0, 20, 40].map((offsetZ, idx) => (
          <mesh key={idx} position={[0, offsetZ, 0]}>
            <planeGeometry args={[16, 8]} />
            <meshStandardMaterial color={idx % 2 === 0 ? "#f8fafc" : "#020617"} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const OpponentCar = ({ player }: { player: Player }) => {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(player.x || 0, 0.125, player.y || 0));
  const targetRot = useRef(- (player.angle || 0) + Math.PI / 2);

  useFrame((state, delta) => {
    if (groupRef.current) {
        targetPos.current.set(player.x || 0, 0.125, player.y || 0);
        targetRot.current = -(player.angle || 0) + Math.PI / 2;
        
        const currentPos = groupRef.current.position;
        // If the car is initialized at origin or far away, warp instantly instead of sliding across screen
        if (currentPos.lengthSq() === 0 || currentPos.distanceTo(targetPos.current) > 100) {
          groupRef.current.position.copy(targetPos.current);
          groupRef.current.rotation.y = targetRot.current;
        } else {
          // Responsive interpolation for silky smooth gameplay
          const lerpFactor = 1 - Math.pow(1 - 0.35, delta * 60);
          groupRef.current.position.lerp(targetPos.current, lerpFactor);
          
          // Angular shortest distance calculation to prevent 360-degree rotation glitches when wrapping angles
          const currentRotY = groupRef.current.rotation.y;
          let diff = targetRot.current - currentRotY;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          groupRef.current.rotation.y = currentRotY + diff * lerpFactor;
        }
    }
  });

  return (
    <group ref={groupRef}>
        <CarModel 
            color={player.color || '#ef4444'} 
            drifting={player.drifting} 
            carConfig={(player as any).carConfig}
            scale={3.2}
            speed={player.speed || 0}
        />

    </group>
  );
};

const CornerArrow = ({ position, rotation }: { position: [number, number, number], rotation: number }) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  
  const arrowShape = useMemo(() => {
    const shape = new THREE.Shape();
    // Start at bottom left of the stem
    shape.moveTo(-1.5, -3);
    // Bottom right of stem
    shape.lineTo(1.5, -3);
    // Top right of stem
    shape.lineTo(1.5, 1);
    // Right point of arrow head
    shape.lineTo(3.5, 1);
    // Top point of arrow head
    shape.lineTo(0, 4.5);
    // Left point of arrow head
    shape.lineTo(-3.5, 1);
    // Top left of stem
    shape.lineTo(-1.5, 1);
    // Back to start
    shape.lineTo(-1.5, -3);
    return shape;
  }, []);

  useFrame((state) => {
    if (groupRef.current && matRef.current) {
      const t = state.clock.getElapsedTime();
      // Gentle floating animation
      groupRef.current.position.y = position[1] + Math.sin(t * 5 + position[0]) * 0.4;
      // Pulsing opacity
      const opacity = 0.4 + Math.sin(t * 8 + position[0]) * 0.4;
      matRef.current.opacity = opacity;
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]} ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
         <shapeGeometry args={[arrowShape]} />
         <meshBasicMaterial ref={matRef} color="#22d3ee" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const GameScene = ({ 
  localPlayerRef, 
  players, 
  myId,
  carConfig,
  raceStartTime,
  updatePhysicsRef
}: { 
  localPlayerRef: React.MutableRefObject<any>, 
  players: Record<string, Player>, 
  myId: string | null,
  carConfig: CarConfig,
  raceStartTime: number,
  updatePhysicsRef?: React.MutableRefObject<((delta: number) => void) | null>
}) => {
  const { camera } = useThree();
  const carRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (updatePhysicsRef && updatePhysicsRef.current) {
      updatePhysicsRef.current(delta);
    }
    
    if (localPlayerRef.current && carRef.current) {
      const p = localPlayerRef.current;
      const px = (typeof p.x === 'number' && !isNaN(p.x)) ? p.x : 650;
      const py = (typeof p.y === 'number' && !isNaN(p.y)) ? p.y : 750;
      const angle = (typeof p.angle === 'number' && !isNaN(p.angle)) ? p.angle : Math.PI;

      carRef.current.position.set(px, 0.125, py);
      carRef.current.rotation.y = -angle + Math.PI/2; 

      const currentSpeed = Math.abs(p.speed || 0);
      const speedRatio = Math.min(1, currentSpeed / NITRO_SPEED);

      // Professional Chase Camera distance & height sweet spot (keeps car perfectly scaled, large, and visible)
      const dist = 16.5; 
      const height = 6.8; 
      
      const rawCamX = px - Math.cos(angle) * dist;
      const rawCamZ = py - Math.sin(angle) * dist;

      const finalCamX = rawCamX;
      const finalCamZ = rawCamZ;

      const lerpFactor = 1 - Math.pow(1 - 0.22, delta * 60);

      // Fixed FOV so accelerating never makes the vehicle shrink on screen
      const targetFov = 56;
      if (state.camera instanceof THREE.PerspectiveCamera) {
        state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, targetFov, lerpFactor);
        state.camera.updateProjectionMatrix();
      }

      // Smooth subtle nitro vibration only when nitro is active
      const nitroShakeX = p.isNitro ? (Math.random() - 0.5) * 0.15 : 0;
      const nitroShakeY = p.isNitro ? (Math.random() - 0.5) * 0.15 : 0;
      
      // Cinematic Intro Fly-in from Background Track Overview to Driver's Vehicle
      const INTRO_DURATION = 3200; // 3.2s
      const elapsed = Date.now() - raceStartTime;
      const introProgress = Math.min(1.0, Math.max(0, elapsed / INTRO_DURATION));

      if (introProgress < 1.0) {
        // Smooth cubic ease-out curve
        const ease = 1 - Math.pow(1 - introProgress, 3);

        // Background Track Overview Camera starting position (elevated scenic view of whole circuit)
        const startCamX = 650;
        const startCamY = 160;
        const startCamZ = 1200;

        const startLookX = 650;
        const startLookY = 0;
        const startLookZ = 450;

        const curCamX = THREE.MathUtils.lerp(startCamX, finalCamX, ease);
        const curCamY = THREE.MathUtils.lerp(startCamY, height, ease);
        const curCamZ = THREE.MathUtils.lerp(startCamZ, finalCamZ, ease);

        const curLookX = THREE.MathUtils.lerp(startLookX, px, ease);
        const curLookY = THREE.MathUtils.lerp(startLookY, 1.8, ease);
        const curLookZ = THREE.MathUtils.lerp(startLookZ, py, ease);

        state.camera.position.set(curCamX, curCamY, curCamZ);
        state.camera.lookAt(curLookX, curLookY, curLookZ);
      } else {
        // Rigid attachment to eliminate camera-chase physics jitter
        state.camera.position.set(finalCamX + nitroShakeX, height + nitroShakeY, finalCamZ);
        state.camera.lookAt(px, 1.8, py);
      }

      // 4D Web Audio Engine Sound Update
      const isGasActive = p.keys['ArrowUp'] || p.keys['KeyW'] || p.keys['TouchAccel'];
      const isBrakeActive = p.keys['ArrowDown'] || p.keys['KeyS'] || p.keys['TouchBrake'];
      const isTurning = p.keys['ArrowLeft'] || p.keys['KeyA'] || p.keys['TouchLeft'] || p.keys['ArrowRight'] || p.keys['KeyD'] || p.keys['TouchRight'];
      engineAudio.update(speedRatio, p.isNitro, !!isGasActive, !!isBrakeActive, !!isTurning);

      // 4D Tactile Force Feedback Vibration (Mobile / Gamepad Haptics)
      if (typeof navigator !== 'undefined' && navigator.vibrate && (p.isNitro || p.drifting || currentSpeed > 10)) {
        if (Math.random() < 0.2) {
          navigator.vibrate(p.isNitro ? [12, 8, 12] : 8);
        }
      }
    }
  });

  return (
    <>
      <ambientLight intensity={1.8} color="#ffffff" />
      <hemisphereLight args={['#bae6fd', '#16a34a', 1.5]} />
      <directionalLight 
        position={[600, 700, 425]} 
        intensity={2.8} 
        color="#fffbeb"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-800}
        shadow-camera-right={800}
        shadow-camera-top={800}
        shadow-camera-bottom={-800}
        shadow-camera-far={1800}
      />
      <directionalLight 
        position={[-400, 450, -300]} 
        intensity={1.4} 
        color="#e0f2fe" 
      />
      
      <TrackMesh />
      <MountainRange />

      {/* Start / Finish Overhead Arch */}
      <FinishArch position={[625, 0, 750]} />

      {/* Trackside Street Lamps */}
      {STREET_LAMPS.map((lamp, i) => (
        <StreetLamp key={i} position={lamp.pos} rotation={lamp.rot} />
      ))}
      
      {SCENERY_DECORATIONS.map((item, i) => (
        item.type === 'tree' ? (
          i % 2 === 0 ? (
            <Tree key={i} position={item.pos} scale={item.scale} />
          ) : (
            <OakTree key={i} position={item.pos} scale={item.scale} />
          )
        ) : (
          <Rock key={i} position={item.pos} scale={item.scale} />
        )
      ))}
      
      <group ref={carRef}>
        <CarModel 
          color={carConfig.color} 
          isLocal 
          drifting={localPlayerRef.current?.drifting} 
          carConfig={carConfig}
          scale={3.2}
          steeringAngle={localPlayerRef.current?.steeringAngle || 0}
          pitch={localPlayerRef.current?.pitch || 0}
          roll={localPlayerRef.current?.roll || 0}
          speed={localPlayerRef.current?.speed || 0}
          localPlayerRef={localPlayerRef}
        />
      </group>
      
      {Object.values(players).map(p => {
        if (p.id === myId) return null;
        return <OpponentCar key={p.id} player={p} />;
      })}
    </>
  );
};

/* Circular Real-Time Mini-Map Overlay Component */
function MiniMap({
  localPlayerRef,
  players,
  myId,
}: {
  localPlayerRef: React.RefObject<{ x: number; y: number; angle: number }>;
  players: Record<string, Player>;
  myId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 112; // Base size in CSS pixels
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const TRACK_POINTS = [
      { x: 150, y: 500 },
      { x: 450, y: 500 },
      { x: 450, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 100 },
      { x: 750, y: 100 },
      { x: 750, y: 400 },
      { x: 600, y: 400 },
      { x: 600, y: 600 },
      { x: 950, y: 600 },
      { x: 950, y: 150 },
      { x: 1100, y: 150 },
      { x: 1100, y: 750 },
      { x: 150, y: 750 },
    ];

    const minX = 80;
    const maxX = 1170;
    const minY = 30;
    const maxY = 820;
    const worldW = maxX - minX;
    const worldH = maxY - minY;

    const scale = Math.min((size - 22) / worldW, (size - 22) / worldH);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const center = size / 2;

      // No background fill, transparent road structure
      ctx.clearRect(0, 0, size, size);

      // Draw track casing (outer border) - Bright grey for visibility on game background
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      TRACK_POINTS.forEach((pt, i) => {
        const cx = center + (pt.x - midX) * scale;
        const cy = center + (pt.y - midY) * scale;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.stroke();

      // Draw track main surface - Bright white road
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Start / Finish Line Indicator (Yellow Marker)
      const finishCx = center + (625 - midX) * scale;
      const finishCy = center + (750 - midY) * scale;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(finishCx, finishCy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Draw Opponent Players
      const currentPlayers = playersRef.current;
      Object.values(currentPlayers).forEach((p) => {
        if (p.id === myId) return;
        const cx = center + (p.x - midX) * scale;
        const cy = center + (p.y - midY) * scale;

        ctx.fillStyle = p.color || '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = p.color || '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(p.angle) * 5, cy + Math.sin(p.angle) * 5);
        ctx.stroke();
      });

      // Draw Local Player (You)
      const localP = localPlayerRef.current;
      const lx = localP ? localP.x : (currentPlayers[myId || '']?.x ?? 650);
      const ly = localP ? localP.y : (currentPlayers[myId || '']?.y ?? 750);
      const lAngle = localP ? localP.angle : (currentPlayers[myId || '']?.angle ?? Math.PI);

      const lcx = center + (lx - midX) * scale;
      const lcy = center + (ly - midY) * scale;

      // Glow aura for local player
      ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
      ctx.beginPath();
      ctx.arc(lcx, lcy, 6, 0, Math.PI * 2);
      ctx.fill();

      // Bright yellow dot for local player - larger
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(lcx, lcy, 5, 0, Math.PI * 2);
      ctx.fill();

      // Direction cone / arrow pointer - larger
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      const tipX = lcx + Math.cos(lAngle) * 10;
      const tipY = lcy + Math.sin(lAngle) * 10;
      const leftX = lcx + Math.cos(lAngle + 2.4) * 5;
      const leftY = lcy + Math.sin(lAngle + 2.4) * 5;
      const rightX = lcx + Math.cos(lAngle - 2.4) * 5;
      const rightY = lcy + Math.sin(lAngle - 2.4) * 5;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [localPlayerRef, myId]);

  return (
    <div className="relative flex flex-col items-center select-none pointer-events-auto">
      <div className="relative flex items-center justify-center overflow-visible">
        <canvas
          ref={canvasRef}
          className="w-20 h-20 sm:w-24 sm:h-24 block drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
        />
      </div>
    </div>
  );
}

export default function GameEngine({ 
  initialPlayers, 
  onQuit,
  walletState,
  kaspaPrice,
  onPurchaseKasItem
}: { 
  initialPlayers?: Record<string, Player>;
  onQuit?: () => void;
  walletState?: any;
  kaspaPrice?: number;
  onPurchaseKasItem?: (amountKas: number, itemName: string, itemMetadata: string) => Promise<boolean>;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const sanitizedInitial = useMemo(() => {
      if (!initialPlayers) return {};
      return Object.entries(initialPlayers).reduce((acc, [id, p]) => {
        acc[id] = { ...p, bestLapTime: p.bestLapTime || Infinity };
        return acc;
      }, {} as Record<string, Player>);
  }, [initialPlayers]);

  const [players, setPlayers] = useState<Record<string, Player>>(sanitizedInitial);
  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  const [myId, setMyId] = useState<string | null>(socket.id || null);
  const [activePeers, setActivePeers] = useState<string[]>([]);
  useEffect(() => {
    setActivePeers(getActivePeers());
    const unsubscribe = subscribeToP2PChanges(() => {
      setActivePeers(getActivePeers());
    });
    return () => unsubscribe();
  }, []);
  const lastUpdateRef = useRef<number>(0);
  const [champion, setChampion] = useState<{ winnerId: string; winnerName: string; winnerColor: string; lapCount?: number } | null>(null);

  useEffect(() => {
    const pIds = Object.keys(sanitizedInitial).sort();
    const currentId = socket.id || myId;
    const idx = currentId ? pIds.indexOf(currentId) : 0;
    if (idx !== -1) {
      // Alongside logic: same x (starting line), different y (lanes)
      // We group them in rows of 2 for a classic racing grid look
      const row = Math.floor(idx / 2);
      const lane = idx % 2; // 0 or 1
      
      // forward is negative x, so adding to x puts them further back
      localPlayer.current.x = 650 + (row * 15); 
      // y=750 is center, lanes at -15 and +15
      localPlayer.current.y = 750 + (lane === 0 ? -15 : 15);
    }
  }, []);

  const [laps, setLaps] = useState(0);
  const [, setLastLapTime] = useState<number | null>(null);
  const [currentLapStart, setCurrentLapStart] = useState<number>(Date.now());
  const [wrongWay, setWrongWay] = useState(false);
  const [redFlag, setRedFlag] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showGarage, setShowGarage] = useState(false);
  const [rewardNotify, setRewardNotify] = useState<string | null>(null);
  const [carConfig, setCarConfig] = useState<CarConfig>(() => {
    let unlockedIds: string[] = ['viper'];
    try {
      const savedUnlocked = localStorage.getItem('turbo_unlocked_cars');
      if (savedUnlocked) {
        const parsed = JSON.parse(savedUnlocked);
        if (Array.isArray(parsed) && parsed.length > 0) {
          unlockedIds = Array.from(new Set(['viper', ...parsed]));
        }
      }
    } catch {
      unlockedIds = ['viper'];
    }

    const saved = localStorage.getItem('turbo_car_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const selectedCarId = unlockedIds.includes(parsed.selectedCarId) ? parsed.selectedCarId : (unlockedIds[0] || 'viper');
        return {
          selectedCarId,
          color: parsed.color || '#3b82f6',
          upgrades: {
            engine: parsed.upgrades?.engine ?? 0,
            nos: parsed.upgrades?.nos ?? 0,
            tires: parsed.upgrades?.tires ?? 0,
            chassis: parsed.upgrades?.chassis ?? 0,
          },
          cosmetics: {
            underglowColor: parsed.cosmetics?.underglowColor || 'transparent',
            smokeColor: parsed.cosmetics?.smokeColor || '#ffffff',
            spoilerType: parsed.cosmetics?.spoilerType || 'none',
          }
        };
      } catch {
        // ignore
      }
    }
    return {
      selectedCarId: 'viper',
      color: '#3b82f6',
      upgrades: {
        engine: 0,
        nos: 0,
        tires: 0,
        chassis: 0,
      },
      cosmetics: {
        underglowColor: 'transparent',
        smokeColor: '#ffffff',
        spoilerType: 'none',
      }
    };
  });

  const handleSaveConfig = (newConfig: CarConfig) => {
    setCarConfig(newConfig);
    localStorage.setItem('turbo_car_config', JSON.stringify(newConfig));
    if (socket.connected) {
      socket.emit('updateCarConfig', newConfig);
    }
  };

  // Touch device detection & state
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(false);

  const timerRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const rpmBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    setIsTouchDevice(hasTouch);
    setShowTouchControls(hasTouch);
  }, []);

  const formatTime = (ms: number) => {
      if (ms === Infinity || !ms) return "--:--";
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const rs = s % 60;
      const msPart = Math.floor((ms % 1000) / 10);
      return `${m}:${rs.toString().padStart(2, '0')}.${msPart.toString().padStart(2, '0')}`;
  };
  
  const localPlayer = useRef<{
    x: number;
    y: number;
    angle: number;
    speed: number;
    keys: Record<string, boolean>;
    checkpoint: number;
    nitro: number;
    drifting: boolean;
    wrongWayTimer: number | null;
    lapCount: number;
    steeringAngle?: number;
    pitch?: number;
    roll?: number;
    lastSpeed?: number;
    throttle?: number;
    manualGear?: number;
    autoDrive?: boolean;
    redFlagActive?: boolean;
    redFlagEndTime?: number;
  }>({
    x: 650,
    y: 750,
    angle: Math.PI,
    speed: 0,
    keys: {},
    checkpoint: 3,
    nitro: 100,
    drifting: false,
    wrongWayTimer: null,
    lapCount: 0,
    throttle: 0,
    manualGear: 1,
    autoDrive: false,
    redFlagActive: false,
    redFlagEndTime: 0,
  });

  const [raceStartTime, setRaceStartTime] = useState<number>(() => Date.now());
  const [countdownText, setCountdownText] = useState<string | null>('3');

  useEffect(() => {
    setCountdownText('3');
    const t1 = setTimeout(() => setCountdownText('2'), 800);
    const t2 = setTimeout(() => setCountdownText('1'), 1600);
    const t3 = setTimeout(() => setCountdownText('GO!'), 2400);
    const t4 = setTimeout(() => setCountdownText(null), 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [raceStartTime]);

  const processMovement = useCallback((p: Player) => {
      if (!p || !p.id) {
          // console.warn("Invalid player data received in processMovement:", p);
          return;
      }
      setPlayers((prev) => {
        if (p.id === socket.id) return prev;
        const existing = prev[p.id] || {};
        return { 
          ...prev, 
          [p.id]: { 
            ...existing, 
            ...p, 
            bestLapTime: p.bestLapTime || (existing as any).bestLapTime || Infinity 
          } 
        };
      });
  }, []);

  const handleP2PData = useCallback((peerId: string, data: any) => {
    // console.log("P2P Data received:", data);
    if (data.type === 'playerMoved') {
        if (!data.player) {
            // console.error("Invalid player data in P2P:", data);
            return;
        }
        processMovement(data.player as Player);
    }
  }, [processMovement]);

  const handleRestartRace = useCallback(() => {
    const now = Date.now();
    setRaceStartTime(now);
    setCurrentLapStart(now + 2400);
    setLaps(0);
    const p = localPlayer.current;
    p.x = 650;
    p.y = 750;
    p.angle = Math.PI;
    p.speed = 0;
    p.throttle = 0;
    p.manualGear = 1;
    p.autoDrive = false;
    p.checkpoint = 3;
    p.lapCount = 0;
    p.wrongWayTimer = null;
    setWrongWay(false);
    setShowMenu(false);
    setChampion(null);
    
    // Reset all other players in state for visual sync
    setPlayers(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id] = {
          ...next[id],
          x: 650,
          y: 750,
          angle: Math.PI,
          speed: 0,
          laps: 0,
          isCrashed: false,
          isReady: false
        };
      });
      return next;
    });
  }, []);

  useEffect(() => {
      if (myId && players[myId]) {
          const p = players[myId];
          if (typeof p.x === 'number' && !isNaN(p.x)) {
            localPlayer.current.x = p.x;
          }
          if (typeof p.y === 'number' && !isNaN(p.y)) {
            localPlayer.current.y = p.y;
          }
          if (typeof p.angle === 'number' && !isNaN(p.angle)) {
            localPlayer.current.angle = p.angle;
          }
      }
  }, [myId]);

  const [particles, setParticles] = useState<{id: number, x: number, y: number, life: number, color?: string}[]>([]);
  const particleIdCounter = useRef(0);
  const particleCountRef = useRef(0);
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    const handleFirstInteraction = () => {
      engineAudio.init();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    engineAudio.init();

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // Performance Optimization Refs (Direct DOM updates to guarantee 60 FPS)
  const nitroPctRef = useRef<HTMLSpanElement>(null);
  const nitroBarRef = useRef<HTMLDivElement>(null);
  const steeringWheelRef = useRef<HTMLDivElement>(null);
  const carConfigRef = useRef(carConfig);
  carConfigRef.current = carConfig;

  // Frame Delta Time and ZK Proof Throttling Refs for Butter-Smooth Physics
  const lastPhysicsTimeRef = useRef<number>(performance.now());
  const lastProofTimeRef = useRef<number>(0);

  // Audio Control States
  const [engineAudioActive, setEngineAudioActive] = useState(true);
  const [musicTrackActive, setMusicTrackActive] = useState(true);

  // Flexible Steering Wheel State & Refs
  const steeringAngleRef = useRef<number>(0);
  const isDraggingWheelRef = useRef<boolean>(false);
  const wheelCenterRef = useRef<{ x: number; y: number } | null>(null);
  const startPointerAngleRef = useRef<number>(0);
  const startWheelAngleRef = useRef<number>(0);

  const toggleComboAudio = () => {
    const nextVal = !(engineAudioActive || musicTrackActive || audioEnabled);
    setAudioEnabled(nextVal);
    setEngineAudioActive(nextVal);
    setMusicTrackActive(nextVal);
    engineAudio.toggleCombo(nextVal);
  };

  const toggleEngineAudio = () => {
    const nextVal = !engineAudioActive;
    setEngineAudioActive(nextVal);
    engineAudio.setEngineEnabled(nextVal);
  };

  const toggleMusicTrack = () => {
    const nextVal = !musicTrackActive;
    setMusicTrackActive(nextVal);
    engineAudio.setMusicEnabled(nextVal);
  };

  const toggleAudio = () => {
    toggleComboAudio();
  };

  useEffect(() => {
    const handleConnect = () => {
      const id = socket.id;
      if (id) {
        setMyId(id);
        initializeP2P(id, handleP2PData).catch(err => {
          // console.warn('P2P initialization failed, falling back to socket only', err);
        });
      }
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on('connect', handleConnect);

    socket.on('playerJoinedRoom', (player: unknown) => {
      const p = player as Player;
      if (p.id !== socket.id && p.id) {
          try {
            connectToPeer(p.id, handleP2PData);
          } catch (err) {
            // console.warn('Failed to connect to peer:', p.id, err);
          }
      }
      setPlayers((prev) => ({ ...prev, [p.id]: { ...p, bestLapTime: p.bestLapTime || Infinity } }));
    });

    socket.on('playerMoved', async (player: unknown) => {
      const p = player as Player;
      processMovement(p);
    });

    socket.on('playerStateUpdated', (data: { id: string; state: any }) => {
      setPlayers((prev) => {
        if (data.id === socket.id) return prev;
        const existing = prev[data.id] || { id: data.id };
        return {
          ...prev,
          [data.id]: {
            ...existing,
            ...data.state,
            bestLapTime: (existing as any).bestLapTime || Infinity
          }
        };
      });
    });
    
    socket.on('lapUpdate', (data: {id: string, laps: number, bestLapTime: number}) => {
        setPlayers(prev => {
            if (!prev[data.id]) return prev;
            const serverBest = data.bestLapTime || Infinity;
            if (data.id === socket.id) {
                 const currentBest = prev[data.id].bestLapTime || Infinity;
                 if (serverBest > currentBest && currentBest !== Infinity) {
                     return prev;
                 }
            }

            return {
                ...prev,
                [data.id]: {
                    ...prev[data.id],
                    laps: data.laps,
                    bestLapTime: serverBest
                }
            };
        });

        // Trigger lap finished notification and badge for peer or self
        const isSelf = data.id === socket.id || data.id === myId;
        const playerName = isSelf ? 'YOU' : (playersRef.current[data.id]?.name || 'PEER RACER');
        let badgeIcon = '🥉';
        let badgeTitle = 'BRONZE LAP BADGE';
        if (data.laps >= 10) {
          badgeIcon = '🏆';
          badgeTitle = 'ULTIMATE CHAMPION CUP';
        } else if (data.laps >= 3) {
          badgeIcon = '🥇';
          badgeTitle = 'GOLD CHAMPION BADGE';
        } else if (data.laps === 2) {
          badgeIcon = '🥈';
          badgeTitle = 'SILVER LAP BADGE';
        } else if (data.laps > 3) {
          badgeIcon = '👑';
          badgeTitle = 'INFINITE CHAMPION BADGE';
        }

        setRewardNotify(`🏁 ${playerName} FINISHED LAP ${data.laps}! ${badgeIcon} ${badgeTitle} UNLOCKED`);
        setTimeout(() => setRewardNotify(null), 3500);
    });

    socket.on('roomPlayersUpdated', (playersList) => {
      setPlayers(playersList);
    });

    socket.on('playerDisconnected', (id: string) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on('raceWon', (data: { winnerId: string; winnerName: string; winnerColor: string }) => {
      setChampion(data);
    });

    socket.on('raceRestarted', () => {
      setChampion(null);
      handleRestartRace();
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('playerJoinedRoom');
      socket.off('playerMoved');
      socket.off('playerStateUpdated');
      socket.off('roomPlayersUpdated');
      socket.off('playerDisconnected');
      socket.off('lapUpdate');
      socket.off('raceWon');
      socket.off('raceRestarted');
    };
  }, []);

  const handleRematch = () => {
    setChampion(null);
    socket.emit('rematch');
  };

  const lastGasTapRef = useRef<number>(0);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);

  const triggerGasPress = useCallback(() => {
    const p = localPlayer.current;
    if (!p) return;
    const now = Date.now();
    const timeSinceLast = now - lastGasTapRef.current;
    lastGasTapRef.current = now;

    // Enable continuous auto-driving on gas controller click/tap
    p.autoDrive = true;

    if (timeSinceLast > 10 && timeSinceLast < 380) {
      // DOUBLE CLICK / DOUBLE TAP DETECTED: Enter Next Gear & Torque Shift Surge!
      const currentGear = p.manualGear || 1;
      const nextGear = Math.min(6, currentGear + 1);
      p.manualGear = nextGear;
      
      // Torque shift burst: add speed per 10 (0.5 * 20 = 10 km/h)
      p.throttle = 1.0;
      if (nextGear > currentGear) {
        p.speed += 0.5; // +10 km/h
      } else {
        p.speed += 0.22;
      }

      // Show floating HUD notification & vibration
      setShiftNotice(`GEAR ${nextGear} ENGAGED ⚡`);
      setTimeout(() => setShiftNotice(null), 1200);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([25, 40, 25]); } catch {}
      }
    } else {
      // SINGLE CLICK / TAP: Activate Auto-Drive at 20 km/h & start moving!
      if (Math.abs(p.speed) < 0.2) {
        p.speed = 0.4; // Gentle initial movement start towards 20 km/h
        p.throttle = 0.4;
      }
    }
  }, []);

  // Keyboard input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'ArrowUp' || e.code === 'KeyW') && !localPlayer.current.keys[e.code]) {
        triggerGasPress();
      }
      localPlayer.current.keys[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      localPlayer.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [triggerGasPress]);

  // Touch control trigger helpers
  const handleTouchKeyStart = useCallback((key: string) => {
    if (key === 'TouchAccel' && !localPlayer.current.keys['TouchAccel']) {
      triggerGasPress();
    }
    localPlayer.current.keys[key] = true;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {
        // Haptics fallback
      }
    }
  }, [triggerGasPress]);

  const handleTouchKeyEnd = useCallback((key: string) => {
    localPlayer.current.keys[key] = false;
  }, []);

  // Flexible Steering Wheel Rotary Drag Handlers
  const handleWheelPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const pointerAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    
    isDraggingWheelRef.current = true;
    wheelCenterRef.current = { x: centerX, y: centerY };
    startPointerAngleRef.current = pointerAngle;
    startWheelAngleRef.current = steeringAngleRef.current;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch {}
    }

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleWheelPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingWheelRef.current || !wheelCenterRef.current) return;
    e.preventDefault();
    const { x: centerX, y: centerY } = wheelCenterRef.current;
    const currentPointerAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    
    let delta = currentPointerAngle - startPointerAngleRef.current;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;

    let targetAngle = startWheelAngleRef.current + delta;
    targetAngle = Math.max(-180, Math.min(180, targetAngle));
    
    steeringAngleRef.current = targetAngle;
  }, []);

  const handleWheelPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingWheelRef.current) return;
    e.preventDefault();
    isDraggingWheelRef.current = false;
    wheelCenterRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  const updatePhysicsRef = useRef<((delta: number) => void) | null>(null);

  // Physics Logic Update
  updatePhysicsRef.current = (r3fDelta: number) => {
      const p = localPlayer.current;
      if (typeof p.x !== 'number' || isNaN(p.x)) p.x = 650;
      if (typeof p.y !== 'number' || isNaN(p.y)) p.y = 750;
      if (typeof p.angle !== 'number' || isNaN(p.angle)) p.angle = Math.PI;
      if (typeof p.speed !== 'number' || isNaN(p.speed)) p.speed = 0;

      // High Precision Delta Time Calculation for Smooth 60/90/120Hz Physics
      const dt = Math.min(0.064, r3fDelta);
      const timeScale = dt > 0 ? dt * 60 : 1.0;

      const oldX = p.x;
      const oldY = p.y;

      const isGasKeyHeld = p.keys['ArrowUp'] || p.keys['KeyW'] || p.keys['TouchAccel'];
      const isBrakePressed = p.keys['ArrowDown'] || p.keys['KeyS'] || p.keys['TouchBrake'];

      // Handle Red Flag active state penalty (movement lock check)
      if (p.redFlagActive) {
        if (Date.now() > (p.redFlagEndTime || 0)) {
          p.redFlagActive = false;
          setRedFlag(false);
        }
      }

      // Calculate dynamic physics spec modifiers based on car catalogue and current upgrades state
      const currentConfig = carConfigRef.current;
      const carData = CAR_CATALOGUE.find(c => c.id === currentConfig?.selectedCarId) || CAR_CATALOGUE[0];
      const engineLevel = UPGRADE_CATEGORIES.find(u => u.id === 'engine')?.levels[currentConfig?.upgrades?.engine ?? 0] || UPGRADE_CATEGORIES[0].levels[0];
      const nosLevel = UPGRADE_CATEGORIES.find(u => u.id === 'nos')?.levels[currentConfig?.upgrades?.nos ?? 0] || UPGRADE_CATEGORIES[1].levels[0];
      const tiresLevel = UPGRADE_CATEGORIES.find(u => u.id === 'tires')?.levels[currentConfig?.upgrades?.tires ?? 0] || UPGRADE_CATEGORIES[2].levels[0];
      const chassisLevel = UPGRADE_CATEGORIES.find(u => u.id === 'chassis')?.levels[currentConfig?.upgrades?.chassis ?? 0] || UPGRADE_CATEGORIES[3].levels[0];

      // Convert real km/h speeds to fit ThreeJS physics updates elegantly
      const speedScale = 12.0 / 280;
      const activeMaxSpeed = (carData.baseSpecs.topSpeed + engineLevel.speedDelta + nosLevel.speedDelta + chassisLevel.speedDelta) * speedScale;
      
      // Faster 0-100 times yield HIGHER acceleration values
      const final0to100Time = Math.max(1.1, carData.baseSpecs.acceleration - engineLevel.accelDelta - nosLevel.accelDelta - chassisLevel.accelDelta);
      const activeAcceleration = 0.042 * (3.2 / final0to100Time);

      // Tire compound and chassis weight affect cornering
      const finalHandling = carData.baseSpecs.handling + tiresLevel.handlingDelta + chassisLevel.handlingDelta;
      const activeTurnSpeed = 0.032 * (finalHandling / 7.5);

      // Nitro power factor
      const finalNitroPower = 1.0 + (carData.baseSpecs.nitroPower + nosLevel.nitroDelta) * 0.08;
      const activeNitroSpeed = activeMaxSpeed + 6.5 * finalNitroPower;
      const activeNitroAccel = 0.08 * finalNitroPower;

      // Smooth Throttle & Progressive Launch Torque Curve
      if (typeof p.throttle !== 'number') p.throttle = 0;

      // Acceleration (Locked during 3-2-1 countdown intro fly-in or red flag penalty)
      if (Date.now() - raceStartTime < 2400) {
        p.speed = 0;
        p.throttle = 0;
        p.autoDrive = false;
      } else if (p.redFlagActive) {
        p.speed = 0;
        p.throttle = 0;
        p.autoDrive = false;
      } else {
        if (isBrakePressed) {
          p.autoDrive = false; // Brakes disengage auto-drive
          p.throttle = 0;
          if (p.speed > 0.05) {
            // Flawless high-performance braking force to bring the car to a responsive halt
            p.speed = Math.max(0, p.speed - activeAcceleration * 3.8 * timeScale);
          } else {
            // Responsive reversing once stopped
            p.speed = Math.max(-activeMaxSpeed * 0.4, p.speed - activeAcceleration * 0.8 * timeScale);
          }
        } else if (isGasKeyHeld) {
          // Actively holding gas key: accelerate normally through gears
          p.throttle = Math.min(1.0, p.throttle + 0.25 * timeScale);
          const currentKmh = Math.abs(p.speed) * 20;
          
          // Gear speed thresholds
          const curGear = p.manualGear || 1;
          const gearCapKmh = curGear === 1 ? 50 : curGear === 2 ? 100 : curGear === 3 ? 155 : curGear === 4 ? 210 : curGear === 5 ? 265 : 340;

          // If reversing, brake to stop first before going forward
          if (p.speed < -0.05) {
            p.speed = Math.min(0, p.speed + activeAcceleration * 3.8 * timeScale);
          } else if (currentKmh < gearCapKmh) {
            const launchTorque = currentKmh < 35 ? (0.60 + 0.40 * (currentKmh / 35)) : 1.0;
            p.speed += activeAcceleration * p.throttle * launchTorque * 1.5 * timeScale;
          } else {
            const nextGear = Math.min(6, curGear + 1);
            p.manualGear = nextGear;
            if (nextGear > curGear) {
              p.speed += 0.5; // Gear adds speed per 10
            }
            p.speed += activeAcceleration * 0.55 * timeScale;
          }
        } else if (p.autoDrive) {
          // Auto-drive active via gas click: maintain a comfortable, steady cruising speed of 20 km/h
          const cruiseSpeed = 1.0; // Exactly 20 km/h - perfect for support with steering controller buttons
          p.throttle = 0.35;
          if (p.speed < cruiseSpeed) {
            p.speed += activeAcceleration * 0.3 * timeScale;
          } else if (p.speed > cruiseSpeed + 0.1) {
            p.speed = Math.max(cruiseSpeed, p.speed * Math.pow(0.97, timeScale));
          }
          p.manualGear = 1; // Stay in 1st gear for 20 km/h
        } else {
          p.throttle = Math.max(0, p.throttle - 0.20 * timeScale);
          p.speed *= Math.pow(0.965, timeScale); // Improved friction so the car slows down naturally
        }
      }

      // Nitro (Only triggered by dedicated Nitro button or Shift keys)
      const isNitroActive = (p.keys['ShiftLeft'] || p.keys['ShiftRight'] || p.keys['TouchNitro']) && p.nitro > 0;
      if (isNitroActive) {
          p.speed += activeNitroAccel * timeScale;
          p.nitro = Math.max(0, p.nitro - 0.8 * timeScale);
      } else {
          p.nitro = Math.min(100, p.nitro + 0.25 * timeScale);
      }
      
      // Performance optimized direct DOM updates for Nitro
      if (nitroPctRef.current) {
        nitroPctRef.current.innerText = `${Math.round(p.nitro)}%`;
      }
      if (nitroBarRef.current) {
        nitroBarRef.current.style.width = `${p.nitro}%`;
      }

      // Real-World Multi-Turn Steering Wheel & Keyboard Dynamics (540° lock-to-lock)
      let keyTargetAngle = 0;
      if (p.keys['ArrowLeft'] || p.keys['KeyA'] || p.keys['TouchLeft']) {
        keyTargetAngle -= 120;
      }
      if (p.keys['ArrowRight'] || p.keys['KeyD'] || p.keys['TouchRight']) {
        keyTargetAngle += 120;
      }

      if (!isDraggingWheelRef.current) {
        if (keyTargetAngle !== 0) {
          steeringAngleRef.current += (keyTargetAngle - steeringAngleRef.current) * Math.min(1.0, 0.18 * timeScale);
        } else {
          // Speed-sensitive power steering self-centering spring force
          const centeringRate = 0.80;
          steeringAngleRef.current *= Math.pow(centeringRate, timeScale);
          if (Math.abs(steeringAngleRef.current) < 0.1) steeringAngleRef.current = 0;
        }
      }

      // Store steering angle for 3D wheel rendering
      p.steeringAngle = steeringAngleRef.current;

      // Performance optimized direct DOM updates for Steering Wheel rotation style
      if (steeringWheelRef.current) {
        steeringWheelRef.current.style.transform = `rotate(${steeringAngleRef.current}deg)`;
      }

      // Proportional Steering Ratio with speed-dependent rack curve
      const steerNorm = steeringAngleRef.current / 120;
      const rackInput = Math.max(-1, Math.min(1, steerNorm));

      // Drifting Logic (Triggered by Space/Drift key or braking while turning at speed)
      const isTurning = Math.abs(rackInput) > 0.12;
      const wantsDrift = p.keys['Space'] || p.keys['TouchDrift'] || (p.keys['TouchBrake'] && isTurning);
      
      if (wantsDrift && isTurning && Math.abs(p.speed) > 1.0) {
          p.drifting = true;
      } else {
          p.drifting = false;
      }

      // Max Speed Cap
      const currentMaxSpeed = isNitroActive ? activeNitroSpeed : activeMaxSpeed;
      
      if (p.speed > currentMaxSpeed) {
          if (isNitroActive) {
              p.speed = currentMaxSpeed;
          } else {
              p.speed = Math.max(currentMaxSpeed, p.speed * Math.pow(0.98, timeScale));
          }
      }
      if (p.speed < -activeMaxSpeed / 2) p.speed = -activeMaxSpeed / 2;

      // Real-World Car Steering & Physics
      if (Math.abs(p.speed) > 0.02) {
        const speedFactor = Math.min(1.2, 0.45 + Math.abs(p.speed) / 2.2);
        let turn = activeTurnSpeed * speedFactor;
        
        if (p.drifting) {
            turn *= 1.4;
            p.speed *= Math.pow(0.993, timeScale);
        }

        const dirSign = p.speed >= 0 ? 1 : -1;
        p.angle += turn * rackInput * dirSign * timeScale;
      }

      // Smooth Chassis Weight Transfer (Pitch & Roll without frame jitter)
      const targetPitch = isGasKeyHeld ? -0.012 * Math.min(1.0, Math.abs(p.speed) / 1.5) : (isBrakePressed ? 0.018 : 0);
      const targetRoll = -rackInput * Math.min(1.0, Math.abs(p.speed) / 2.5) * 0.035;

      p.pitch = (p.pitch || 0) + (targetPitch - (p.pitch || 0)) * Math.min(1.0, 0.12 * timeScale);
      p.roll = (p.roll || 0) + (targetRoll - (p.roll || 0)) * Math.min(1.0, 0.12 * timeScale);

      p.x += Math.cos(p.angle) * p.speed * timeScale;
      p.y += Math.sin(p.angle) * p.speed * timeScale;

      // --- PHYSICAL ENTITY & PROP COLLISION ENGINE (PREVENTS OVERLAPPING, UNDERLAYING, OR PASSING THROUGH OBJECTS) ---
      const CAR_COLLISION_RADIUS = 1.85; // Optimized bounding radius
      let hasCollidedThisFrame = false;

      // 1. Collision with SCENERY_DECORATIONS (Trees and Rocks)
      for (const item of SCENERY_DECORATIONS) {
        const itemX = item.pos[0];
        const itemZ = item.pos[2]; 
        const dx = p.x - itemX;
        const dy = p.y - itemZ;
        const distSq = dx * dx + dy * dy;

        const objRadius = item.type === 'tree' ? 0.7 * item.scale : 1.3 * item.scale;
        const minDist = CAR_COLLISION_RADIUS + objRadius;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.01;
          const overlap = minDist - dist;

          // Push the car out aggressively to prevent tunneling
          p.x += (dx / dist) * overlap * 1.1;
          p.y += (dy / dist) * overlap * 1.1;

          hasCollidedThisFrame = true;
          // Kill speed more effectively on direct hit
          p.speed *= 0.5;
        }
      }

      // 2. Collision with STREET_LAMPS
      for (const lamp of STREET_LAMPS) {
        const lampX = lamp.pos[0];
        const lampZ = lamp.pos[2];
        const dx = p.x - lampX;
        const dy = p.y - lampZ;
        const distSq = dx * dx + dy * dy;

        const objRadius = 0.65; 
        const minDist = CAR_COLLISION_RADIUS + objRadius;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.01;
          const overlap = minDist - dist;

          p.x += (dx / dist) * overlap * 1.1;
          p.y += (dy / dist) * overlap * 1.1;

          hasCollidedThisFrame = true;
          p.speed *= 0.5;
        }
      }

      // 3. Collision with FinishArch Pillars
      for (const pillar of ARCH_PILLARS) {
        const dx = p.x - pillar.x;
        const dy = p.y - pillar.z;
        const distSq = dx * dx + dy * dy;

        const minDist = CAR_COLLISION_RADIUS + pillar.radius;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.01;
          const overlap = minDist - dist;

          p.x += (dx / dist) * overlap * 1.1;
          p.y += (dy / dist) * overlap * 1.1;

          hasCollidedThisFrame = true;
          p.speed *= 0.5;
        }
      }

      // 4. Collision with Other Multiplayer Opponent Cars (No overlapping or underlaying!)
      const currentPlayers = playersRef.current;
      if (currentPlayers) {
        Object.entries(currentPlayers).forEach(([id, op]) => {
          if (id === socket.id || id === myId) return; // Skip self
          if (typeof op.x !== 'number' || typeof op.y !== 'number' || isNaN(op.x) || isNaN(op.y)) return;

          const dx = p.x - op.x;
          const dy = p.y - op.y;
          const distSq = dx * dx + dy * dy;

          const OP_CAR_RADIUS = 1.85; 
          const minDist = CAR_COLLISION_RADIUS + OP_CAR_RADIUS;

          if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq) || 0.01;
            const overlap = minDist - dist;

            // Push the local car away from the opponent's car with high priority
            p.x += (dx / dist) * overlap * 1.1;
            p.y += (dy / dist) * overlap * 1.1;

            hasCollidedThisFrame = true;
            // Dampen speed relative to the hit
            p.speed *= 0.7;
          }
        });
      }

      // 5. Handle Collision Physics Response (Speed dampening + Sound FX feedback)
      if (hasCollidedThisFrame) {
        engineAudio.playThud();
      }

      // Performance optimized unified particle updates (only runs when drifting or particles exist)
      if (p.drifting || particleCountRef.current > 0) {
        setParticles(prev => {
          const decayed = prev.map(pt => ({...pt, life: pt.life - 0.05})).filter(pt => pt.life > 0);
          if (p.drifting && Math.random() > 0.5) {
            decayed.push({
              id: particleIdCounter.current++, 
              x: p.x + (Math.random() - 0.5) * 2, 
              y: p.y + (Math.random() - 0.5) * 2, 
              life: 1.0,
              color: currentConfig?.cosmetics?.smokeColor || '#ffffff'
            });
          }
          particleCountRef.current = decayed.length;
          return decayed;
        });
      }

      // Find previous closest segment globally based on the previous valid frame position (oldX, oldY)
      let prevClosestSegIdx = 0;
      let prevMinD2 = Infinity;
      TRACK_SEGMENTS.forEach((seg, idx) => {
          const pt = getClosestPointOnSegment({x: oldX, y: oldY}, seg.start, seg.end);
          const d2 = (pt.x - oldX)**2 + (pt.y - oldY)**2;
          if (d2 < prevMinD2) {
              prevMinD2 = d2;
              prevClosestSegIdx = idx;
          }
      });

      // Clamp movement within the previous closest segment and its immediate neighbors to prevent clipping through barriers
      const N = TRACK_SEGMENTS.length;
      const allowedIndices = [
        prevClosestSegIdx,
        (prevClosestSegIdx + 1) % N,
        (prevClosestSegIdx - 1 + N) % N
      ];

      let closestPt = {x: p.x, y: p.y};
      let minD2 = Infinity;
      let targetAngle = 0;
      
      allowedIndices.forEach(idx => {
          const seg = TRACK_SEGMENTS[idx];
          const pt = getClosestPointOnSegment({x: p.x, y: p.y}, seg.start, seg.end);
          const d2 = (pt.x - p.x)**2 + (pt.y - p.y)**2;
          if (d2 < minD2) {
              minD2 = d2;
              closestPt = pt;
              targetAngle = seg.angle;
          }
      });

      const minD = Math.sqrt(minD2);
      const BARRIER_LIMIT = TRACK_RADIUS + 2.2; // Solid metallic crash guardrail limit at 52.2 units

      if (minD > BARRIER_LIMIT) {
        // Clamp car position safely inside guardrails to prevent passing through
        const normX = minD > 0 ? (p.x - closestPt.x) / minD : 1;
        const normY = minD > 0 ? (p.y - closestPt.y) / minD : 0;
        
        p.x = closestPt.x + normX * (BARRIER_LIMIT - 0.05);
        p.y = closestPt.y + normY * (BARRIER_LIMIT - 0.05);

        // Smooth velocity dampening without violent oscillation or thud sound spam
        if (Math.abs(p.speed) > 2.0) {
          engineAudio.playThud();
        }
        p.speed *= 0.25;
      } else if (minD > TRACK_RADIUS) {
        // Grass off-track slowdown (smoother, higher recovery speed cap for flawless recovery)
        p.speed *= 0.95;
        if (p.speed > 3.0) p.speed = 3.0; // Comfortably recover up to 60 km/h instead of snail pace
        if (p.speed < -1.5) p.speed = -1.5;
        p.drifting = false;
      }

      let currentSector = -1;
      const d0 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[0].start, TRACK_SEGMENTS[0].end);
      const d1 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[4].start, TRACK_SEGMENTS[4].end);
      const d2 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[8].start, TRACK_SEGMENTS[8].end);
      const d3 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[11].start, TRACK_SEGMENTS[11].end);

      if (d0 < TRACK_RADIUS * 1.5) currentSector = 0;
      else if (d1 < TRACK_RADIUS * 1.5) currentSector = 1;
      else if (d2 < TRACK_RADIUS * 1.5) currentSector = 2;
      else if (d3 < TRACK_RADIUS * 1.5) currentSector = 3;
      
      if (currentSector !== -1) {
          const nextCheckpoint = (p.checkpoint + 1) % 4;
          if (currentSector === nextCheckpoint) {
              p.checkpoint = currentSector;
          }
      }

      const onFinishStraight = p.y > 700 && p.y < 800;
      if (p.checkpoint === 3 && onFinishStraight && oldX >= 625 && p.x < 625) {
          const now = Date.now();
          const lapTime = now - currentLapStart;
          
          setCurrentLapStart(now);
          p.lapCount = (p.lapCount || 0) + 1;
          setLaps(p.lapCount);
          
          setLastLapTime(lapTime);

          let badgeIcon = '🥉';
          let badgeTitle = 'BRONZE LAP BADGE';
          if (p.lapCount >= 10) {
            badgeIcon = '🏆';
            badgeTitle = 'ULTIMATE CHAMPION CUP';
          } else if (p.lapCount >= 3) {
            badgeIcon = '🥇';
            badgeTitle = 'GOLD CHAMPION BADGE';
          } else if (p.lapCount === 2) {
            badgeIcon = '🥈';
            badgeTitle = 'SILVER LAP BADGE';
          } else if (p.lapCount > 3) {
            badgeIcon = '👑';
            badgeTitle = 'INFINITE CHAMPION BADGE';
          }

          setRewardNotify(`🏁 YOU FINISHED LAP ${p.lapCount}! ${badgeIcon} ${badgeTitle} UNLOCKED`);
          setTimeout(() => setRewardNotify(null), 3500);
          
          setPlayers(prev => {
              if (!myId || !prev[myId]) return prev;
              const currentBest = prev[myId].bestLapTime;
              if (!currentBest || lapTime < currentBest) {
                  return {
                      ...prev,
                      [myId]: {
                          ...prev[myId],
                          bestLapTime: lapTime,
                          laps: p.lapCount
                      }
                  };
              }
              return {
                  ...prev,
                  [myId]: {
                      ...prev[myId],
                      laps: p.lapCount
                  }
              };
          });

          socket.emit('lapFinished', lapTime);

          if (p.lapCount === 3 || p.lapCount === 10 || (p.lapCount > 3 && p.lapCount % 5 === 0)) {
              setChampion({
                  winnerId: myId || socket.id || 'local',
                  winnerName: players[myId || socket.id || '']?.name || 'You',
                  winnerColor: carConfig.color || '#facc15',
                  lapCount: p.lapCount
              });
          }
          
          p.checkpoint = -1;
      }

      let pAngle = p.angle % (Math.PI * 2);
      if (pAngle > Math.PI) pAngle -= Math.PI * 2;
      if (pAngle < -Math.PI) pAngle += Math.PI * 2;
      
      let diff = Math.abs(pAngle - targetAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      
      const isWrongWayConditionMet = diff > 2.0 && p.speed > 0.5;
      
      if (isWrongWayConditionMet) {
          if (p.wrongWayTimer === null) {
              p.wrongWayTimer = Date.now();
          } else if (Date.now() - p.wrongWayTimer > 100) {
              setWrongWay(true);
          }
      } else {
          p.wrongWayTimer = null;
          setWrongWay(false);
      }

      const now = Date.now();
      const lastUpdate = lastUpdateRef.current || 0;
      if (now - lastUpdate > 33) {
        lastUpdateRef.current = now;
        
        if (carConfig) {
          const payload = {
            id: socket.id || myId || '',
            name: players[socket.id || myId || '']?.name || 'Player',
            x: p.x,
            y: p.y,
            angle: p.angle,
            speed: p.speed,
            nitro: p.nitro,
            drifting: p.drifting,
            carConfig,
            color: carConfig.color
          };

          // Broadcast instantly to peer and server
          if (socket.connected) {
            socket.emit('playerMovement', payload);
          }
          broadcast({ type: 'playerMoved', player: payload });

          // Generate proof periodically in the background without clogging frame updates
          if (now - lastProofTimeRef.current > 2000) {
            lastProofTimeRef.current = now;
            generateMovementProof({
              x: p.x,
              y: p.y,
              angle: p.angle,
              speed: p.speed,
              nitro: p.nitro,
              drifting: p.drifting,
              timestamp: now
            }).then(proof => {
              if (socket.connected) {
                socket.emit('updatePlayerState', { ...payload, zkProof: proof });
              }
            }).catch(() => {});
          }
        }
      }

      if (timerRef.current) {
          timerRef.current.innerText = formatTime(Date.now() - currentLapStart);
      }
      const curKmh = Math.round(Math.abs(p.speed) * 20);
      if (speedRef.current) {
          speedRef.current.innerText = `${curKmh}`;
      }

      const isGasActive = p.keys['ArrowUp'] || p.keys['KeyW'] || p.keys['TouchAccel'];
      let gearDisplay = 'N';
      if (curKmh > 0 || isGasActive) {
        gearDisplay = `${p.manualGear || 1}`;
      }
      if (gearRef.current) {
        gearRef.current.innerText = gearDisplay;
      }

      const curGearNum = p.manualGear || 1;
      const gearMin = curGearNum === 1 ? 0 : curGearNum === 2 ? 35 : curGearNum === 3 ? 75 : curGearNum === 4 ? 125 : curGearNum === 5 ? 180 : 240;
      const gearMax = curGearNum === 1 ? 50 : curGearNum === 2 ? 100 : curGearNum === 3 ? 155 : curGearNum === 4 ? 210 : curGearNum === 5 ? 265 : 340;
      const rpmRatio = curKmh === 0 ? (isGasActive ? 0.35 : 0.08) : 0.2 + 0.8 * Math.min(1, Math.max(0, (curKmh - gearMin) / Math.max(1, gearMax - gearMin)));
      const rpmPct = Math.min(100, Math.max(8, Math.round(rpmRatio * 100)));
      if (rpmBarRef.current) {
        rpmBarRef.current.style.width = `${rpmPct}%`;
      }
  };

  const sortedLeaderboard = useMemo(() => {
    return Object.values(players)
      .map(p => p as Player)
      .sort((a, b) => (a.bestLapTime || Infinity) - (b.bestLapTime || Infinity));
  }, [players]);

  const myRank = useMemo(() => {
    const idx = sortedLeaderboard.findIndex(p => p.id === socket.id);
    return idx >= 0 ? idx + 1 : '-';
  }, [sortedLeaderboard]);

  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const handleOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    
    handleOrientation();
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', handleOrientation);
    
    return () => {
      window.removeEventListener('resize', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#0284c7] overflow-hidden select-none touch-none z-50 p-0 m-0 border-0">
      {!showGarage && (
        <>
          <Canvas camera={{ near: 0.1, far: 2000, fov: 56 }} shadows style={{ width: '100%', height: '100%' }} dpr={[1, 1.2]} gl={{ powerPreference: 'high-performance', antialias: true }}>
            <color attach="background" args={['#38bdf8']} />
            <fog attach="fog" args={['#38bdf8', 450, 3000]} />
            <GameScene localPlayerRef={localPlayer} players={players} myId={myId} carConfig={carConfig} raceStartTime={raceStartTime} updatePhysicsRef={updatePhysicsRef} />
            
            {particles.map(pt => (
                <mesh key={pt.id} position={[pt.x, 0.2, pt.y]} rotation={[-Math.PI/2, 0, 0]} geometry={PLANE_GEOM} scale={[1.5 * pt.life, 1.5 * pt.life, 1]}>
                    <meshBasicMaterial color={pt.color || "#cbd5e1"} transparent opacity={0.4 * pt.life} />
                </mesh>
            ))}
          </Canvas>

          {/* 3-2-1-GO Start Race Countdown Overlay */}
          {countdownText && (
            <div className="absolute inset-0 pointer-events-none z-40 flex flex-col items-center justify-center">
              <div className="bg-slate-950/80 backdrop-blur-md px-3 py-1 sm:px-5 sm:py-2 rounded-xl border border-cyan-400/80 shadow-[0_0_20px_rgba(34,211,238,0.3)] text-center animate-pulse">
                <div className="text-[8px] sm:text-[10px] font-racing font-extrabold uppercase tracking-widest text-cyan-300 mb-0">
                  GET READY
                </div>
                <div className={`font-racing font-black text-2xl sm:text-3xl tracking-wider ${
                  countdownText === 'GO!' ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.8)]' : 'text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]'
                }`}>
                  {countdownText}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Top Header Bar - Always available if not in garage or explicitly hidden */}
      {!showGarage && (
        <>
          <div className="absolute top-0 left-0 right-0 z-30 flex items-start justify-between px-2 sm:px-4 pointer-events-none select-none pt-safe pl-safe pr-safe">
            <div className="pointer-events-auto mt-2 sm:mt-2.5 w-1/4 flex justify-end pr-4 sm:pr-8">
                        <button 
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="bg-slate-900/90 hover:bg-slate-800 text-yellow-400 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-700/80 backdrop-blur-md flex items-center gap-1 text-[10px] sm:text-[11px] font-bold shadow-lg transition-all active:scale-95"
          >
            <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />
            <span className="text-[10px] sm:text-[11px] font-black">#{myRank}</span>
          </button>
            </div>
            <div className="pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 flex justify-center min-w-0">
                      {/* Center: Compact Multi-Hub (Timer, Speed, Nitro) + P2P Connect Hub Stack */}
        <div className="flex flex-col items-center min-w-0 shrink scale-[0.68] sm:scale-[0.78] origin-top gap-0 bg-transparent pointer-events-auto mt-0">
          {/* P2P Connect Hub - No Gap, sits beautifully directly above the timer */}
          <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-b-xl border-x border-b border-slate-800/60 shadow-lg flex items-center gap-3 text-[10px] sm:text-xs text-slate-300 font-mono tracking-wider select-none mt-0">
            <div className="flex items-center gap-1 font-black uppercase text-cyan-400">
              <Activity className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
              <span className="hidden xs:inline text-[9px] sm:text-[10px]">NET HUB</span>
            </div>
            <div className="w-px h-3 bg-slate-800 hidden xs:block"></div>
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Local player */}
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse"></span>
                <span className="font-bold text-slate-200">YOU</span>
              </div>
              
              {/* Opponent players */}
              {Object.values(players).map(p => {
                if (p.id === socket.id || p.id === myId) return null;
                const isP2PConnected = activePeers.includes(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isP2PConnected 
                        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse' 
                        : 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse'
                    }`}></span>
                    <span className="font-bold uppercase text-slate-300 max-w-[60px] sm:max-w-[100px] truncate">
                      {p.name || 'PEER'}
                    </span>
                    <span className={`font-black text-[7px] sm:text-[8px] px-1 py-0.5 rounded leading-none ${
                      isP2PConnected 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {isP2PConnected ? 'P2P DIRECT' : 'SERVER RELAY'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900/90 text-white px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg border border-slate-700/80 backdrop-blur-md flex items-center gap-2 sm:gap-3 shadow-md pointer-events-auto">
            {/* Timer Section */}
            <div className="text-center">
              <div className="text-[6.5px] sm:text-[8px] text-slate-400 uppercase tracking-wider font-black leading-none mb-0.5">Time</div>
              <div ref={timerRef} className="text-[10px] sm:text-xs font-mono font-black text-yellow-400 leading-none">
                {formatTime(Date.now() - currentLapStart)}
              </div>
            </div>

            <div className="w-px h-3.5 sm:h-4 bg-slate-700/80"></div>

            {/* Best Lap Section */}
            <div className="text-center">
              <div className="text-[6.5px] sm:text-[8px] text-slate-400 uppercase tracking-wider font-black leading-none mb-0.5">Best</div>
              <div className="text-[10px] sm:text-xs font-mono font-bold text-slate-200 leading-none">
                {players[socket.id || '']?.bestLapTime !== Infinity ? formatTime(players[socket.id || '']?.bestLapTime || 0) : '--:--'}
              </div>
            </div>

            <div className="w-px h-3.5 sm:h-4 bg-slate-700/80"></div>

            {/* Speed Section */}
            <div className="text-center min-w-[32px] sm:min-w-[40px]">
              <div className="text-[6.5px] sm:text-[8px] text-slate-400 uppercase tracking-wider font-black leading-none mb-0.5">Speed</div>
              <div className="flex items-baseline justify-center font-mono font-black text-cyan-400 leading-none">
                <span ref={speedRef} className="text-[10px] sm:text-xs">0</span>
                <span className="text-[5px] sm:text-[6px] text-cyan-300 ml-0.5">KMH</span>
              </div>
            </div>

            <div className="w-px h-3.5 sm:h-4 bg-slate-700/80"></div>

            {/* Nitro Section */}
            <div className="text-center">
              <div className="text-[6.5px] sm:text-[8px] text-slate-400 uppercase tracking-wider font-black leading-none mb-0.5">Nitro</div>
              <div className="w-8 sm:w-10 h-1 bg-slate-950 rounded-full overflow-hidden border border-slate-800/60 mt-0.5">
                <div 
                  ref={nitroBarRef}
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            
            <div className="w-px h-3.5 sm:h-4 bg-slate-700/80"></div>

            {/* Lap Section */}
            <div className="text-center">
              <div className="text-[6.5px] sm:text-[8px] text-slate-400 uppercase tracking-wider font-black leading-none mb-0.5">Lap</div>
              <div className="text-[10px] sm:text-xs font-mono font-black text-slate-100 leading-none">
                {laps}
              </div>
            </div>
          </div>
        </div>
            </div>
            <div className="pointer-events-auto absolute left-[calc(50%+260px)] top-3 sm:top-4 z-40">
              <button
              onClick={() => setShowMenu(true)}
              className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-amber-500 bg-slate-900/95 text-slate-200 hover:text-white flex items-center gap-1.5 text-[10px] sm:text-[11px] font-racing font-bold tracking-wider transition-all shadow-lg active:translate-y-0.5 cursor-pointer"
              title="Open Race Menu"
            >
              <Menu className="w-3 h-3 text-amber-400" />
              <span>MENU</span>
            </button>
            </div>
            <div className="pointer-events-auto absolute right-2 sm:right-4 top-16 sm:top-20">
              <MiniMap localPlayerRef={localPlayer} players={players} myId={myId} />
            </div>
          </div>

      {/* Gear Shift Notification Banner */}
      {shiftNotice && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
          <div className="bg-slate-950/90 text-amber-400 font-racing font-extrabold text-lg sm:text-2xl px-6 py-2.5 rounded-2xl border-2 border-amber-400/80 shadow-[0_0_30px_rgba(251,191,36,0.6)] animate-bounce text-center tracking-wider uppercase backdrop-blur-md">
            {shiftNotice}
          </div>
        </div>
      )}

      {/* Wrong Way Warning */}
      {wrongWay && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
            <div className="bg-red-600/90 text-white px-6 py-4 sm:px-10 sm:py-6 rounded-2xl border-4 sm:border-8 border-white shadow-2xl animate-pulse text-center">
                <div className="text-3xl sm:text-5xl font-black italic uppercase tracking-widest">WRONG WAY</div>
            </div>
        </div>
      )}

      {/* Desktop Keyboard Controls Help (Bottom Left on Desktop) */}
      <div className="hidden lg:block absolute bottom-4 left-4 text-white pointer-events-none opacity-50 hover:opacity-90 transition-opacity duration-300 z-20">
        <div className="bg-black/60 p-3.5 rounded-xl backdrop-blur-md border border-white/10">
            <h3 className="font-bold text-xs mb-1 text-yellow-400 flex items-center gap-1"><Monitor className="w-3.5 h-3.5" /> Keyboard Controls</h3>
            <ul className="text-[10px] space-y-0.5 font-mono text-slate-300">
              <li>W / UP : Accelerate</li>
              <li>S / DOWN : Brake / Reverse</li>
              <li>A / D : Turn Left / Right</li>
              <li>SPACE : Drift | SHIFT : Nitro</li>
            </ul>
        </div>
      </div>

      {/* Touch Controls (Flexible Interactive Car Controls) */}
      {showTouchControls && (
        <div 
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 pointer-events-none z-30 flex justify-between items-end p-3 sm:p-6 select-none touch-none pl-safe pr-safe"
          style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
        >
          {/* Left Side: Real Metallic Pedals (Floating with no dark background card) */}
          <div className="pointer-events-auto flex items-end gap-2.5 mb-1 sm:mb-2">
            {/* Foot Brake / Reverse / Drift Pedal */}
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { e.preventDefault(); handleTouchKeyStart('TouchBrake'); }}
              onPointerUp={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchBrake'); }}
              onPointerCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchBrake'); }}
              onPointerLeave={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchBrake'); }}
              onTouchStart={(e) => { e.preventDefault(); handleTouchKeyStart('TouchBrake'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchBrake'); }}
              onTouchCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchBrake'); }}
              className="group relative w-11 h-18 sm:w-13 sm:h-22 bg-gradient-to-b from-slate-700 via-slate-850 to-slate-950 active:from-rose-900 active:to-slate-950 rounded-xl border border-slate-500/80 active:border-rose-500 flex flex-col items-center justify-between p-1.5 shadow-2xl backdrop-blur-sm transition-all active:scale-95 active:translate-y-0.5"
              title="Brake / Reverse / Drift Pedal"
              style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
            >
              {/* Pedal Metal Top Bracket */}
              <div className="w-4 h-2.5 bg-slate-600 rounded-t-xs border-b border-slate-800" />
              
              {/* Real Metallic Rubber Brake Plate Graphic */}
              <div className="w-full flex-1 flex flex-col items-center justify-center relative overflow-hidden rounded-lg bg-gradient-to-b from-slate-600 via-slate-800 to-slate-900 border border-slate-400/50 shadow-inner group-active:border-rose-400">
                {/* Anti-Slip Rubber Plates */}
                <div className="w-3/4 h-1 bg-slate-950 rounded-full my-0.5 shadow-inner" />
                <div className="w-3/4 h-1 bg-slate-950 rounded-full my-0.5 shadow-inner" />
                <div className="w-3/4 h-1 bg-slate-950 rounded-full my-0.5 shadow-inner" />
                
                {/* Label */}
                <span className="mt-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-slate-300 group-active:text-rose-300 drop-shadow">
                  BRAKE
                </span>
              </div>
            </button>

            {/* Real Aluminum Gas / Accelerate / Nitro Pedal */}
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { e.preventDefault(); handleTouchKeyStart('TouchAccel'); }}
              onPointerUp={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchAccel'); }}
              onPointerCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchAccel'); }}
              onPointerLeave={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchAccel'); }}
              onTouchStart={(e) => { e.preventDefault(); handleTouchKeyStart('TouchAccel'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchAccel'); }}
              onTouchCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchAccel'); }}
              className="group relative w-11 h-22 sm:w-13 sm:h-26 bg-gradient-to-b from-slate-600 via-slate-800 to-slate-950 active:from-emerald-950 active:to-slate-950 rounded-xl border border-slate-400/90 active:border-emerald-400 flex flex-col items-center justify-between p-1.5 shadow-2xl backdrop-blur-sm transition-all active:scale-95 active:translate-y-0.5"
              title="Gas / Accelerate / Nitro Pedal"
              style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
            >
              {/* Pedal Metal Arm */}
              <div className="w-4 h-3 bg-slate-500 rounded-t-xs border-b border-slate-700" />

              {/* Metallic Gas Plate Graphic with Drilled Performance Holes */}
              <div className="w-full flex-1 flex flex-col items-center justify-center relative overflow-hidden rounded-lg bg-gradient-to-b from-slate-300 via-slate-500 to-slate-700 border border-slate-200/60 shadow-inner group-active:border-emerald-400">
                {/* Performance Racing Drilled Dots */}
                <div className="grid grid-cols-2 gap-1 my-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-950/80 shadow-inner" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-950/80 shadow-inner" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-950/80 shadow-inner" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-950/80 shadow-inner" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-950/80 shadow-inner" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-950/80 shadow-inner" />
                </div>

                {/* Label */}
                <span className="text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-wider text-slate-950 group-active:text-emerald-300 drop-shadow-sm">
                  GAS
                </span>
              </div>
            </button>
          </div>

          {/* Right Side: Rotatable Supercar Steering Wheel & Precision Flanking Buttons */}
          <div className="pointer-events-auto flex items-center gap-1.5 mb-1 sm:mb-2">
            {/* Steer Left Button */}
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { e.preventDefault(); handleTouchKeyStart('TouchLeft'); }}
              onPointerUp={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchLeft'); }}
              onPointerCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchLeft'); }}
              onPointerLeave={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchLeft'); }}
              onTouchStart={(e) => { e.preventDefault(); handleTouchKeyStart('TouchLeft'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchLeft'); }}
              onTouchCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchLeft'); }}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-900/90 border border-slate-700 active:border-cyan-400 active:bg-cyan-950/80 text-slate-300 active:text-cyan-300 flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
              title="Steer Left"
              style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Interactive Steering Wheel */}
            <div
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={handleWheelPointerDown}
              onPointerMove={handleWheelPointerMove}
              onPointerUp={handleWheelPointerUp}
              onPointerCancel={handleWheelPointerUp}
              className="relative w-22 h-22 sm:w-28 sm:h-28 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none group shrink-0"
              title="Interactive Car Steering Wheel"
              style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
            >
              {/* Outer Glow Ring */}
              <div className="absolute inset-0 rounded-full border border-slate-700/80 bg-slate-950/80 backdrop-blur-md shadow-xl transition-all group-active:border-cyan-400 group-active:shadow-cyan-500/30" />
              
              {/* Rotatable Steering Wheel Graphic */}
              <div
                ref={steeringWheelRef}
                className="relative w-18 h-18 sm:w-24 sm:h-24"
                style={{
                  transform: 'rotate(0deg)',
                  willChange: 'transform'
                }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg overflow-visible">
                  {/* Outer Wheel Leather Rim */}
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#1e293b" strokeWidth="11" />
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#334155" strokeWidth="9" />
                  
                  {/* Top Red Alignment Marker Line */}
                  <line x1="50" y1="2" x2="50" y2="10" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
                  
                  {/* 3 Sports Steering Wheel Spokes */}
                  <path d="M 16 50 L 38 50 L 42 56 L 22 58 Z" fill="url(#spokeGrad)" />
                  <path d="M 84 50 L 62 50 L 58 56 L 78 58 Z" fill="url(#spokeGrad)" />
                  <path d="M 46 62 L 54 62 L 52 86 L 48 86 Z" fill="url(#spokeGrad)" />
                  
                  {/* Metallic Center Horn Cap */}
                  <circle cx="50" cy="50" r="16" fill="#0f172a" stroke="#475569" strokeWidth="2.5" />
                  <circle cx="50" cy="50" r="11" fill="url(#centerGrad)" stroke="#06b6d4" strokeWidth="1" />
                  <circle cx="50" cy="50" r="4" fill="#06b6d4" />

                  <defs>
                    <linearGradient id="spokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#475569" />
                      <stop offset="100%" stopColor="#1e293b" />
                    </linearGradient>
                    <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#1e293b" />
                      <stop offset="100%" stopColor="#0284c7" />
                    </radialGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Steer Right Button */}
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { e.preventDefault(); handleTouchKeyStart('TouchRight'); }}
              onPointerUp={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchRight'); }}
              onPointerCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchRight'); }}
              onPointerLeave={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchRight'); }}
              onTouchStart={(e) => { e.preventDefault(); handleTouchKeyStart('TouchRight'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchRight'); }}
              onTouchCancel={(e) => { e.preventDefault(); handleTouchKeyEnd('TouchRight'); }}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-900/90 border border-slate-700 active:border-cyan-400 active:bg-cyan-950/80 text-slate-300 active:text-cyan-300 flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
              title="Steer Right"
              style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Animated Reward Notification Overlay */}
      {rewardNotify && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-emerald-500/95 text-white border-2 border-emerald-300 font-black text-sm sm:text-lg tracking-widest px-4 py-2 sm:px-6 sm:py-3 rounded-2xl flex items-center gap-2 shadow-2xl animate-bounce pointer-events-none select-none">
          <Sparkles className="w-5 h-5 text-yellow-300 animate-spin" />
          <span>{rewardNotify}</span>
        </div>
      )}
        </>
    )}

    {/* Immersive Game Menu, Settings & Quit Overlay */}
    {showMenu && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center pointer-events-auto select-none p-2 sm:p-4" style={{ zIndex: 90 }}>
          <div className="w-full max-w-md landscape:max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-2xl relative">
            {/* Content Section */}
            <div className="space-y-5 landscape:grid landscape:grid-cols-2 landscape:gap-x-8 landscape:space-y-0">
              <div className="space-y-5">
                {/* Settings Group */}
                <div>
                  <h3 className="text-xs font-racing font-bold tracking-wider text-slate-400 uppercase mb-2.5 flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>GAME SETTINGS</span>
                  </h3>
                  <div className="space-y-2.5">
                    {/* Audio Synthesizer */}
                    <button
                      onClick={toggleEngineAudio}
                      className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer group ${
                        engineAudioActive
                          ? 'bg-slate-950 border-cyan-500/50 text-cyan-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${engineAudioActive ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}>
                          {engineAudioActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-200">Engine Sound Audio</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Real-time modular engine audio synth</div>
                        </div>
                      </div>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${engineAudioActive ? 'bg-cyan-500' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${engineAudioActive ? 'left-4.5' : 'left-0.5'}`} />
                      </div>
                    </button>

                    {/* Touch Controls */}
                    <button
                      onClick={() => setShowTouchControls(!showTouchControls)}
                      className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer group ${
                        showTouchControls
                          ? 'bg-slate-950 border-blue-500/50 text-blue-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${showTouchControls ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                          {showTouchControls ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-200">Mobile Touch Controls</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Steering wheel and pedals overlay</div>
                        </div>
                      </div>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${showTouchControls ? 'bg-blue-500' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showTouchControls ? 'left-4.5' : 'left-0.5'}`} />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {/* Garage & Tuning Shop */}
                <div>
                  <div className="flex justify-between items-center mb-2.5">
                    <h3 className="text-xs font-racing font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      <span>GARAGE & SHOP</span>
                    </h3>
                    <button 
                      onClick={() => setShowMenu(false)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                      title="Close Menu"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setShowGarage(true);
                    }}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-950/90 border border-slate-800 hover:border-amber-500/50 text-slate-200 hover:text-white rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg group-hover:bg-amber-500 group-hover:text-slate-950 transition-all shrink-0">
                        <Wrench className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">Ride: <span className="text-amber-400">{CAR_CATALOGUE.find(c => c.id === carConfig?.selectedCarId)?.name || 'Apex Viper GT'}</span></div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Kaspa Balance: <span className="text-emerald-400 font-mono font-bold">
                            ${((walletState?.balanceKas || 0) * (kaspaPrice || 0.125)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Exit/Quit Section */}
                <div>
                  <h3 className="text-xs font-racing font-bold tracking-wider text-slate-400 uppercase mb-2.5 flex items-center gap-1.5">
                    <LogOut className="w-3.5 h-3.5 text-slate-400" />
                    <span>EXIT OPTIONS</span>
                  </h3>
                  <button
                    onClick={() => {
                      if (onQuit) {
                        onQuit();
                      }
                    }}
                    className="w-full p-3 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-500/40 text-rose-300 rounded-xl flex items-center gap-2 justify-center transition-all cursor-pointer font-racing font-bold text-sm tracking-wider"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>QUIT RACE</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Restart & Resume Buttons */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleRestartRace}
                className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/60 text-cyan-200 font-racing font-bold py-3 rounded-xl transition-all text-xs tracking-wider uppercase cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>RESTART</span>
              </button>

              <button
                onClick={() => setShowMenu(false)}
                className="flex-[2] bg-amber-500 hover:bg-amber-400 text-slate-950 font-racing font-bold py-3 rounded-xl shadow-lg transition-all text-sm tracking-wider uppercase cursor-pointer flex items-center justify-center gap-2"
              >
                RESUME RACE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Immersive GarageView Upgrade and Tuning Overlay */}
      {showGarage && (
        <div className="absolute inset-0 bg-[#020617] flex flex-col pointer-events-auto pt-safe pb-safe pl-safe pr-safe" style={{ zIndex: 100 }}>
          <GarageView
            currentConfig={carConfig}
            onSaveConfig={handleSaveConfig}
            onClose={() => setShowGarage(false)}
            walletState={walletState}
            kaspaPrice={kaspaPrice}
            onPurchaseKasItem={onPurchaseKasItem}
          />
        </div>
      )}

      {/* Champion Victory Celebration Modal / Pop Hub */}
      {champion && (
        <div className="absolute top-4 right-4 pointer-events-auto select-none" style={{ zIndex: 110 }}>
          <div className="w-80 bg-slate-900/95 backdrop-blur-md border border-amber-500 rounded-2xl p-4 shadow-2xl relative text-center space-y-3 animate-in slide-in-from-right duration-300">
            {/* Trophy Icon */}
            <div className="flex justify-center items-center gap-3">
              <div className="w-12 h-12 bg-amber-500/20 border-2 border-amber-400 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 animate-bounce">
                <span className="text-2xl">
                  {(champion.lapCount || 0) >= 10 ? '🏆' : (champion.lapCount || 0) >= 3 ? '🥇' : '🏅'}
                </span>
              </div>
              <div className="text-left space-y-1">
                <div className="text-[10px] font-mono font-bold tracking-widest text-amber-400 uppercase">
                  {(champion.lapCount || 0) >= 10 ? '🏆 ULTIMATE CHAMPION!' : '🏁 CHAMPION CROWNED'}
                </div>
                <h2 className="text-lg font-racing font-black text-white uppercase tracking-wider leading-none">
                  {champion.winnerName}
                </h2>
              </div>
            </div>
            
            <p className="text-[10px] text-slate-300 leading-tight">
              {(champion.lapCount || 0) >= 10
                ? 'Completed Lap 10 and received the prestigious 🏆 Ultimate Champion Cup!'
                : 'Crossed the finish line and earned the 🥇 Championship Trophy!'}
            </p>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  setChampion(null);
                }}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-racing font-bold py-2 rounded-lg shadow-md transition-all text-xs tracking-wider uppercase cursor-pointer"
              >
                CONTINUE ♾️
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleRematch}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-racing font-bold py-2 rounded-lg shadow-md transition-all text-[10px] tracking-wider uppercase cursor-pointer"
                >
                  REMATCH
                </button>
                <button
                  onClick={() => {
                    setChampion(null);
                    if (onQuit) onQuit();
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-racing font-bold py-2 rounded-lg transition-all text-[10px] tracking-wider uppercase cursor-pointer"
                >
                  LOBBY
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
