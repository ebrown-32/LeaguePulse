import Link from 'next/link';
import { cn } from '@/lib/utils';
import { productDisplay } from './fonts';
import { Logomark } from './marks';
import { PLATFORM } from '@/lib/platform/config';

/** The product site's frame around Clerk's sign-in and sign-up screens. */
export default function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn('lp-brand flex min-h-screen flex-col items-center px-4 py-10 font-body', productDisplay.variable)}>
      <Link href="/" className="flex items-center gap-2.5">
        <Logomark size={34} />
        <span className="lp-wordmark text-[22px]">{PLATFORM.name}</span>
      </Link>
      <p className="mt-3 max-w-sm text-center text-[13.5px] text-muted-foreground">
        For commissioners and league admins. Everyone else in your league just opens the link.
      </p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
