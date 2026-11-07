'use client';

/**
 * A personality's speaking voice on The Desk Weekly, in the AI Desk persona editor.
 *
 * Lists the platform's ElevenLabs voices (api/podcast/voices), each with a sample to play.
 * "Automatic" leaves it to the podcast, which gives every host on an episode a different voice.
 * Without ElevenLabs the episodes are read by the listener's browser, and this says so instead.
 */

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from '@/components/icons';
import { cn } from '@/lib/utils';

interface Voice { id: string; name: string; description: string; preview: string | null }
interface Loaded { recorded: boolean; voices: Voice[]; error?: string }

let cache: Promise<Loaded> | null = null;
function load(password: string): Promise<Loaded> {
  cache ??= fetch('/api/podcast/voices', { headers: { 'x-admin-password': password } })
    .then(async r => (r.status === 401 ? { recorded: false, voices: [] } : await r.json() as Loaded))
    .catch(() => { cache = null; return { recorded: true, voices: [], error: 'Could not load the voices.' }; });
  return cache;
}

export default function VoicePicker({ password, value, onChange, takenBy, field }: {
  password: string;
  value: string | undefined;
  onChange: (voiceId: string | undefined) => void;
  /** Who else in the cast already speaks with each voice, by voice id. */
  takenBy: Record<string, string>;
  field: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { let live = true; load(password).then(d => { if (live) setData(d); }); return () => { live = false; }; }, [password]);
  useEffect(() => () => { audio.current?.pause(); }, []);

  const sample = (v: Voice) => {
    if (!v.preview) return;
    if (playing === v.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    const a = new Audio(v.preview);
    a.onended = () => setPlaying(p => (p === v.id ? null : p));
    a.play().then(() => setPlaying(v.id)).catch(() => setPlaying(null));
    audio.current = a;
  };

  const label = <span className="mb-1 block text-xs text-muted-foreground">Podcast voice, how they sound on The Desk Weekly</span>;

  if (!data) return <div>{label}<div className={cn(field, 'h-10 animate-pulse bg-muted/40')} /></div>;
  if (!data.recorded) {
    return (
      <div>
        {label}
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Episodes are read aloud by each listener&apos;s browser for now, with a different voice per host.
          Recorded voices you can pick here come with ElevenLabs.
        </p>
      </div>
    );
  }

  const current = data.voices.find(v => v.id === value);
  const clash = value ? takenBy[value] : undefined;
  return (
    <div>
      {label}
      <div className="flex items-center gap-2">
        <select value={current ? value : ''} onChange={e => onChange(e.target.value || undefined)} className={cn(field, 'min-w-0 flex-1')}>
          <option value="">Automatic, a different voice from the rest of the panel</option>
          {data.voices.map(v => (
            <option key={v.id} value={v.id}>
              {v.name}{v.description ? `, ${v.description}` : ''}{takenBy[v.id] ? ` (${takenBy[v.id]})` : ''}
            </option>
          ))}
        </select>
        {current?.preview && (
          <button type="button" onClick={() => sample(current)} aria-label={playing === current.id ? 'Stop the sample' : `Hear ${current.name}`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/15">
            {playing === current.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        )}
      </div>
      {data.error && <p className="mt-1.5 text-xs text-destructive">{data.error}</p>}
      {clash && <p className="mt-1.5 text-xs text-muted-foreground">{clash} has this voice too. When they&apos;re on the same episode, one of them gets another voice.</p>}
      {!value && data.voices.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">Pick one to hear a sample.</p>
      )}
    </div>
  );
}
