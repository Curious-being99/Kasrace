/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { CAR_CATALOGUE } from '../../data/cars';
import { CarModel } from '../GameEngine';
import { CarConfig } from '../../types';

// Shared Geometries for optimization
const BOX_GEOM = new THREE.BoxGeometry(1, 1, 1);
const PLANE_GEOM = new THREE.PlaneGeometry(1, 1);
const CYLINDER_GEOM = new THREE.CylinderGeometry(1, 1, 1, 8);

// Configuration constants for the high-speed background scene
const SPEED = 130; // Virtual speed in units/sec
const TRACK_LENGTH = 320; // Length of the looping track segment

interface BackgroundProps {
  currentCarConfig?: CarConfig | null;
}

// 1. Infinite High-Speed Scrolling Road & Ambient Environment Scenery
const HighSpeedScenery = () => {
  const roadRef = useRef<THREE.Mesh>(null);
  const laneMarkersRef = useRef<THREE.Group>(null);
  const guardRailsRef = useRef<THREE.Group>(null);
  const archesRef = useRef<THREE.Group>(null);
  const starsRef = useRef<THREE.Points>(null);

  // Generate lane markers spaced along the Z-axis (scrolling backwards)
  const laneMarkers = useMemo(() => {
    const items = [];
    const count = 12;
    const spacing = TRACK_LENGTH / count;
    for (let i = 0; i < count; i++) {
      items.push({ id: i, initialZ: -TRACK_LENGTH / 2 + i * spacing });
    }
    return items;
  }, []);

  // Guardrail segments with glowing red/blue neon strip lights
  const rails = useMemo(() => {
    const items = [];
    const count = 16;
    const spacing = TRACK_LENGTH / count;
    for (let i = 0; i < count; i++) {
      const z = -TRACK_LENGTH / 2 + i * spacing;
      items.push({ id: i, z, side: -1 }); // Left
      items.push({ id: i + count, z, side: 1 }); // Right
    }
    return items;
  }, []);

  // Futuristic speed light arches spaced widely apart
  const arches = useMemo(() => {
    const items = [];
    const count = 4;
    const spacing = TRACK_LENGTH / count;
    for (let i = 0; i < count; i++) {
      items.push({ id: i, z: -TRACK_LENGTH / 2 + i * spacing });
    }
    return items;
  }, []);

  // Ambient high-speed speedway spark particles
  const particlesCount = 80;
  const particleData = useMemo(() => {
    const positions = new Float32Array(particlesCount * 3);
    const velocities = new Float32Array(particlesCount);
    for (let i = 0; i < particlesCount; i++) {
      // Randomly disperse in a box around the cars
      positions[i * 3] = (Math.random() - 0.5) * 45; // X width
      positions[i * 3 + 1] = Math.random() * 4 + 0.2; // Y height
      positions[i * 3 + 2] = -Math.random() * TRACK_LENGTH; // Z depth
      velocities[i] = SPEED * (0.8 + Math.random() * 0.4); // Random high speed
    }
    return { positions, velocities };
  }, []);

  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();

    // Scroll stars/dust backwards
    if (starsRef.current) {
      const positions = starsRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particlesCount; i++) {
        // Move Z coordinate backwards
        positions[i * 3 + 2] += particleData.velocities[i] * delta;
        // Wrap around if it goes too far behind camera
        if (positions[i * 3 + 2] > 20) {
          positions[i * 3 + 2] = -TRACK_LENGTH;
          positions[i * 3] = (Math.random() - 0.5) * 45;
          positions[i * 3 + 1] = Math.random() * 5 + 0.2;
        }
      }
      starsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // Scroll lane markers
    if (laneMarkersRef.current) {
      laneMarkersRef.current.children.forEach((mesh) => {
        mesh.position.z += SPEED * delta;
        if (mesh.position.z > 20) {
          mesh.position.z -= TRACK_LENGTH;
        }
      });
    }

    // Scroll guard rails
    if (guardRailsRef.current) {
      guardRailsRef.current.children.forEach((mesh) => {
        mesh.position.z += SPEED * delta;
        if (mesh.position.z > 20) {
          mesh.position.z -= TRACK_LENGTH;
        }
      });
    }

    // Scroll decorative neon light arches
    if (archesRef.current) {
      archesRef.current.children.forEach((group) => {
        group.position.z += SPEED * delta;
        if (group.position.z > 20) {
          group.position.z -= TRACK_LENGTH;
        }
      });
    }
  });

  return (
    <group>
      {/* 1. Main Asphalt Speedway Road */}
      <mesh ref={roadRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -TRACK_LENGTH / 4]} receiveShadow geometry={PLANE_GEOM} scale={[18, TRACK_LENGTH, 1]}>
        <meshStandardMaterial color="#384152" roughness={0.65} metalness={0.15} />
      </mesh>

      {/* 2. Left and Right Grass Fields */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-15, -0.05, -TRACK_LENGTH / 4]} geometry={PLANE_GEOM} scale={[12, TRACK_LENGTH, 1]}>
        <meshStandardMaterial color="#22c55e" roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[15, -0.05, -TRACK_LENGTH / 4]} geometry={PLANE_GEOM} scale={[12, TRACK_LENGTH, 1]}>
        <meshStandardMaterial color="#22c55e" roughness={0.85} metalness={0.1} />
      </mesh>

      {/* 3. High-Velocity Sparks / Particle Stream */}
      <points ref={starsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particleData.positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#f59e0b"
          size={0.16}
          transparent
          opacity={0.7}
          sizeAttenuation={true}
        />
      </points>

      {/* 4. Scrolling Center Lane Markers (Dashed lines) */}
      <group ref={laneMarkersRef}>
        {laneMarkers.map((marker) => (
          <group key={marker.id} position={[0, 0.01, marker.initialZ]}>
            {/* White/Yellow Center dashes */}
            <mesh geometry={BOX_GEOM} scale={[0.15, 0.01, 3.5]}>
              <meshBasicMaterial color="#fcd34d" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 5. Scrolling Guard Rails with Glowing Neon Sidebars */}
      <group ref={guardRailsRef}>
        {rails.map((rail) => (
          <group key={rail.id} position={[9.2 * rail.side, 0.3, rail.z]}>
            {/* Structural base bar */}
            <mesh geometry={BOX_GEOM} scale={[0.2, 0.4, 15]}>
              <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
            </mesh>
            {/* Neon light stripe */}
            <mesh position={[0.08 * -rail.side, 0.1, 0]} geometry={BOX_GEOM} scale={[0.04, 0.08, 15]}>
              <meshBasicMaterial 
                color={rail.side === -1 ? '#ef4444' : '#06b6d4'} 
                toneMapped={false} 
              />
            </mesh>
            {/* Post pillars */}
            <mesh position={[0, -0.2, -5]} geometry={CYLINDER_GEOM} scale={[0.2, 0.6, 0.2]}>
              <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0, -0.2, 5]} geometry={CYLINDER_GEOM} scale={[0.2, 0.6, 0.2]}>
              <meshStandardMaterial color="#334155" />
            </mesh>
          </group>
        ))}
      </group>

      {/* 6. Scrolling Cyber Neon Arches (overhead lighting) */}
      <group ref={archesRef}>
        {arches.map((arch) => (
          <group key={arch.id} position={[0, 0, arch.z]}>
            {/* Left Pillar */}
            <mesh position={[-10.5, 3.5, 0]} geometry={BOX_GEOM} scale={[0.3, 7, 0.5]}>
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
            {/* Right Pillar */}
            <mesh position={[10.5, 3.5, 0]} geometry={BOX_GEOM} scale={[0.3, 7, 0.5]}>
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
            {/* Top Beam */}
            <mesh position={[0, 7.15, 0]} geometry={BOX_GEOM} scale={[21.3, 0.3, 0.5]}>
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
            {/* Under-arch Glowing Neon Tube */}
            <mesh position={[0, 6.95, 0]} geometry={BOX_GEOM} scale={[20.5, 0.05, 0.15]}>
              <meshBasicMaterial color="#ec4899" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};

// 2. Dual Drafting High-Performance Sports Cars with Dynamic Physics
interface RacingCarsProps {
  playerCarId: string;
  playerColor: string;
  rivalCarId: string;
  rivalColor: string;
}

const RacingCars = ({ playerCarId, playerColor, rivalCarId, rivalColor }: RacingCarsProps) => {
  const pGroup = useRef<THREE.Group>(null);
  const rGroup = useRef<THREE.Group>(null);
  
  // Custom states for active cosmetics/config
  const playerConfig = useMemo<CarConfig>(() => ({
    selectedCarId: playerCarId,
    color: playerColor,
    upgrades: { engine: 1, nos: 1, tires: 1, chassis: 1 },
    cosmetics: {
      underglowColor: '#38bdf8',
      spoilerType: 'gt_wing',
      smokeColor: '#cbd5e1'
    }
  }), [playerCarId, playerColor]);

  const rivalConfig = useMemo<CarConfig>(() => ({
    selectedCarId: rivalCarId,
    color: rivalColor,
    upgrades: { engine: 3, nos: 2, tires: 2, chassis: 3 },
    cosmetics: {
      underglowColor: '#f43f5e',
      spoilerType: 'ducktail',
      smokeColor: '#f43f5e'
    }
  }), [rivalCarId, rivalColor]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    // Player Car high-speed micro sways, drafting vibration and lane weaving
    if (pGroup.current) {
      // Smooth sinusoidal lane change over 6.5 seconds
      const laneX = -2.2 + Math.sin(elapsed * 0.9) * 1.5;
      pGroup.current.position.x = laneX;
      
      // Drafting rumble vibration
      pGroup.current.position.y = 0.02 + Math.sin(elapsed * 45) * 0.015;
      
      // Tilt car slightly into steering curves (roll angle)
      const turnRate = Math.cos(elapsed * 0.9) * 0.9;
      pGroup.current.rotation.z = turnRate * -0.06;
      pGroup.current.rotation.y = turnRate * -0.03;
    }

    // Rival Car aggressive chasing maneuvers, rubber-banding drafting
    if (rGroup.current) {
      // Sync or contrast with player's driving route
      const laneX = 2.4 + Math.sin(elapsed * 1.1 + 1.5) * 1.8;
      rGroup.current.position.x = laneX;
      
      // Rubber-banding catchup distance oscillation
      const zDist = -12.5 + Math.sin(elapsed * 0.6) * 4.5;
      rGroup.current.position.z = zDist;

      // Suspension rumble
      rGroup.current.position.y = 0.02 + Math.cos(elapsed * 48) * 0.012;

      // Curved banking steering tilt
      const turnRate = Math.cos(elapsed * 1.1 + 1.5) * 1.1;
      rGroup.current.rotation.z = turnRate * -0.05;
      rGroup.current.rotation.y = turnRate * -0.04;
    }
  });

  return (
    <group>
      {/* Player Sports Car */}
      <group ref={pGroup} position={[-2.2, 0.02, 0]}>
        {/* Scale the 3.2 built-in CarModel down to fit standard meter bounds */}
        <group scale={[0.55, 0.55, 0.55]} rotation={[0, Math.PI, 0]}>
          <CarModel color={playerColor} carConfig={playerConfig} scale={3.2} />
        </group>
        {/* Tail exhaust backfire glows */}
        <pointLight position={[0, 0.35, -2.5]} color="#f97316" intensity={2.5} distance={3} />
        {/* Dynamic customized Underglow Light */}
        <pointLight position={[0, 0.1, 0]} color="#38bdf8" intensity={4} distance={6} />
      </group>

      {/* Rival Sports Car */}
      <group ref={rGroup} position={[2.4, 0.02, -12.5]}>
        <group scale={[0.55, 0.55, 0.55]} rotation={[0, Math.PI, 0]}>
          <CarModel color={rivalColor} carConfig={rivalConfig} scale={3.2} />
        </group>
        {/* Tail glows */}
        <pointLight position={[0, 0.35, -2.5]} color="#f43f5e" intensity={2.0} distance={2.5} />
        {/* Underglow */}
        <pointLight position={[0, 0.1, 0]} color="#f43f5e" intensity={4.0} distance={5} />
      </group>
    </group>
  );
};

// 3. Cinematic Gliding Director Camera Rig
const DirectorCamera = () => {
  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    const camera = state.camera;

    // A slow, highly cinematic sweeping track shot that pans around the high-speed action
    // Camera weaves behind, to the left, and rises/falls to establish breathtaking depth
    const camX = Math.sin(elapsed * 0.25) * 4.2;
    const camY = 3.6 + Math.cos(elapsed * 0.4) * 0.8;
    const camZ = 7.5 + Math.sin(elapsed * 0.15) * 2.0;

    camera.position.set(camX, camY, camZ);
    
    // Look ahead down the track, focusing slightly ahead of the player car
    camera.lookAt(new THREE.Vector3(-0.5, 0.8, -12));
  });

  return null;
};

