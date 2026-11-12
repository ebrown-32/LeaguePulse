'use client';

/**
 * A crowd of fans up close, for the desk's tailgate photographs (lib/franchise/photo 'fans'): a
 * dozen or so supporters out early in the lots, posing for the camera with the stadium behind
 * them. Jerseys in the home colours (and a few of the visitors'), caps, a foam finger or two, and
 * hand-lettered signs with the team's name, its hashtag and the week on them.
 *
 * At the stadium's own scale (a fan is about 0.15 units, a tailgate tent 0.3), so they stand
 * among the real tents and grills. Drawn only for a photograph, which holds still: no animation.
 */

import { useMemo } from 'react';
import { CanvasTexture, Color, SRGBColorSpace, type Texture } from 'three';
import { rng } from './stadiumParts';

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#6b4423', '#d4a373'];
const HAIR = ['#2b1d14', '#5a3825', '#1b1b1b', '#a0703a', '#d9b26f', '#7a4b2a'];

/** A sign in marker on white card, the team's colour for the letters. */
function signTexture(text: string, ink: string, border: string): Texture {
  const el = document.createElement('canvas');
  el.width = 512; el.height = 320;
  const c = el.getContext('2d')!;
  c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, 512, 320);
  c.strokeStyle = border; c.lineWidth = 18; c.strokeRect(9, 9, 494, 302);
  const words = text.split(' ');
  // Up to two lines, as big as they'll go.
  const lines = words.length > 2 && text.length > 11 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text];
  c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => {
    let size = lines.length > 1 ? 120 : 150;
    do { c.font = `900 italic ${size}px "Arial Black", Impact, system-ui, sans-serif`; size -= 6; } while (c.measureText(l).width > 440 && size > 30);
    c.fillText(l, 256, lines.length > 1 ? 105 + i * 120 : 165);
  });
  const t = new CanvasTexture(el);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface FanSpot {
  /** Where the group stands, and the way it faces (toward the camera). */
  x: number; z: number; ry: number;
}

