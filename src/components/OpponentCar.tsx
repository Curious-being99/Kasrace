import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CarModel } from './GameEngine';
import { Text } from '@react-three/drei';
import { Player } from '../types'; // Need to make sure this is available

export const OpponentCar = ({ player }: { player: Player }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Use a target state for interpolation
  const targetPos = useRef(new THREE.Vector3(player.x || 0, 0.12, player.y || 0));
  const targetRot = useRef(- (player.angle || 0) + Math.PI / 2);

  useFrame(() => {
    if (groupRef.current) {
        // Update target from props
        targetPos.current.set(player.x || 0, 0.12, player.y || 0);
        targetRot.current = -(player.angle || 0) + Math.PI / 2;

        // Interpolate
        groupRef.current.position.lerp(targetPos.current, 0.2); // Adjust 0.2 for smoothness vs lag
        
        // Simple rotation interpolation
        const currentRotY = groupRef.current.rotation.y;
        groupRef.current.rotation.y = THREE.MathUtils.lerp(currentRotY, targetRot.current, 0.2);
    }
  });

  return (
    <group ref={groupRef} position={[player.x || 0, 0.12, player.y || 0]}>
        <CarModel 
            color={player.color || '#ef4444'} 
            drifting={player.drifting} 
            carConfig={(player as any).carConfig}
            scale={3.2}
            speed={player.speed || 0}
        />
        <React.Suspense fallback={null}>
            <Text position={[0, 3, 0]} fontSize={2} color="white" anchorX="center" anchorY="middle">
                {player.name}
            </Text>
        </React.Suspense>
    </group>
  );
};
