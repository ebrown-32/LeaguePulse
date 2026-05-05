import './globals.css';
import { Space_Grotesk, DM_Sans } from 'next/font/google';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeInjector } from '@/components/ThemeInjector';
import { getTheme } from '@/lib/themeStorage';

const displayFont = Space_Grotesk({
  subsets:  ['latin'],
  variable: '--font-display',
  weight:   ['400', '500', '600', '700'],
  display:  'swap',
});

const bodyFont = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-body',
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
  const theme = await getTheme();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`
          ${displayFont.variable} ${bodyFont.variable}
          min-h-screen bg-background text-foreground antialiased
        `}
      >
        <ThemeInjector />
        <ThemeProvider>
          <div className="flex min-h-screen flex-col">
            <Navbar logoUrl={theme.logoUrl} leagueName={theme.leagueName} />
            <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]">
              {children}
            </main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
