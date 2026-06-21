'use client';

import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import type { Group } from 'three';

function RingModel({ path }: { path: string }) {
  const { scene } = useGLTF(path);
  const ref = useRef<Group>(null);

  // Normalise the model to fit in a ~1-unit bounding box regardless of Meshy export scale
  useEffect(() => {
    const box = new Box3().setFromObject(scene);
    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) scene.scale.setScalar(1.2 / maxDim);

    // Re-centre after scaling
    box.setFromObject(scene);
    const center = new Vector3();
    box.getCenter(center);
    scene.position.sub(center);
  }, [scene]);

  return <primitive ref={ref} object={scene} />;
}

interface ChampionRingProps {
  modelPath: string;
  height?: number;
}

export default function ChampionRing({ modelPath, height = 220 }: ChampionRingProps) {
  return (
    <div
      className="relative w-full rounded-xl overflow-hidden bg-gradient-to-b from-background to-card/60"
      style={{ height }}
    >
      <Canvas
        camera={{ position: [0, 0.6, 5.5], fov: 28 }}
        gl={{ antialias: true, alpha: true }}
        shadows
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
        <directionalLight position={[-4, 2, -4]} intensity={0.35} color="#c0a060" />

        <Suspense fallback={null}>
          <RingModel path={modelPath} />
          <ContactShadows position={[0, -0.7, 0]} opacity={0.3} scale={3} blur={2.5} far={1.5} />
          <Environment preset="studio" />
        </Suspense>

        <OrbitControls
          autoRotate
          autoRotateSpeed={1.8}
          enableZoom
          enablePan={false}
          zoomSpeed={1.2}
          minDistance={2}
          maxDistance={12}
          minPolarAngle={0.3}
          maxPolarAngle={2.0}
        />
      </Canvas>
    </div>
  );
}
