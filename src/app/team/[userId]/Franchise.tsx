'use client';

/**
 * The franchise parts of a team's page (see lib/franchise): the identity its
 * manager set, the way to claim it or edit it, and the parts of its story
 * that come from every season at once (src/lib/archive/franchises.ts).
 *
 * The public page shows a franchise; its manager edits it on the manage page
 * (manage/page.tsx). Editing needs a pass: a manager arrives from the product
 * site with one in the URL fragment (#lpm=), kept for this tab only; a league
 * admin signed in on this site already holds theirs. The server checks either
 * on every save.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowLeftRight, ChevronLeft, ClipboardList, Flame, Pencil } from '@/components/icons';
import { LIMITS, type StadiumLook } from '@/lib/franchise/model';
import type { FranchiseStory } from '@/lib/archive/franchises';

export interface FranchiseInfo {
  franchiseId: string;
  identity: { color: string | null; motto: string | null; bio: string | null; logoUrl: string | null; stadiumName: string | null; look: StadiumLook | null };
  manager: { name: string } | null;
  pendingClaims: number;
  claimUrl: string | null;
  editUrl: string | null;
  story: FranchiseStory | null;
}

const passKey = (id: string) => `lp_manager_pass:${id}`;

/**
 * The picture for midfield of the franchise's stadium: its uploaded logo, else
 * the team's picture from the provider. Always same-origin (a provider picture
 * goes through Next's image route), since WebGL refuses pictures from other sites.
 */
export function fieldLogo(logoUrl: string | null | undefined, avatar: string | null | undefined): string | null {
  if (logoUrl) return logoUrl;
  if (!avatar) return null;
  const url = /^(https?:\/\/|\/)/.test(avatar) ? avatar : `https://sleepercdn.com/avatars/${avatar}`;
  return url.startsWith('/') ? url : `/_next/image?url=${encodeURIComponent(url)}&w=256&q=80`;
}

/**
 * The franchise; the header to send when editing it (null when this visitor
 * holds no pass); and whether to show this visitor the way into the manage
 * page: a pass in hand, or a LeaguePulse sign-in (the footer's) that manages it.
 */
