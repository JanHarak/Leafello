/**
 * Autentizace přes Supabase: Google OAuth a e-mailový magic link (bez hesla,
 * jak požaduje MVP). Session drží kontext, komponenty čtou přes useAuth().
 */
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

interface AuthValue {
  session: Session | null;
  loading: boolean;
  /** Uživatel přišel přes odkaz „obnova hesla" a má nastavit nové heslo. */
  recovery: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  /** Pošle e-mail s odkazem pro obnovu zapomenutého hesla. */
  resetPassword: (email: string) => Promise<void>;
  /** Nastaví nové heslo (v recovery session po kliknutí na odkaz). */
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

function redirectTo(): string {
  // Web: aktuální origin; nativ: hluboký odkaz do appky (schéma Leafello://).
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return Linking.createURL('/');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      console.log('[auth] initial session:', data.session?.user?.email ?? 'none', error ? 'error: ' + error.message : '');
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      console.log('[auth] change:', event, next?.user?.email ?? 'none');
      // Supabase re-emituje událost i při návratu na tab (visibilitychange).
      // Když je to stejná session (stejný token i uživatel), nech starou
      // referenci – jinak by se všude zbytečně přenačítala data.
      setSession((prev) =>
        prev?.access_token === next?.access_token && prev?.user?.id === next?.user?.id ? prev : next,
      );
      // Po kliknutí na odkaz „obnova hesla" Supabase vytvoří dočasnou session
      // a vyšle tuto událost – přepneme aplikaci na obrazovku pro nové heslo.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthValue = {
    session,
    loading,
    recovery,
    async signInWithGoogle() {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo() },
      });
    },
    async signInWithEmail(email: string) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
    },
    async signInWithPassword(email: string, password: string) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUpWithPassword(email: string, password: string) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
      // Když je v Supabase zapnuté potvrzení e-mailu, session zatím není –
      // uživatel musí kliknout na potvrzovací odkaz.
      return { needsConfirmation: !data.session };
    },
    async resetPassword(email: string) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo(),
      });
      if (error) throw error;
    },
    async updatePassword(newPassword: string) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setRecovery(false);
    },
    async signOut() {
      setRecovery(false);
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth musí být uvnitř AuthProvider.');
  return ctx;
}
