import { SignIn } from '@clerk/nextjs';
import AuthFrame from '@/components/platform/AuthFrame';

export const metadata = { title: 'Sign in | LeaguePulse' };

export default function SignInPage() {
  return <AuthFrame><SignIn /></AuthFrame>;
}
