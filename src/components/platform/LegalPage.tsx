import Link from 'next/link';
import { PLATFORM } from '@/lib/platform/config';

/** Shared frame for the terms and privacy pages on the product site. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="lp-brand min-h-screen px-5 py-12 font-body">
      <article className="mx-auto max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-[18px] [&_h2]:font-bold [&_h2]:text-foreground [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary">
        <Link href="/" className="text-[13px] font-semibold text-primary">&larr; {PLATFORM.name}</Link>
        <h1 className="mt-6 font-display text-[32px] font-bold text-foreground">{title}</h1>
        <p className="text-[12.5px]">Last updated {updated}</p>
        {children}
      </article>
    </div>
  );
}
