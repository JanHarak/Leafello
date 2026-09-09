import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { AuthLanding } from '@/components/AuthLanding';
import { useAuth } from '@/lib/auth';

/**
 * Route /login. Nepřihlášený uživatel vidí úvodní přihlašovací obrazovku
 * (běžně ji ale zobrazuje už auth gate v _layout). Přihlášený je odsud
 * přesměrován na úvod.
 */
export default function Login() {
  const router = useRouter();
  const { session } = useAuth();
  useEffect(() => {
    if (session) router.replace('/');
  }, [session, router]);
  return <AuthLanding />;
}
