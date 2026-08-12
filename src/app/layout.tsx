import './globals.css';
import { unstable_noStore as noStore } from 'next/cache';
import { Space_Grotesk, DM_Sans } from 'next/font/google';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import PageTransition from '@/components/layout/PageTransition';
import ChatWidget from '@/components/chat/ChatWidget';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeInjector } from '@/components/ThemeInjector';
import { InstallPromptProvider } from '@/components/pwa/InstallPromptProvider';
import { getTheme } from '@/lib/themeStorage';
import Analytics from '@/components/analytics/Analytics';

const displayFont = Space_Grotesk({
  subsets:  ['latin'],
  variable: '--font-display-fallback',
  weight:   ['400', '500', '600', '700'],
  display:  'swap',
});

const bodyFont = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-body-fallback',
  weight:   ['300', '400', '500', '600', '700'],
  display:  'swap',
});

export const metadata = {
  title: 'League Pulse',
  description: 'A new way to consume fantasy football. Give your league a pulse.',
  icons: {
    icon:     [{ url: '/logo.png', href: '/logo.png' }],
    shortcut: '/logo.png',
    apple:    '/logo.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Same reason as ThemeInjector: the nav/footer league name and logo come
  // from admin-saved theme storage, so this must never be served from a
  // cached render or an admin save appears to "not apply" until redeploy.
  noStore();
  const theme = await getTheme();

  return (
    <html lang="en" data-bg={theme.background} data-motion={theme.motion} suppressHydrationWarning>
      <body
        className={`
          ${displayFont.variable} ${bodyFont.variable}
          min-h-screen bg-background text-foreground antialiased
        `}
      >
        <ThemeInjector />
        <ThemeProvider>
          <InstallPromptProvider logoUrl={theme.logoUrl} leagueName={theme.leagueName}>
            <Analytics />
            <div className="flex min-h-screen flex-col">
              <Navbar logoUrl={theme.logoUrl} leagueName={theme.leagueName} />
              <main className="flex-1 pb-[env(safe-area-inset-bottom)]">
                <PageTransition>{children}</PageTransition>
              </main>
              <Footer />
              <ChatWidget />
            </div>
          </InstallPromptProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
