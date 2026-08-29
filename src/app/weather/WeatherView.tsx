'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Home, Wind, Droplets, Thermometer, AlertTriangle,
} from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingBlock } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';

/**
 * Kickoff weather for the week, and which of the league's starters are in it.
 *
 * The order is deliberate: games with something worth knowing float to the
 * top. A page that lists sixteen fixtures in schedule order buries the one
 * 25mph game nobody noticed, which is the only reason to open this at all.
 */

interface GameWeather {
  id: string;
  kickoff: string;
  venue: string;
  city: string;
  indoor: boolean;
  status: 'forecast' | 'roof' | 'played' | 'too-far-out';
  teams: string[];
  weather: {
    tempF: number; feelsF: number; windMph: number; gustMph: number | null;
    precipChance: number; label: string; icon: string;
  } | null;
  flags: string[];
  affected: { teamName: string; players: { name: string; position: string; nflTeam: string }[] }[];
}
interface Report {
  week: number;
  season: string;
  games: GameWeather[];
  nothingToShow: boolean;
  note: string | null;
}

const ICONS: Record<string, typeof Sun> = {
  sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning, fog: CloudFog,
};

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export default function WeatherView() {
  const [report, setReport] = useState<Report | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/weather')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setReport(d.report);
        setReason(d.reason ?? null);
      })
      .catch(() => setError('Could not load the forecast.'));
  }, []);

  const subtitle = report
    ? `Week ${report.week}, ${report.season}. Conditions at kickoff, and who you have playing in them.`
    : 'Conditions at kickoff for every game on the slate.';

  // Anything flagged first, then the rest by kickoff.
  const ordered = report
    ? [...report.games].sort((a, b) =>
        (b.flags.length > 0 ? 1 : 0) - (a.flags.length > 0 ? 1 : 0) ||
        new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    : [];

  return (
    <PageLayout title="Weather" subtitle={subtitle}>
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-500">{error}</div>
      )}
      {!report && !error && !reason && <LoadingBlock size={16} />}
      {reason && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {reason}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {report.note && (
            <p className="rounded-xl border border-border bg-muted/30 p-3 text-[13px] text-muted-foreground">
              {report.note}
            </p>
          )}

          {ordered.map((g, i) => {
            const Icon = g.weather ? (ICONS[g.weather.icon] ?? Cloud) : Home;
            const flagged = g.flags.length > 0;
            return (
              <motion.section
                key={g.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.03 }}
                className={cn(
                  'rounded-xl border bg-card p-4',
                  flagged ? 'border-amber-500/40' : 'border-border',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    flagged ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground',
                  )}>
                    <Icon className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-display text-[15px] font-bold text-foreground">
                        {g.teams.join(' at ')}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{kickoffLabel(g.kickoff)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {g.venue}{g.city ? `, ${g.city}` : ''}
                    </p>

                    {g.weather ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                          {Math.round(g.weather.tempF)}&deg;F
                          {Math.abs(g.weather.feelsF - g.weather.tempF) >= 4 && (
                            <span className="text-muted-foreground">
                              (feels {Math.round(g.weather.feelsF)}&deg;)
                            </span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Wind className="h-3.5 w-3.5 text-muted-foreground" />
                          {Math.round(g.weather.windMph)} mph
                          {g.weather.gustMph != null && g.weather.gustMph > g.weather.windMph + 5 && (
                            <span className="text-muted-foreground">
                              (gusts {Math.round(g.weather.gustMph)})
                            </span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
                          {g.weather.precipChance}%
                        </span>
                        <span className="text-muted-foreground">{g.weather.label}</span>
                      </div>
                    ) : (
                      <p className="mt-2 text-[13px] text-muted-foreground">
                        {g.status === 'roof' ? 'Played under a roof, conditions are irrelevant'
                          : g.status === 'played' ? 'Already kicked off'
                          : 'Too far out to forecast'}
                      </p>
                    )}

                    {flagged && (
                      <ul className="mt-2 space-y-1">
                        {g.flags.map(f => (
                          <li key={f} className="flex items-start gap-1.5 text-[12px] text-amber-500">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}

                    {g.affected.length > 0 && (
                      <div className="mt-2.5 border-t border-border pt-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          Starters in this game
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {g.affected.map(a => (
                            <p key={a.teamName} className="text-[12px] leading-snug">
                              <span className="font-semibold text-foreground">{a.teamName}</span>
                              <span className="text-muted-foreground">
                                {' '}
                                {a.players.map(p => `${p.name} (${p.position})`).join(', ')}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.section>
            );
          })}

          <p className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Fixtures and venues from ESPN&apos;s public scoreboard, forecasts from{' '}
            <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline">Open-Meteo</a>.
            Sampled at the hour of kickoff rather than as a daily average, because a one o&apos;clock
            and an eight o&apos;clock game in the same city are rarely the same weather. Both are free
            and neither needs an API key.
          </p>
        </div>
      )}
    </PageLayout>
  );
}
