'use client';

/**
 * Surfaces for the grounds, made rather than loaded: the ground's grass (or
 * sand), the plaza's paving, and building walls with windows.
 *
 * The windows come from the wall's position in the world, not from a texture
 * stretched over it, so a two-storey shop and a forty-storey tower share one
 * material and both get windows the right size. A seeded share of them light
 * up after dark.
 */

import { CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import type { StadiumLook } from '@/lib/franchise/model';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}

function canvas(size: number, draw: (g: CanvasRenderingContext2D) => void, repeat: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Grass with mown patches and wear, or sand with drifts: tiled across the whole ground. */
export function groundTexture(base: string, setting: StadiumLook['setting']) {
  return canvas(512, g => {
    const r = rng(17);
    const c = new Color(base);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    // Soft blotches of lighter and darker ground.
    for (let i = 0; i < 260; i++) {
      const k = 0.86 + r() * 0.28, x = r() * 512, y = r() * 512, rad = 12 + r() * 60;
      const tone = c.clone().multiplyScalar(k);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `#${tone.getHexString()}55`); grad.addColorStop(1, `#${tone.getHexString()}00`);
      g.fillStyle = grad; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Fine grain: blades of grass, or grains of sand.
    for (let i = 0; i < 26000; i++) {
      const k = 0.78 + r() * 0.4;
      g.fillStyle = `#${c.clone().multiplyScalar(k).getHexString()}`;
      g.fillRect(r() * 512, r() * 512, setting === 'desert' ? 1 : 1, setting === 'desert' ? 1 : 2);
    }
  }, 22);
}

/** The plaza's paving, by the manager's choice. */
export function plazaTexture(style: StadiumLook['plaza'], base: string) {
  return canvas(256, g => {
    const r = rng(23);
    if (style === 'brick') {
      // Running bond pavers in warm reds.
      g.fillStyle = '#7d4b3a'; g.fillRect(0, 0, 256, 256);
      const bw = 32, bh = 16;
      for (let row = 0; row < 256 / bh; row++) for (let col = -1; col < 256 / bw + 1; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
        g.fillStyle = `#${new Color('#a5583f').multiplyScalar(0.85 + r() * 0.3).getHexString()}`;
        g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    } else {
      // Concrete slabs with joints; the garden plaza in a warmer stone.
      const tone = style === 'garden' ? '#d6ccb5' : base;
      g.fillStyle = `#${new Color(tone).multiplyScalar(0.8).getHexString()}`; g.fillRect(0, 0, 256, 256);
      const s = style === 'garden' ? 42 : 64;
      for (let x = 0; x < 256; x += s) for (let y = 0; y < 256; y += s) {
        g.fillStyle = `#${new Color(tone).multiplyScalar(0.93 + r() * 0.12).getHexString()}`;
        g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
      }
      for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? '#00000010' : '#ffffff12'; g.fillRect(r() * 256, r() * 256, 1, 1); }
    }
  }, 1);
}

/** Walls with windows. `night` (0 to 1) lights a share of them; set it each frame through `uniforms`. */
export function windowMaterial(opts: { cols: number; rows: number; lit: number }) {
  const uniforms = { uNight: { value: 0 } };
  const m = new MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uNight = uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nvarying vec3 vWorldN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vWorldP = wp.xyz;
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          nm = nm * mat3(instanceMatrix);
        #endif
        vWorldN = normalize(nm * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWorldP;
        varying vec3 vWorldN;
        uniform float uNight;
        float lpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 n = abs(vWorldN);
          if (n.y < 0.5 && vWorldP.y > 0.16) {
            float across = n.x > n.z ? vWorldP.z : vWorldP.x;
            vec2 cell = vec2(across * ${opts.cols.toFixed(1)}, vWorldP.y * ${opts.rows.toFixed(1)});
            vec2 f = fract(cell);
            float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.22, f.y) * step(f.y, 0.78);
            float on = step(${(1 - opts.lit).toFixed(2)}, lpHash(floor(cell) + floor(vWorldP.xz * 0.5)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.26), win * 0.75);
            totalEmissiveRadiance += vec3(1.0, 0.82, 0.52) * win * on * uNight * 1.25;
          }
        }`);
  };
  m.customProgramCacheKey = () => `lp-windows-${opts.cols}-${opts.rows}-${opts.lit}`;
  return { material: m, uniforms };
}

/** How thick the haze is: the same for the land (the scene's fog) and the horizon (hazeMaterial). */
export const HAZE = 0.0105;

/**
 * For the far horizon: the scene's haze, thinning with height, so a range of
 * hills or a skyline melts into the mist at its foot and stands clear at the
 * top, as distant land does. `top` is about the height it thins out by; set
 * `uniforms.uHaze` to the sky's horizon color as it changes.
 */
export function hazeMaterial(top: number) {
  const uniforms = { uHaze: { value: new Color('#9fd0ef') }, uDensity: { value: HAZE }, uTop: { value: top } };
  const m = new MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true, fog: false });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 hp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hp = instanceMatrix * hp;
        #endif
        vHazeP = (modelMatrix * hp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeP;\nuniform vec3 uHaze;\nuniform float uDensity;\nuniform float uTop;')
      .replace('#include <fog_fragment>', `{
          float d = length(vHazeP - cameraPosition);
          float f = 1.0 - exp(-uDensity * uDensity * d * d);
          f *= mix(1.0, 0.4, smoothstep(0.0, uTop, vHazeP.y));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, f);
        }`);
  };
  m.customProgramCacheKey = () => `lp-haze-${top}`;
  return { material: m, uniforms };
}
