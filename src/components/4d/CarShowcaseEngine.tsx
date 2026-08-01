/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { CarConfig } from '../../types';
import { CAR_CATALOGUE } from '../../data/cars';
import { CarModel } from '../GameEngine';

interface ShowcaseProps {
  carConfig: CarConfig;
}

const ShowcaseCar4D = ({ carConfig }: ShowcaseProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const carData = CAR_CATALOGUE.find(c => c.id === carConfig.selectedCarId) || CAR_CATALOGUE[0];
  const activeColor = carConfig.color || carData.color;

  // Gentle idle rotation in showcase
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.21, 0]} scale={[1.3 / 3.2, 1.3 / 3.2, 1.3 / 3.2]}>
      <CarModel color={activeColor} carConfig={carConfig} />
    </group>
  );
};

export default function CarShowcaseEngine({ carConfig }: ShowcaseProps) {
  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-slate-700/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 shadow-2xl">
      <Canvas 
        camera={{ position: [3.8, 2.2, 4.8], fov: 42 }}
        dpr={[1, 1.2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
      >
        <color attach="background" args={['#090d16']} />
        <ambientLight intensity={0.9} />
        <hemisphereLight args={['#38bdf8', '#090d16', 0.8]} />
        <directionalLight position={[10, 15, 10]} intensity={1.8} castShadow />
        <directionalLight position={[-10, 8, -10]} intensity={0.6} color="#38bdf8" />

        <ShowcaseCar4D carConfig={carConfig} />

        {/* Reflective Garage Floor Grid */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.8} />
        </mesh>
        <gridHelper args={[30, 30, '#0284c7', '#1e293b']} position={[0, -0.21, 0]} />

        <OrbitControls
          enableZoom={true}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={2.5}
          maxDistance={7}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}

