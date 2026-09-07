'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Only render the ring while somebody can see it.
 *
 * A react-three-fiber Canvas defaults to `frameloop="always"`, so this scene
 * was drawing every frame for as long as the page was open, with autorotation,
 * shadows and antialiasing, whether or not it was on screen. On the home page
 * that starved the main thread badly enough that scrolling managed two frames
 * in ten seconds, while pages without a ring held sixty.
 *
 * The observer keeps a generous margin so the ring is already spinning by the
 * time it scrolls into view rather than visibly starting up.
 */
function useOnScreen<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

function RingCanvas({ modelPath }: { modelPath: string }) {
  const host = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(host);
  // Motion off means no autorotation, so there is nothing to redraw between
  // interactions either.
  const still = typeof document !== 'undefined'
    && document.documentElement.dataset.motion === 'reduced';

  return (
    <div ref={host} className="h-full w-full">
    <Canvas
      camera={{ position: [0, 0.6, 5.5], fov: 28 }}
      gl={{ antialias: true, alpha: true }}
      // Capped rather than left to the device: a 3x phone screen renders nine
      // times the pixels of a 1x one for a 200px ornament nobody inspects.
      dpr={[1, 2]}
      frameloop={visible && !still ? 'always' : 'demand'}
    >
      <ambientLight intensity={0.5} />
      {/* No `castShadow`, and no `shadows` on the Canvas. A real-time shadow
          map re-rendered every frame bought nothing here: the ring sits on a
          contact shadow, and the map it was drawing was never visible. */}
      <directionalLight position={[4, 6, 4]} intensity={1.2} />
      <directionalLight position={[-4, 2, -4]} intensity={0.35} color="#c0a060" />
      <Suspense fallback={null}>
        <RingModel path={modelPath} />
        {/*
          `frames={1}` is the whole fix.

          ContactShadows defaults to re-rendering its depth pass and blurring
          it on EVERY frame. With that on, scrolling the home page managed
          three frames in ten seconds while every other page held sixty;
          removing this one canvas restored it exactly. The ring spins but the
          shadow beneath it barely changes, so it is baked once.
        */}
        <ContactShadows
          position={[0, -0.7, 0]} opacity={0.3} scale={3} blur={2.5} far={1.5}
          frames={1}
        />
        {/* Resolution capped: the default studio map is far larger than a
            200px reflection can show. */}
        <Environment preset="studio" resolution={64} />
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

interface ChampionRingProps {
  modelPath: string;
  height?: number;
}

export default function ChampionRing({ modelPath, height = 220 }: ChampionRingProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div
        className="relative w-full rounded-xl overflow-hidden bg-card/60"
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
