import { ClerkProvider } from '@clerk/nextjs';

/**
 * Clerk for the product site only (see lib/platform/account). Styled to the
 * LeaguePulse identity so its sign-in screens read as part of the site.
 */
export default function ProductAuth({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/account"
      signUpFallbackRedirectUrl="/account"
      appearance={{
        variables: {
          colorPrimary: '#0A7550',
          colorDanger: '#EE5A2E',
          colorForeground: '#121417',
          colorMutedForeground: '#585D66',
          colorBorder: '#E1DFD8',
          colorBackground: '#FFFFFF',
          borderRadius: '0.75rem',
          fontFamily: 'var(--font-body-fallback), system-ui, sans-serif',
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
