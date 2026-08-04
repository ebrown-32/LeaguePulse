'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import InstallPromptModal from './InstallPromptModal';

type Platform = 'ios' | 'android' | 'other';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptContextValue {
  platform: Platform;
  isStandalone: boolean;
  canInstallNatively: boolean;
  promptInstall: () => Promise<void>;
  openModal: () => void;
}

const InstallPromptContext = createContext<InstallPromptContextValue | null>(null);

export function useInstallPrompt() {
  const ctx = useContext(InstallPromptContext);
  if (!ctx) throw new Error('useInstallPrompt must be used within InstallPromptProvider');
  return ctx;
}

const DISMISSED_KEY = 'lp-install-prompt-dismissed';
const AUTO_SHOW_DELAY_MS = 2500;

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

interface InstallPromptProviderProps {
  children: ReactNode;
  logoUrl?: string | null;
  leagueName?: string | null;
}

export function InstallPromptProvider({ children, logoUrl, leagueName }: InstallPromptProviderProps) {
  const [platform, setPlatform] = useState<Platform>('other');
  const [isStandalone, setIsStandalone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstallNatively, setCanInstallNatively] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsStandalone(detectStandalone());

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstallNatively(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (isStandalone || platform === 'other') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const timer = setTimeout(() => setShowModal(true), AUTO_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isStandalone, platform]);

  const promptInstall = async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt.current = null;
    setCanInstallNatively(false);
    setShowModal(false);
  };

  const closeModal = (dismissPermanently: boolean) => {
    setShowModal(false);
    if (dismissPermanently) localStorage.setItem(DISMISSED_KEY, '1');
  };

  return (
    <InstallPromptContext.Provider
      value={{ platform, isStandalone, canInstallNatively, promptInstall, openModal: () => setShowModal(true) }}
    >
      {children}
      <InstallPromptModal
        open={showModal}
        platform={platform}
        canInstallNatively={canInstallNatively}
        onInstall={promptInstall}
        onClose={closeModal}
        logoUrl={logoUrl}
        leagueName={leagueName}
      />
    </InstallPromptContext.Provider>
  );
}
