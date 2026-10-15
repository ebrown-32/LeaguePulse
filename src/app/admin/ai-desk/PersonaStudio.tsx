'use client';

/**
 * The persona studio (api/ai/persona-studio): build a personality with an
 * assistant. Describe them, or start from an idea; it drafts the whole
 * persona with sample posts; revise in plain words until it sounds right;
 * then add it to the cast (or apply it to the one being edited) and save as
 * usual. Every draft is kept, so an earlier one is a tap away.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, RotateCcw, Sparkles, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { personaAvatarUrl } from '@/lib/ai/avatar';
import type { ContentKind, Personality } from '@/lib/ai/personalities';

export interface StudioDraft {
  name: string; handle: string; tagline: string; voice: string;
  kinds: ContentKind[]; avatarStyle: string;
  samples: { label: string; text: string }[];
  note: string;
}
type Spice = 'clean' | 'cheeky' | 'savage';
export type StudioTarget = { kind: 'create'; type: 'media' | 'fan' } | { kind: 'refine'; persona: Personality };

const EASE = [0.22, 1, 0.36, 1] as const;

const IDEAS: Record<'media' | 'fan', string[]> = {
  media: [
    'A washed-up radio host who still thinks it is 2009',
    'A stats nerd who trusts nothing but spreadsheets',
    'A soap opera narrator who finds every week unbearably dramatic',
    'A conspiracy theorist convinced the schedule is rigged',
    'A golf commentator whispering about football',
    'A hype man who thinks every win is historic',
  ],
  fan: [
    'The one who swears their team is cursed',
    'A group chat lurker who only appears to gloat',
    'The relentless optimist, even at 1 and 9',
    'A bitter former champion who peaked years ago',
  ],
};
const SPICES: { id: Spice; label: string; about: string }[] = [
  { id: 'clean', label: 'Clean', about: 'Warm and playful' },
  { id: 'cheeky', label: 'Cheeky', about: 'Sharp, a little smug' },
  { id: 'savage', label: 'Savage', about: 'Ruthless, never crude' },
];
const TWEAKS = ['Funnier', 'Shorter and punchier', 'Give them a catchphrase', 'Meaner, never crude', 'Warmer', 'Weirder', 'More old school'];
const KIND_LABEL: Partial<Record<ContentKind, string>> = {
  article: 'Articles', tweet: 'Quick takes', comment: 'Replies', powerRankings: 'Power rankings', predictions: 'Predictions',
  matchupPreview: 'Previews', kickoff: 'Kickoff', liveTake: 'Live takes',
};
const THINKING = ['Finding their voice', 'Workshopping a catchphrase', 'Trying it on a 0.4 point loss', 'Picking an outfit', 'Reading it back out loud'];

const avatarOf = (d: Pick<StudioDraft, 'avatarStyle' | 'handle' | 'name'>) =>
  personaAvatarUrl({ avatarStyle: d.avatarStyle, avatarSeed: d.handle.replace('@', ''), name: d.name });

export default function PersonaStudio({ target, password, onClose, onApply }: {
  target: StudioTarget | null;
  password: string;
  onClose: () => void;
  /** The chosen draft, with the type it was made for. */
  onApply: (draft: StudioDraft, type: 'media' | 'fan') => void;
}) {
  const open = target !== null;
  const refining = target?.kind === 'refine' ? target.persona : null;
  const [type, setType] = useState<'media' | 'fan'>('media');
  const [idea, setIdea] = useState('');
  const [spice, setSpice] = useState<Spice>('cheeky');
  const [ask, setAsk] = useState('');
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thinking, setThinking] = useState(0);
  const askRef = useRef<HTMLInputElement>(null);

  // A fresh studio each time it opens.
  useEffect(() => {
    if (!target) return;
    setType(target.kind === 'create' ? target.type : target.persona.type === 'fan' ? 'fan' : 'media');
    setIdea(''); setAsk(''); setDrafts([]); setShown(0); setError(''); setSpice('cheeky');
  }, [target]);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setThinking(t => (t + 1) % THINKING.length), 1600);
    return () => clearInterval(id);
  }, [busy]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, busy, onClose]);

  const draft = drafts[shown] ?? null;
  // What a revision starts from: the draft on screen, or the persona being improved.
  const base = useMemo(() => draft ?? (refining ? { name: refining.name, handle: refining.handle, tagline: refining.tagline, voice: refining.voice, kinds: refining.kinds } : null), [draft, refining]);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setThinking(0);
    try {
      const r = await fetch('/api/ai/persona-studio', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ type, spice, ...body }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.draft) { setError(r.status === 401 ? 'Your admin sign-in has expired. Sign in again.' : d?.error ?? 'That did not work. Try again.'); return; }
      setDrafts(ds => { const next = [...ds, d.draft]; setShown(next.length - 1); return next; });
      setAsk('');
    } catch {
      setError('Could not reach the assistant. Try again.');
    } finally { setBusy(false); }
  };
  const create = () => call({ idea });
  const revise = (instruction: string) => base && call({ current: base, instruction });
  const editVoice = (voice: string) => setDrafts(ds => ds.map((d, i) => (i === shown ? { ...d, voice } : d)));

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="studio" className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" onClick={() => !busy && onClose()} />
          <motion.div role="dialog" aria-modal="true" aria-label="Persona studio"
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl">

            {/* Header */}
            <div className="relative flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="font-display text-lg font-bold tracking-tight">Persona studio</p>
                <p className="truncate text-xs text-muted-foreground">
                  {refining ? `Improving ${refining.name}. Say what to change, or ask for another take.` : 'Describe a character. The assistant writes their voice, and you hear it before you save.'}
                </p>
              </div>
              <button onClick={onClose} disabled={busy} aria-label="Close" className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {/* The brief */}
              <div className="space-y-5 border-b border-border p-5 lg:border-b-0 lg:border-r">
                {!refining && (
                  <>
                    <div className="inline-flex rounded-full border border-border bg-card p-0.5">
                      {(['media', 'fan'] as const).map(t => (
                        <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
                          className={cn('relative rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors', type === t ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
                          {type === t && <motion.span layoutId="studio-type" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                          <span className="relative">{t === 'media' ? 'Media personality' : 'Fan'}</span>
                        </button>
                      ))}
                    </div>
                    <label className="block">
                      <span className="text-[13px] font-semibold">Who are they?</span>
                      <textarea value={idea} onChange={e => setIdea(e.target.value)} rows={4} maxLength={800}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) create(); }}
                        placeholder={type === 'fan' ? 'A league member who has blamed the same bad trade for six years' : 'A former local news anchor who treats every waiver claim like breaking news'}
                        className="mt-2 w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[14.5px] leading-relaxed outline-none transition focus:border-foreground/40" />
                    </label>
                    <div>
                      <p className="mb-2 text-[12px] font-medium text-muted-foreground">Or start from an idea</p>
                      <div className="flex flex-wrap gap-1.5">
                        {IDEAS[type].map((s, i) => (
                          <motion.button key={s} onClick={() => setIdea(s)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                            className={cn('rounded-full border px-3 py-1.5 text-left text-[12.5px] transition', idea === s ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground')}>
                            {s}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <p className="mb-2 text-[13px] font-semibold">How sharp</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SPICES.map(s => (
                      <button key={s.id} onClick={() => setSpice(s.id)} aria-pressed={spice === s.id}
                        className={cn('rounded-xl border px-3 py-2.5 text-left transition', spice === s.id ? 'border-foreground bg-foreground/[0.04]' : 'border-border hover:border-foreground/25')}>
                        <span className="block text-[13px] font-semibold">{s.label}</span>
                        <span className="block text-[11.5px] text-muted-foreground">{s.about}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {!refining && (
                  <button onClick={create} disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-[14px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-60">
                    <Sparkles className="h-4 w-4" /> {drafts.length ? 'Start over from this idea' : 'Draft them'}
                  </button>
                )}

                {/* Revising */}
                <AnimatePresence>
                  {base && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2.5 rounded-2xl border border-border bg-card p-4">
                      <p className="text-[13px] font-semibold">{draft ? 'Not quite? Say what to change' : 'What should change?'}</p>
                      <div className="flex gap-2">
                        <input ref={askRef} value={ask} onChange={e => setAsk(e.target.value)} maxLength={600}
                          onKeyDown={e => { if (e.key === 'Enter' && ask.trim() && !busy) revise(ask); }}
                          placeholder="Make him a die-hard of the 2009 season"
                          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13.5px] outline-none transition focus:border-foreground/40" />
                        <button onClick={() => revise(ask)} disabled={busy || !ask.trim()}
                          className="rounded-xl bg-foreground px-4 text-[13px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-40">Revise</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {TWEAKS.map(t => (
                          <button key={t} onClick={() => revise(t)} disabled={busy}
                            className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:opacity-50">{t}</button>
                        ))}
                        <button onClick={() => base && call({ current: base })} disabled={busy}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:opacity-50">
                          <RotateCcw className="h-3 w-3" /> Another take
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">{error}</motion.p>}
                </AnimatePresence>
              </div>

              {/* The draft */}
              <div className="min-h-[340px] p-5">
                <AnimatePresence mode="wait">
                  {busy ? (
                    <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                      <div className="flex items-center gap-3.5">
                        <motion.span className="h-16 w-16 rounded-full bg-muted" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity }} />
                        <div className="flex-1 space-y-2">
                          <motion.div className="h-4 w-40 rounded bg-muted" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.1 }} />
                          <motion.div className="h-3 w-56 rounded bg-muted" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }} />
                        </div>
                      </div>
                      {[0, 1, 2].map(i => <motion.div key={i} className="h-16 rounded-2xl bg-muted" animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.15 * i }} />)}
                      <AnimatePresence mode="wait">
                        <motion.p key={thinking} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" /> {THINKING[thinking]}
                        </motion.p>
                      </AnimatePresence>
                    </motion.div>
                  ) : draft ? (
                    <motion.div key={`d${shown}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }} className="space-y-4">
                      {drafts.length > 1 && (
                        <div className="flex items-center gap-1.5">
                          <span className="mr-1 text-[11.5px] text-muted-foreground">Drafts</span>
                          {drafts.map((_, i) => (
                            <button key={i} onClick={() => setShown(i)} aria-label={`Draft ${i + 1}`}
                              className={cn('h-7 min-w-7 rounded-full px-2 text-[12px] font-semibold transition', i === shown ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground')}>{i + 1}</button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <motion.img key={draft.avatarStyle + draft.handle} src={avatarOf(draft)} alt="" initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                          className="h-16 w-16 shrink-0 rounded-full border border-border bg-card object-cover" />
                        <div className="min-w-0">
                          <p className="truncate font-display text-xl font-bold tracking-tight">{draft.name}</p>
                          <p className="text-[13px] text-muted-foreground">{draft.handle}</p>
                          <p className="mt-0.5 text-[13px] italic text-foreground/80">{draft.tagline}</p>
                        </div>
                      </div>

                      <p className="flex gap-2 rounded-2xl bg-primary/[0.07] px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/85">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {draft.note}
                      </p>

                      <div>
                        <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Their voice, the instruction every post is written from (edit freely)</p>
                        <textarea value={draft.voice} onChange={e => editVoice(e.target.value)} rows={6}
                          className="w-full resize-y rounded-2xl border border-border bg-card px-3.5 py-3 text-[13.5px] leading-relaxed outline-none transition focus:border-foreground/40" />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {draft.kinds.map(k => <span key={k} className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">{KIND_LABEL[k] ?? k}</span>)}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[12px] font-medium text-muted-foreground">How they sound (samples about made-up teams, never published)</p>
                        <div className="space-y-2">
                          {draft.samples.map((s, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08, ease: EASE }}
                              className="flex gap-2.5 rounded-2xl border border-border bg-card p-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={avatarOf(draft)} alt="" className="h-8 w-8 shrink-0 rounded-full border border-border object-cover" />
                              <div className="min-w-0">
                                <p className="text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">{draft.name}</span> {draft.handle}, {s.label.toLowerCase()}</p>
                                <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed">{s.text}</p>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                      <motion.span animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted"><Sparkles className="h-6 w-6 text-primary" /></motion.span>
                      <p className="mt-4 font-semibold">{refining ? `Ready to improve ${refining.name}` : 'Your next personality appears here'}</p>
                      <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
                        {refining ? 'Ask for a change on the left, or tap a quick tweak.' : 'With a name, a voice, a look, and three sample posts so you can hear them first.'}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-5 py-3.5">
              <p className="hidden text-[12px] text-muted-foreground sm:block">Nothing is saved until you save the cast.</p>
              <div className="ml-auto flex gap-2">
                <button onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">Cancel</button>
                <button onClick={() => draft && onApply(draft, type)} disabled={!draft || busy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2 text-[13.5px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-40">
                  <Check className="h-4 w-4" /> {refining ? `Use for ${refining.name}` : 'Add to the cast'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
