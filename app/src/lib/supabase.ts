/**
 * Supabase klient pro aplikaci. Používá jen VEŘEJNÉ hodnoty z EXPO_PUBLIC_*
 * (URL a anon klíč). Service role klíč ani jiná tajemství tu nikdy nejsou.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Na webu se po OAuth redirectu vytáhne session z URL; na nativu ne.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
