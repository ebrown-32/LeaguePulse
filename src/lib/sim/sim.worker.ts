/// <reference lib="webworker" />
/**
 * The simulator's worker thread.
 *
 * Ten thousand seasons is a million-odd score draws. On the main thread that is
 * a visible stall on every slider drag, and this app has already learned once
 * what a busy main thread does to scrolling. Here it costs nothing: the UI
 * stays at full frame rate while the numbers land.
 */

import { simulateSeason, simulateMatchup } from './engine';
import type { SimRequest, MatchupSimRequest } from './types';

type Incoming =
  | { id: number; kind: 'season';  payload: SimRequest }
  | { id: number; kind: 'matchup'; payload: MatchupSimRequest };

self.onmessage = (e: MessageEvent<Incoming>) => {
  const { id, kind, payload } = e.data;
  try {
    const result = kind === 'season'
      ? simulateSeason(payload as SimRequest)
      : simulateMatchup(payload as MatchupSimRequest);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id, ok: false, error: err instanceof Error ? err.message : String(err),
    });
  }
};
