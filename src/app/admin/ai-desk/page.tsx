import { redirect } from 'next/navigation';

/** The AI desk moved into the single admin panel at /admin. */
export default function Page() {
  redirect('/admin');
}