export default function FanCluster({ at, team, accent, visitors, teamName, week, count = 13 }: {
  at: FanSpot; team: string; accent: string; visitors?: string; teamName: string; week?: number; count?: number;
}) {
  const fans = useMemo(() => {
    const r = rng(Math.round(at.x * 1000 + at.z * 7));
    const short = teamName.split(' ').filter(Boolean).at(-1) ?? teamName;
    const tag = `#${short.replace(/[^A-Za-z0-9]/g, '')}Nation`;
    const signs = [`GO ${short.toUpperCase()}`, tag.toUpperCase(), "WE'RE HERE EARLY", week ? `WEEK ${week} IS OURS` : 'BELIEVE', `${short.toUpperCase()} NATION`, 'LOUD & PROUD', '#1 FAN'];
    const jerseys = [team, team, team, accent, '#f4f4f2', team, accent, ...(visitors ? [visitors] : [])];
    const out: {
      x: number; z: number; ry: number; skin: string; hair: string; shirt: string; pants: string; tall: number;
      cap: boolean; sign: Texture | null; finger: boolean; armsUp: boolean;
    }[] = [];
    // Rows from the front: three across, then wider and further back.
    const rows = [4, 5, 5];
    let made = 0, s = 0;
    rows.forEach((n, row) => {
      for (let k = 0; k < n && made < count; k++, made++) {
        const across = (k - (n - 1) / 2) * 0.072 + (r() - 0.5) * 0.02;
        const back = row * 0.075 + (r() - 0.5) * 0.02;
        const holds = row > 0 ? r() < 0.55 : r() < 0.3;
        const shirt = jerseys[Math.floor(r() * jerseys.length)];
        out.push({
          x: across, z: -back, ry: (r() - 0.5) * 0.5,
          skin: SKIN[Math.floor(r() * SKIN.length)], hair: HAIR[Math.floor(r() * HAIR.length)],
          shirt, pants: r() < 0.6 ? '#2d3b55' : '#3a3a3f', tall: 0.92 + r() * 0.16,
          cap: r() < 0.45, sign: holds ? signTexture(signs[s++ % signs.length], shirt === '#f4f4f2' ? team : new Color(team).getStyle(), accent) : null,
          finger: !holds && r() < 0.35, armsUp: !holds && r() < 0.3,
        });
      }
    });
    return out;
  }, [at.x, at.z, team, accent, visitors, teamName, week, count]);

  return (
    <group position={[at.x, 0, at.z]} rotation-y={at.ry}>
      {/* Their tailgate, behind them: a canopy in the team's colour, a table, the grill and a cooler. */}
      <group position={[0.05, 0, -0.32]}>
        <mesh position={[0, 0.36, 0]} rotation-y={Math.PI / 4} castShadow><coneGeometry args={[0.3, 0.12, 4]} /><meshStandardMaterial color={team} roughness={0.7} /></mesh>
        {[[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].map(([x, z], k) => (
          <mesh key={k} position={[x, 0.15, z]}><boxGeometry args={[0.012, 0.3, 0.012]} /><meshStandardMaterial color="#d9dcdf" /></mesh>
        ))}
        <mesh position={[-0.05, 0.075, 0]} castShadow><boxGeometry args={[0.24, 0.012, 0.11]} /><meshStandardMaterial color="#ece8dc" /></mesh>
        <mesh position={[0.2, 0.06, 0.06]} castShadow><boxGeometry args={[0.08, 0.06, 0.06]} /><meshStandardMaterial color="#1b1d21" emissive="#ff6a1a" emissiveIntensity={0.25} /></mesh>
        <mesh position={[-0.24, 0.03, 0.1]} castShadow><boxGeometry args={[0.07, 0.05, 0.045]} /><meshStandardMaterial color={accent} /></mesh>
      </group>
      {fans.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]} rotation-y={f.ry} scale={f.tall}>
          {/* Legs, then the jersey, then the head (and a cap). */}
          <mesh position={[-0.009, 0.03, 0]} castShadow><boxGeometry args={[0.014, 0.06, 0.016]} /><meshStandardMaterial color={f.pants} roughness={0.9} /></mesh>
          <mesh position={[0.009, 0.03, 0]} castShadow><boxGeometry args={[0.014, 0.06, 0.016]} /><meshStandardMaterial color={f.pants} roughness={0.9} /></mesh>
          <mesh position={[0, 0.085, 0]} castShadow><capsuleGeometry args={[0.019, 0.04, 4, 10]} /><meshStandardMaterial color={f.shirt} roughness={0.75} /></mesh>
          <mesh position={[0, 0.127, 0]} castShadow><sphereGeometry args={[0.0145, 16, 12]} /><meshStandardMaterial color={f.skin} roughness={0.7} /></mesh>
          {/* A face: eyes and a grin, so they're looking at the camera. */}
          {[-1, 1].map(s => <mesh key={s} position={[s * 0.0052, 0.1295, 0.0132]}><sphereGeometry args={[0.0019, 8, 6]} /><meshStandardMaterial color="#1a1a1a" /></mesh>)}
          <mesh position={[0, 0.1218, 0.0136]} rotation-x={0.25}><boxGeometry args={[0.0075, 0.0018, 0.0012]} /><meshStandardMaterial color="#5a1f1f" /></mesh>
          {f.cap
            ? <mesh position={[0, 0.137, 0]}><sphereGeometry args={[0.0152, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={f.shirt === team ? accent : team} roughness={0.8} /></mesh>
            : <mesh position={[0, 0.131, -0.002]}><sphereGeometry args={[0.0151, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4]} /><meshStandardMaterial color={f.hair} roughness={0.95} /></mesh>}
          {f.cap && <mesh position={[0, 0.134, 0.013]} rotation-x={-0.2}><boxGeometry args={[0.022, 0.002, 0.012]} /><meshStandardMaterial color={f.shirt === team ? accent : team} /></mesh>}
          {f.sign ? (
            // Both arms up, the sign held over the head.
            <>
              {[-1, 1].map(s => <mesh key={s} position={[s * 0.02, 0.135, 0.004]} rotation-z={s * -0.25}><capsuleGeometry args={[0.0045, 0.05, 3, 6]} /><meshStandardMaterial color={f.shirt} /></mesh>)}
              <mesh position={[0, 0.19, 0.008]} rotation-x={-0.08}>
                <planeGeometry args={[0.085, 0.053]} />
                <meshStandardMaterial map={f.sign} roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.19, 0.0065]} rotation-x={-0.08}><planeGeometry args={[0.087, 0.055]} /><meshStandardMaterial color="#d8d4c8" /></mesh>
            </>
          ) : (
            <>
              {/* An arm (or both) thrown up, a foam finger on one; otherwise at their sides. */}
              <mesh position={[-0.024, f.armsUp ? 0.13 : 0.08, 0]} rotation-z={f.armsUp ? 2.7 : 0.15}><capsuleGeometry args={[0.0045, 0.045, 3, 6]} /><meshStandardMaterial color={f.shirt} /></mesh>
              <mesh position={[0.024, f.finger || f.armsUp ? 0.13 : 0.08, 0]} rotation-z={f.finger || f.armsUp ? -2.7 : -0.15}><capsuleGeometry args={[0.0045, 0.045, 3, 6]} /><meshStandardMaterial color={f.shirt} /></mesh>
              {f.finger && (
                <group position={[0.036, 0.168, 0.002]} rotation-z={-0.3}>
                  <mesh><boxGeometry args={[0.02, 0.024, 0.008]} /><meshStandardMaterial color={accent} roughness={0.6} /></mesh>
                  <mesh position={[0.002, 0.022, 0]}><boxGeometry args={[0.007, 0.024, 0.008]} /><meshStandardMaterial color={accent} roughness={0.6} /></mesh>
                </group>
              )}
            </>
          )}
        </group>
      ))}
    </group>
  );
}