// Main Export Component
export default function BackgroundRacingScene({ currentCarConfig }: BackgroundProps) {
  // Load local configurations or default hypercars
  const [carConfig, setCarConfig] = useState<CarConfig | null>(currentCarConfig || null);

  useEffect(() => {
    if (currentCarConfig) {
      setCarConfig(currentCarConfig);
      return;
    }
    // Pull active configuration if not passed explicitly
    const saved = localStorage.getItem('turbo_car_config');
    if (saved) {
      try {
        setCarConfig(JSON.parse(saved));
      } catch {
        // use default
      }
    }
  }, [currentCarConfig]);

  // Player details
  const pId = carConfig?.selectedCarId || 'viper';
  const playerCar = CAR_CATALOGUE.find(c => c.id === pId) || CAR_CATALOGUE[0];
  const pColor = carConfig?.color || playerCar.color;

  // Choose a contrasting rival hypercar
  const rivalId = pId === 'viper' ? 'sentinel' : 'viper';
  const rivalCar = CAR_CATALOGUE.find(c => c.id === rivalId) || CAR_CATALOGUE[1];
  const rColor = rivalCar.color || '#ec4899';

  return (
    <div className="absolute inset-0 w-full h-full z-0 bg-[#0284c7] overflow-hidden pointer-events-none select-none">
      <Canvas 
        shadows={false} 
        dpr={[1, 1.2]} 
        gl={{ powerPreference: 'high-performance', antialias: true }}
      >
        <color attach="background" args={['#38bdf8']} />
        
        {/* Dynamic Atmosphere Fogging */}
        <fog attach="fog" args={['#38bdf8', 60, 250]} />
        
        <PerspectiveCamera makeDefault fov={50} near={0.1} far={300} />
        <DirectorCamera />

        {/* Ambient & Directional Speedway Lighting */}
        <ambientLight intensity={1.35} color="#ffffff" />
        <directionalLight 
          position={[12, 40, 15]} 
          intensity={2.2} 
          color="#fffbeb" 
          castShadow={false} 
        />
        <directionalLight 
          position={[-25, 25, -15]} 
          intensity={0.95} 
          color="#bae6fd" 
          castShadow={false} 
        />
        
        {/* Cool cyber twilight skyline neon pointlights */}
        <pointLight position={[0, 10, -40]} color="#a855f7" intensity={2} distance={80} />
        <pointLight position={[0, 10, -100]} color="#06b6d4" intensity={2.5} distance={100} />

        <hemisphereLight args={['#7dd3fc', '#15803d', 1.2]} />

        {/* Speedway Scenery and Racing Cars */}
        <HighSpeedScenery />
        <RacingCars 
          playerCarId={pId} 
          playerColor={pColor} 
          rivalCarId={rivalId} 
          rivalColor={rColor} 
        />
      </Canvas>
    </div>
  );
}
