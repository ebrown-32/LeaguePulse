'use client';

/**
 * Soft, slow ribbons of light drifting across a dark ground: simplex noise drawn as thick blurred
 * strokes on a canvas, each frame laid over the last at `waveOpacity` so they trail.
 *
 * Adapted from Aceternity's WavyBackground to sit inside a section rather than the window: the
 * canvas follows its container's size (not the window's, and without taking over
 * window.onresize), is drawn at half resolution and blurred by the compositor rather than the
 * canvas (a canvas blur is redrawn on the CPU every frame, which stutters the page), and only
 * animates while on screen in a visible tab. With
 * reduced motion it draws once and holds still.
 *
 * Use it as a background layer (`containerClassName="absolute inset-0"`), or with children on top.
 */

import { useEffect, useRef } from 'react';
import { createNoise3D } from 'simplex-noise';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

const SCALE = 0.5;

export function WavyBackground({
  children,
  className,
  containerClassName,
  colors = ['#38bdf8', '#818cf8', '#c084fc', '#e879f9', '#22d3ee'],
  waveWidth = 50,
  backgroundFill = 'black',
  blur = 10,
  speed = 'fast',
  waveOpacity = 0.5,
  waves = 5,
  /** Where the waves run, as a share of the height (0 top, 1 bottom). */
  center = 0.5,
  /** How far they swing up and down, in pixels. */
  amplitude = 100,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  colors?: string[];
  waveWidth?: number;
  backgroundFill?: string;
  blur?: number;
  speed?: 'slow' | 'fast';
  waveOpacity?: number;
  waves?: number;
  center?: number;
  amplitude?: number;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = box.current, canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!el || !canvas || !ctx) return;
    const noise = createNoise3D();
    const step = speed === 'slow' ? 0.001 : 0.002;
    let w = 0, h = 0, nt = 0, raf = 0, running = false, visible = false;

    const size = () => {
      w = canvas.width = Math.max(1, Math.round(el.clientWidth * SCALE));
      h = canvas.height = Math.max(1, Math.round(el.clientHeight * SCALE));
    };
    const frame = (fill: number) => {
      ctx.globalAlpha = fill;
      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      for (let i = 0; i < waves; i++) {
        ctx.beginPath();
        ctx.lineWidth = waveWidth * SCALE;
        ctx.strokeStyle = colors[i % colors.length];
        for (let x = 0; x <= w + 5; x += 5) {
          const y = noise((x / SCALE) / 800, 0.3 * i, nt) * amplitude * SCALE;
          ctx.lineTo(x, y + h * center);
        }
        ctx.stroke();
      }
    };
    const loop = () => { nt += step; frame(waveOpacity); raf = requestAnimationFrame(loop); };
    const start = () => { if (!running && !reduce) { running = true; raf = requestAnimationFrame(loop); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    size();
    frame(1);
    const ro = new ResizeObserver(() => { size(); frame(1); });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); });
    io.observe(el);
    const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
    // The colors array is read fresh on each run; its identity changing must not restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, backgroundFill, blur, speed, waveOpacity, waveWidth, waves, center, amplitude, colors.join()]);

  return (
    // Other attributes (data-*, aria-*) go on the container, so they apply with or without children.
    <div ref={box} className={cn('relative overflow-hidden', containerClassName)} {...props}>
      {/* Blurred by the compositor (on the GPU), not the canvas: a canvas filter is redrawn on the CPU every frame. */}
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 z-0 h-full w-full" style={{ filter: `blur(${blur}px)`, transform: 'translateZ(0)' }} />
      {children != null && <div className={cn('relative z-10', className)}>{children}</div>}
    </div>
  );
}

export default WavyBackground;
