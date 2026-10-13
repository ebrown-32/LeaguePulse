import { SignUp } from '@clerk/nextjs';
import AuthFrame from '@/components/platform/AuthFrame';

export const metadata = { title: 'Create your account | LeaguePulse' };

export default function SignUpPage() {
  return <AuthFrame><SignUp /></AuthFrame>;
}
