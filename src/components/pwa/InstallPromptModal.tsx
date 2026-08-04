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

function Step({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
        {icon}
      </div>
      <p className="text-sm text-foreground leading-snug">{children}</p>
    </div>
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
              <div className="flex items-center gap-3 mb-5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-border shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl || '/logo.png'} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-foreground leading-tight">Add {appName} to Your Home Screen</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Faster access, full screen, no browser bars.</p>
                </div>
              </div>

              {platform === 'ios' && (
                <div className="space-y-4">
                  <Step icon={<ShareIosIcon className="h-4.5 w-4.5" />}>
                    Tap the <strong className="font-semibold">Share</strong> button in Safari's toolbar
                  </Step>
                  <Step icon={<AddSquareIcon className="h-4.5 w-4.5" />}>
                    Scroll down and tap <strong className="font-semibold">Add to Home Screen</strong>
                  </Step>
                  <Step icon={<span className="text-sm font-bold">✓</span>}>
                    Tap <strong className="font-semibold">Add</strong> in the top right to confirm
                  </Step>
                </div>
              )}

              {platform === 'android' && canInstallNatively && (
                <button
                  onClick={onInstall}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Install App
                </button>
              )}

              {platform === 'android' && !canInstallNatively && (
                <div className="space-y-4">
                  <Step icon={<MenuDotsIcon className="h-4.5 w-4.5" />}>
                    Tap the <strong className="font-semibold">menu</strong> button in your browser's toolbar
                  </Step>
                  <Step icon={<AddSquareIcon className="h-4.5 w-4.5" />}>
                    Select <strong className="font-semibold">Add to Home Screen</strong> or <strong className="font-semibold">Install App</strong>
                  </Step>
                </div>
              )}

              <div className="flex items-center justify-center gap-6 mt-6 pt-5 border-t border-border">
                <button
                  onClick={() => onClose(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Maybe later
                </button>
                <button
                  onClick={() => onClose(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Don't show again
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
