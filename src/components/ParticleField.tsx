'use client';

import { useEffect, useRef } from 'react';

/**
 * The ambient particle field.
 *
 * A slow drift of points that link up when they pass close to each other, sat
 * behind everything at z-index -1 and untouchable by the pointer. It is meant
 * to be felt rather than looked at: if you notice it while reading a table, it
 * is turned up too far.
 *
 * Drawn on a canvas rather than as DOM nodes because the link lines need a
 * pairwise pass every frame, and a few hundred absolutely-positioned divs with
 * their own transitions is how you make a phone warm.
 *
 * Colour comes from the live `--primary` and `--border` custom properties, so
 * the field follows whatever palette the admin picked instead of shipping its
 * own blues and fighting the theme.
 */

/** Roughly one particle per this many square pixels, then clamped. */
const AREA_PER_PARTICLE = 26_000;
const MIN_PARTICLES = 18;
const MAX_PARTICLES = 70;

/** Particles closer than this get a line between them. */
const LINK_DISTANCE = 140;

/** Pixels per second. Slow enough to read as drift rather than motion. */
const SPEED = 9;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  /** Per-particle opacity multiplier, so the field has depth. */
  a: number;
}

/** Read an HSL triplet custom property, e.g. "37 98% 53%". */
function cssTriplet(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim();
  return v || fallback;
}

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const root = document.documentElement;
    const reduced =
      root.dataset.motion === 'reduced' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let particles: Particle[] = [];
    let width = 0, height = 0, dpr = 1;
    let raf = 0;
    let last = performance.now();
    let running = true;

    // Re-read on resize and on theme change rather than once: the admin panel
    // rewrites these variables live while the editor is open.
    let primary = '37 98% 53%';
    let border = '215 20% 30%';
    const readTheme = () => {
      const styles = getComputedStyle(root);
      primary = cssTriplet(styles, '--primary', primary);
      border = cssTriplet(styles, '--border', border);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.round(
        Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, (width * height) / AREA_PER_PARTICLE)),
      );
      // Keep existing particles on resize so the field does not visibly reset
      // when a phone's address bar collapses.
      if (particles.length > target) particles.length = target;
      while (particles.length < target) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * SPEED,
          vy: Math.sin(angle) * SPEED,
          r: 0.8 + Math.random() * 1.6,
          a: 0.25 + Math.random() * 0.5,
        });
      }
      for (const p of particles) {
        // A particle left outside a shrunken viewport would never drift back.
        p.x = Math.min(p.x, width);
        p.y = Math.min(p.y, height);
      }
    };

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      ctx.clearRect(0, 0, width, height);

      if (!reduced) {
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // Wrap rather than bounce: bouncing makes the edges of the screen
          // visibly denser, which draws the eye to exactly the wrong place.
          if (p.x < -10) p.x = width + 10;
          else if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          else if (p.y > height + 10) p.y = -10;
        }
      }

      // Links first, so the dots sit on top of their own lines.
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DISTANCE * LINK_DISTANCE) continue;
          const fade = 1 - Math.sqrt(d2) / LINK_DISTANCE;
          ctx.strokeStyle = `hsl(${border} / ${fade * 0.22})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const p of particles) {
        ctx.fillStyle = `hsl(${primary} / ${p.a * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (running) raf = requestAnimationFrame(draw);
    };

    // A still field is the right answer for reduced motion: the texture stays,
    // the movement goes. Rendering nothing would change the whole look rather
    // than just calming it.
    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // Nothing is animating behind a hidden tab; keep the battery.
    const onVisibility = () => {
      running = !document.hidden;
      if (running) start(); else stop();
    };

    readTheme();
    resize();
    start();
    if (reduced) { stop(); requestAnimationFrame(draw); }

    const themeObserver = new MutationObserver(readTheme);
    themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-bg'] });

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      running = false;
      themeObserver.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
