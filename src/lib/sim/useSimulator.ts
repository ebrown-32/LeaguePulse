'use client';

/**
 * React access to the simulation worker.
 *
 * Runs are coalesced: dragging a slider or clicking through a slate fires many
 * requests, and only the newest one's result is ever applied. Stale replies are
 * dropped by id rather than cancelled, since a run is short enough that letting
 * it finish costs less than tearing the worker down.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SimRequest, SimResult, MatchupSimRequest, MatchupSimResult,
} from './types';

export function useSimulator() {
  const workerRef = useRef<Worker | null>(null);
  const nextId    = useRef(1);
  const pending   = useRef(new Map<number, (v: any) => void>());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // `new URL(..., import.meta.url)` is the form the Next bundler recognises,
    // so the worker is emitted as its own chunk rather than inlined.
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: any; error?: string }>) => {
      const resolve = pending.current.get(e.data.id);
      if (!resolve) return;                    // superseded by a newer run
      pending.current.delete(e.data.id);
      resolve(e.data.ok ? e.data.result : null);
    };
    workerRef.current = w;
    setReady(true);
    return () => { w.terminate(); workerRef.current = null; };
  }, []);

  const run = useCallback(<T,>(kind: 'season' | 'matchup', payload: unknown): Promise<T | null> => {
    const w = workerRef.current;
    if (!w) return Promise.resolve(null);
    const id = nextId.current++;
    return new Promise<T | null>(resolve => {
      pending.current.set(id, resolve);
      w.postMessage({ id, kind, payload });
    });
  }, []);

  const runSeason = useCallback(
    (req: SimRequest) => run<SimResult>('season', req), [run]);
  const runMatchup = useCallback(
    (req: MatchupSimRequest) => run<MatchupSimResult>('matchup', req), [run]);

  return { ready, runSeason, runMatchup };
}

/**
 * Drives a season simulation whenever its inputs change, keeping the previous
 * result on screen while the next one computes.
 *
 * Showing stale numbers beats showing a spinner here: the values move by a
 * fraction of a percent between runs, and blanking the page on every click
 * would make a fast tool feel slow.
 */
export function useSeasonSim(
  req: SimRequest | null,
  runSeason: (r: SimRequest) => Promise<SimResult | null>,
) {
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    if (!req) return;
    const token = ++latest.current;
    setRunning(true);
    runSeason(req).then(r => {
      if (token !== latest.current) return;    // a newer run already started
      if (r) setResult(r);
      setRunning(false);
    });
  }, [req, runSeason]);

  return { result, running };
}
