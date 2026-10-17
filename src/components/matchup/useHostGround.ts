'use client';

/**
 * A host's stadium as everyone sees it, with the visitor's color: what the
 * game-day view (MatchupStadium) and the desk's photographs (StadiumPhoto)
 * draw. Loaded once per pair and shared between every component that asks.
 */

import { useEffect, useState } from 'react';
import { normalizeLook, type StadiumLook } from '@/lib/franchise/model';
import { seededLook } from '@/lib/franchise/seededLook';
import { fieldLogo } from '@/app/team/[userId]/Franchise';
import type { Facilities } from '@/lib/tycoon/catalog';

export interface Ground {
  facilities: Facilities;
  /** The stadium's tier name, and the name its manager gave it. */
  tierName: string;
  name: string | null;
  color: string | null;
  look: StadiumLook;
  logo: string | null;
  guestColor: string | null;
}

const cache = new Map<string, Promise<Ground | null>>();

export function loadGround(host: string, guest: string, hostAvatar?: string | null): Promise<Ground | null> {
  const key = `${host}|${guest}`;
  if (!cache.has(key)) {
    const json = (u: string) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
    cache.set(key, Promise.all([
      json(`/api/franchises/${encodeURIComponent(host)}`), json(`/api/franchises/${encodeURIComponent(guest)}`), json(`/api/tycoon/${encodeURIComponent(host)}`),
    ]).then(([franchise, visitor, tycoon]) => {
      if (!tycoon?.available) return null;
      return {
        facilities: tycoon.stadium.facilities, tierName: tycoon.stadium.stadiumName,
        name: franchise?.identity?.stadiumName ?? null, color: franchise?.identity?.color ?? null,
        // Nobody has dressed it yet: the franchise's own stadium, as on its page.
        look: franchise?.identity?.look ? normalizeLook(franchise.identity.look) : seededLook(host),
        logo: fieldLogo(franchise?.identity?.logoUrl, hostAvatar ?? null),
        guestColor: visitor?.identity?.color ?? null,
      };
    }));
  }
  return cache.get(key)!;
}

export function useHostGround(host: string | null, guest: string | null, hostAvatar?: string | null): Ground | null {
  const [ground, setGround] = useState<Ground | null>(null);
  useEffect(() => {
    let cancelled = false;
    setGround(null);
    if (host && guest) loadGround(host, guest, hostAvatar).then(g => { if (!cancelled) setGround(g); });
    return () => { cancelled = true; };
  }, [host, guest, hostAvatar]);
  return ground;
}
