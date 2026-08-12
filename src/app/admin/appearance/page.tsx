import { redirect } from 'next/navigation';

/** Appearance moved into the single admin panel at /admin. */
export default function Page() {
  redirect('/admin');
}
