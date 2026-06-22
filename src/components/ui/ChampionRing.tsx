'use client';

import { Suspense, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import { Maximize2, X } from 'lucide-react';

function RingModel({ path }: { path: string }) {
  const { scene } = useGLTF(path);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone);
    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) clone.scale.setScalar(1.2 / maxDim);
    box.setFromObject(clone);
    const center = new Vector3();
    box.getCenter(center);
    clone.position.sub(center);
    return clone;
  }, [scene]);

  return <primitive object={clonedScene} />;
}

function RingCanvas({ modelPath }: { modelPath: string }) {
  return (
    <Canvas camera={{ position: [0, 0.6, 5.5], fov: 28 }} gl={{ antialias: true, alpha: true }} shadows>
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
  );
}

interface ChampionRingProps {
  modelPath: string;
  height?: number;
}

export default function ChampionRing({ modelPath, height = 220 }: ChampionRingProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div
        className="relative w-full rounded-xl overflow-hidden bg-gradient-to-b from-background to-card/60"
        style={{ height }}
      >
        <RingCanvas modelPath={modelPath} />
        <button
          onClick={() => setIsFullscreen(true)}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/60 hover:bg-background/90 text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
          aria-label="View fullscreen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md"
          onClick={() => setIsFullscreen(false)}
        >
          <div
            className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden bg-card border border-border shadow-2xl"
            style={{ height: 'min(80vh, 640px)' }}
            onClick={e => e.stopPropagation()}
          >
            <RingCanvas modelPath={modelPath} />
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-background/60 hover:bg-background/90 text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
