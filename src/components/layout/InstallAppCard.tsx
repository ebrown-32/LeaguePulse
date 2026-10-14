'use client';

/**
 * The footer's small "Install as an App" link: a one-tap install on Android,
 * the steps on an iPhone. Hidden on a computer and once already installed.
 */

import { useInstallPrompt } from '@/components/pwa/InstallPromptProvider';
import { AddSquareIcon, DownloadIcon } from '@/components/icons/AppIcons';

export default function InstallAppCard() {
  const { platform, isStandalone, canInstallNatively, promptInstall, openModal } = useInstallPrompt();
  if (isStandalone || platform === 'other') return null;
  const native = platform === 'android' && canInstallNatively;

  return (
    <button
      type="button"
      onClick={() => (native ? promptInstall() : openModal())}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {native ? <DownloadIcon className="h-3.5 w-3.5" /> : <AddSquareIcon className="h-3.5 w-3.5" />}
      Install as an App
    </button>
  );
}
