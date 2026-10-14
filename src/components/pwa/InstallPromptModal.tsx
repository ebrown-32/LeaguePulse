'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CloseIcon } from '@/components/icons/MediaIcons';
import { ShareIosIcon, AddSquareIcon, DownloadIcon, MenuDotsIcon } from '@/components/icons/AppIcons';

interface InstallPromptModalProps {
  open: boolean;
  platform: 'ios' | 'android' | 'other';
  canInstallNatively: boolean;
  onInstall: () => void;
  onClose: (dismissPermanently: boolean) => void;
  logoUrl?: string | null;
  leagueName?: string | null;
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15 + n * 0.08 }}
      className="flex items-center gap-3"
    >
      <span className="w-4 shrink-0 text-center text-[11px] font-bold tabular-nums text-muted-foreground">{n}</span>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="text-sm leading-snug text-foreground">{children}</p>
    </motion.li>
  );
}

export default function InstallPromptModal({
  open, platform, canInstallNatively, onInstall, onClose, logoUrl, leagueName,
}: InstallPromptModalProps) {
  const appName = leagueName || 'League Pulse';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => onClose(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="relative w-full max-w-md rounded-t-3xl border border-border bg-card shadow-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-1 flex justify-center pt-2.5">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>

            <button
              onClick={() => onClose(false)}
              aria-label="Close"
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            <div className="p-6 pt-8">
              <div className="mb-5 flex items-center gap-4">
                {/* A preview of the icon as it will sit on the home screen. */}
                <div className="flex w-16 shrink-0 flex-col items-center">
                  <motion.div
                    initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
                    className="relative h-16 w-16 overflow-hidden rounded-[18px] border border-border bg-white shadow-lg"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl || '/brand/leaguepulse-192.png'} alt="" className="h-full w-full object-cover" />
                  </motion.div>
                  <span className="mt-1.5 w-full truncate text-center text-[10.5px] font-medium text-muted-foreground">{appName}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight text-foreground">Install {appName} as an App</h2>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                    It lives on your home screen and opens full screen, one tap from Sunday&apos;s scores. No app store, nothing to download.
                  </p>
                </div>
              </div>

              {platform === 'ios' && (
                <ol className="space-y-3.5">
                  <Step n={1} icon={<ShareIosIcon className="h-5 w-5" />}>
                    Tap <strong className="font-semibold">Share</strong> in Safari&apos;s toolbar
                  </Step>
                  <Step n={2} icon={<AddSquareIcon className="h-5 w-5" />}>
                    Choose <strong className="font-semibold">Add to Home Screen</strong>
                  </Step>
                  <Step n={3} icon={<span className="text-sm font-bold">✓</span>}>
                    Tap <strong className="font-semibold">Add</strong>. That&apos;s it, it&apos;s an app now.
                  </Step>
                </ol>
              )}

              {platform === 'android' && canInstallNatively && (
                <button
                  onClick={onInstall}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Install as an App
                </button>
              )}

              {platform === 'android' && !canInstallNatively && (
                <ol className="space-y-3.5">
                  <Step n={1} icon={<MenuDotsIcon className="h-5 w-5" />}>
                    Tap the <strong className="font-semibold">menu</strong> in your browser&apos;s toolbar
                  </Step>
                  <Step n={2} icon={<AddSquareIcon className="h-5 w-5" />}>
                    Choose <strong className="font-semibold">Install app</strong> or <strong className="font-semibold">Add to Home screen</strong>
                  </Step>
                </ol>
              )}

              <div className="flex items-center justify-center gap-6 mt-6 pt-5 border-t border-border">
                <button
                  onClick={() => onClose(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Not now
                </button>
                <button
                  onClick={() => onClose(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Don&apos;t ask again
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
