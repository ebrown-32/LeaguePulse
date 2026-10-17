'use client';

/**
 * A slim bar under the header for the people who run the site, while its
 * setup is unfinished (lib/setup): how much is left and the way into the
 * admin's setup guide. Only the league's owner and admins ever see it, and
 * never on the admin itself.
 *
 * Its X hides it for good, for every admin, along with the admin's own
 * guide (a hidden guide is the one thing that never comes back on its own).
 *
 * Who is looking comes from the same visitor pass as the account menu
 * (AccountChip); a site without accounts never shows it.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from '@/components/icons';

const PASS_KEY = 'lp_visitor';
/** Hidden in this browser at once, in case the save doesn't make it. */
const HIDDEN_KEY = 'lp_setup_hidden';

export default function SetupBar() {
  const pathname = usePathname();
  const [setup, setSetup] = useState<{ left: number; total: number; href: string; pass: string } | null>(null);

  useEffect(() => {
    try { if (localStorage.getItem(HIDDEN_KEY)) return; } catch { /* show it */ }
    // The pass may still be in the address, handed back by the product site a moment ago.
    let pass = /[#&]lpv=([^&]+)/.exec(window.location.hash)?.[1] ?? null;
    try { pass ??= localStorage.getItem(PASS_KEY); } catch { /* none */ }
    if (!pass) return;
    fetch('/api/account/me', { headers: { 'x-visitor-pass': pass }, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.setup && d.links?.setup && pass) setSetup({ ...d.setup, href: d.links.setup, pass }); })
      .catch(() => {});
  }, []);

  const hide = () => {
    if (!setup) return;
    try { localStorage.setItem(HIDDEN_KEY, '1'); } catch { /* the save below still counts */ }
    fetch('/api/account/setup', { method: 'POST', headers: { 'x-visitor-pass': setup.pass } }).catch(() => {});
    setSetup(null);
  };
  const shown = setup && !pathname.startsWith('/admin');

  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-b border-primary/25 bg-primary/[0.08]">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <p className="min-w-0 flex-1 text-[13px] leading-snug">
              <span className="font-semibold">Your site is live.</span>{' '}
              <span className="text-muted-foreground">
                Finish setting it up: {setup.left} of {setup.total} step{setup.total === 1 ? '' : 's'} left.
              </span>
            </p>
            <a href={setup.href}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground transition hover:bg-primary/90">
              Set up <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <button onClick={hide} aria-label="Hide for good"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