export function useFranchise(franchiseId: string) {
  const [info, setInfo] = useState<FranchiseInfo | null>(null);
  const [auth, setAuth] = useState<Record<string, string> | null>(null);
  const [mine, setMine] = useState(false);
  /** Signed in to LeaguePulse here (the footer's account), whoever manages this franchise. */
  const [me, setMe] = useState<{ name: string } | null>(null);

  useEffect(() => {
    // A manager's pass arrives in the fragment; move it into this tab's storage and out of the address bar.
    const m = /[#&]lpm=([^&]+)/.exec(window.location.hash);
    if (m) {
      try { sessionStorage.setItem(passKey(franchiseId), m[1]); } catch { /* the pass still works for this view */ }
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    let manager: string | null = m?.[1] ?? null, admin: string | null = null;
    try { manager ??= sessionStorage.getItem(passKey(franchiseId)); admin = sessionStorage.getItem('lp_admin_pass'); } catch { /* none */ }
    setAuth(manager ? { 'x-manager-pass': manager } : admin ? { 'x-admin-password': admin } : null);
    if (manager) { setMine(true); return; }
    let visitor: string | null = null;
    try { visitor = localStorage.getItem('lp_visitor'); } catch { /* none */ }
    if (!visitor) return;
    fetch('/api/account/me', { headers: { 'x-visitor-pass': visitor }, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        setMine(d?.links?.franchise === `/team/${encodeURIComponent(franchiseId)}`);
        if (d?.signedIn) setMe({ name: d.name ?? 'you' });
      })
      .catch(() => {});
  }, [franchiseId]);

  const load = useCallback(() => {
    fetch(`/api/franchises/${encodeURIComponent(franchiseId)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setInfo(d); })
      .catch(() => {});
  }, [franchiseId]);
  useEffect(load, [load]);

  return { info, auth, mine, me, reload: load };
}

export const managePath = (franchiseId: string) => `/team/${encodeURIComponent(franchiseId)}/manage`;

/** The way into the manage page: a quiet pencil, for the franchise's own manager. */
export function ManageLink({ franchiseId }: { franchiseId: string }) {
  return (
    <a href={managePath(franchiseId)} aria-label="Manage your franchise" title="Manage your franchise"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-foreground/30 hover:bg-muted hover:text-foreground">
      <Pencil className="h-3.5 w-3.5" />
    </a>
  );
}

/**
 * Back to wherever the visitor came from on this site; a page opened directly
 * (no history here) goes to `fallback` instead.
 */
export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    // The page before this one on this site (NavMemory), or a full load from it.
    let previous: string | null = null;
    try { previous = sessionStorage.getItem('lp_prev_path'); } catch { /* fallback */ }
    let sameSiteReferrer = false;
    try { sameSiteReferrer = Boolean(document.referrer) && new URL(document.referrer).host === window.location.host; } catch { /* fallback */ }
    setCanGoBack(history.length > 1 && ((previous !== null && previous !== window.location.pathname) || sameSiteReferrer));
  }, []);
  return (
    <a href={fallback} onClick={e => { if (canGoBack) { e.preventDefault(); history.back(); } }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
      <ChevronLeft className="h-3.5 w-3.5" /> {canGoBack ? 'Back' : label}
    </a>
  );
}

/** From every season at once: first picks, trade partners, best and worst days. */
export function FranchiseStorySection({ story }: { story: FranchiseStory }) {
  const games = [
    story.bestGame && { label: 'Best score', g: story.bestGame },
    story.biggestWin && { label: 'Biggest win', g: story.biggestWin },
    story.worstGame && { label: 'Lowest score', g: story.worstGame },
  ].filter(Boolean) as { label: string; g: NonNullable<FranchiseStory['bestGame']> }[];
  if (!games.length && !story.firstPicks.length && !story.tradePartners.length) return null;
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {games.length > 0 && (
          <Card icon={Flame} title="Days to remember">
            <ul className="space-y-2.5">
              {games.map(({ label, g }) => (
                <li key={label}>
                  <p className="text-[11.5px] text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">{g.points.toFixed(2)} <span className="font-normal text-muted-foreground">vs {g.opponent}, {g.opponentPoints.toFixed(2)}</span></p>
                  <p className="text-[11.5px] text-muted-foreground">{g.season}, week {g.week}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {story.firstPicks.length > 0 && (
          <Card icon={ClipboardList} title="First pick, every draft">
            <ul className="space-y-1.5">
              {story.firstPicks.slice(0, 8).map(p => (
                <li key={p.season} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate"><span className="tabular-nums text-muted-foreground">{p.season}</span> {p.player ?? 'Unknown player'}{p.position ? <span className="text-muted-foreground">, {p.position}</span> : null}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">pick {p.pick}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {story.tradePartners.length > 0 && (
          <Card icon={ArrowLeftRight} title={`${story.trades} trade${story.trades === 1 ? '' : 's'}`}>
            <ul className="space-y-1.5">
              {story.tradePartners.slice(0, 6).map(t => (
                <li key={t.franchiseId} className="flex items-baseline justify-between gap-3 text-sm">
                  <a href={`/team/${encodeURIComponent(t.franchiseId)}`} className="truncate hover:underline">{t.manager}</a>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{t.trades} trade{t.trades === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</p>
      {children}
    </div>
  );
}

const SWATCHES = ['#e11d48', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#0284c7', '#4f46e5', '#7c3aed', '#c026d3', '#334155'];

/** The manager's editor for the franchise's public face: logo, color, motto and bio. */
export function IdentityEditor({ info, auth, teamName, onSaved }: {
  info: FranchiseInfo; auth: Record<string, string>; teamName: string; onSaved: () => void;
}) {
  const [color, setColor] = useState(info.identity.color ?? '');
  const [motto, setMotto] = useState(info.identity.motto ?? '');
  const [bio, setBio] = useState(info.identity.bio ?? '');
  const [logo, setLogo] = useState(info.identity.logoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const url = `/api/franchises/${encodeURIComponent(info.franchiseId)}`;
  const headers = { 'content-type': 'application/json', ...auth };

  const fail = (status: number | undefined, msg?: string) =>
    setError(status === 401 ? 'Your editing pass has expired. Open the franchise again from your LeaguePulse account.' : msg ?? 'That did not save. Try again.');

  const upload = async (f: File) => {
    if (f.size > 512 * 1024) { setError('Pick an image under 512KB.'); return; }
    setBusy(true); setError('');
    const dataUri = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
    const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ dataUri }) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok) { setLogo(d.logoUrl); onSaved(); } else fail(r?.status, d?.error);
    setBusy(false);
  };
  const removeLogo = async () => {
    setBusy(true);
    const r = await fetch(url, { method: 'DELETE', headers }).catch(() => null);
    if (r?.ok) { setLogo(null); onSaved(); } else fail(r?.status);
    setBusy(false);
  };
  const save = async () => {
    setBusy(true); setError('');
    const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ color: color || null, motto, bio }) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok) { onSaved(); setSaved(true); setTimeout(() => setSaved(false), 2500); } else fail(r?.status, d?.error);
    setBusy(false);
  };

  return (
    <div>
        <p className="text-[12.5px] text-muted-foreground">The logo and story appear on your franchise page, the logo at midfield too; the color and motto also show in the league&apos;s list of franchises.</p>

        <p className="mt-5 text-[13px] font-semibold">Logo</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-muted text-xl font-bold" style={color ? { boxShadow: `0 0 0 2px ${color}` } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : teamName.slice(0, 1)}
          </span>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <button onClick={() => file.current?.click()} disabled={busy} className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold hover:bg-muted disabled:opacity-60">{logo ? 'Replace' : 'Upload'}</button>
          {logo && <button onClick={removeLogo} disabled={busy} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">Remove</button>}
        </div>

        <p className="mt-5 text-[13px] font-semibold">Color</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {SWATCHES.map(c => (
            <button key={c} onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c}
              className={cn('h-8 w-8 rounded-full transition', color === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : 'hover:scale-110')} style={{ background: c }} />
          ))}
          <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-dashed border-border" title="Custom color">
            <input type="color" value={color || '#334155'} onChange={e => setColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            <span className="flex h-full w-full items-center justify-center text-[15px] text-muted-foreground">+</span>
          </label>
          {color && <button onClick={() => setColor('')} className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">None</button>}
        </div>

        <label className="mt-5 block text-[13px] font-semibold" htmlFor="motto">Motto</label>
        <input id="motto" value={motto} onChange={e => setMotto(e.target.value)} maxLength={LIMITS.motto} placeholder="Defense wins nothing in fantasy."
          className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[15px] outline-none focus:border-foreground/40" />

        <label className="mt-5 block text-[13px] font-semibold" htmlFor="bio">The story</label>
        <textarea id="bio" value={bio} onChange={e => setBio(e.target.value)} maxLength={LIMITS.bio} rows={4}
          placeholder="Founded in a group chat in 2017. Three titles, zero regrets."
          className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-[15px] outline-none focus:border-foreground/40" />
        <p className="mt-1 text-right text-[11.5px] tabular-nums text-muted-foreground">{bio.length}/{LIMITS.bio}</p>

        {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-3">
          <AnimatePresence>{saved && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[13px] font-semibold text-primary">Saved</motion.span>}</AnimatePresence>
          <button onClick={save} disabled={busy} className="rounded-full bg-foreground px-5 py-2.5 text-[14px] font-semibold text-background hover:bg-foreground/85 disabled:opacity-60">{busy ? 'Saving' : 'Save identity'}</button>
        </div>
    </div>
  );
}
