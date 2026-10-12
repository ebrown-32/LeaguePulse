import { Suspense } from 'react';
import Onboarding from '@/components/platform/Onboarding';

export default function StartPage() {
  // Suspense: the flow reads the URL (a username passed from the front page).
  return <Suspense><Onboarding /></Suspense>;
}
