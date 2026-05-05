import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { GithubIcon, ExternalLink, Settings } from 'lucide-react';
import { getTheme } from '@/lib/themeStorage';

export default async function Footer() {
  const theme = await getTheme();
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-border/50 bg-card/50 backdrop-blur-sm">
      {/* Top gradient line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-10 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">

          {/* Brand */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Logo src={theme.logoUrl} />
              {theme.leagueName ? (
                <div className="flex flex-col leading-none">
                  <span className="font-display text-sm font-semibold text-foreground">{theme.leagueName}</span>
                  <span className="text-[9px] font-medium tracking-widest text-primary/70 uppercase">powered by League Pulse</span>
                </div>
              ) : (
                <span className="font-display text-sm font-semibold uppercase tracking-widest text-foreground">
                  League <span className="text-primary">Pulse</span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground max-w-[20rem] leading-relaxed">
              Give your league some life.
            </p>
          </div>

          {/* GitHub CTA */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Open Source
            </p>
            <a
              href="https://github.com/ebrown-32/LeaguePulse"
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex items-center gap-2 rounded-md border border-border/60
                bg-background/60 px-3 py-2 text-sm font-medium text-foreground
                hover:border-primary/30 hover:text-primary hover:bg-primary/5
                group transition-colors
              "
            >
              <GithubIcon className="h-4 w-4" />
              <span>View on GitHub</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary ml-0.5" />
            </a>
          </div>

          {/* Admin */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Settings
            </p>
            <Link
              href="/admin/appearance"
              className="
                inline-flex items-center gap-2 rounded-md border border-border/60
                bg-background/60 px-3 py-2 text-sm font-medium text-foreground
                hover:border-primary/30 hover:text-primary hover:bg-primary/5
                group transition-colors
              "
            >
              <Settings className="h-4 w-4" />
              <span>Appearance</span>
            </Link>
          </div>

          {/* Credits */}
          <div className="flex flex-col gap-1 items-start md:items-end">
            <p className="text-xs text-muted-foreground">
              © {year}{' '}
              <a
                href="https://elibrown.info"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                Eli Brown
              </a>
            </p>
            <p className="text-[10px] text-muted-foreground/50">
              Data sourced from Sleeper. Not affiliated with Sleeper.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
