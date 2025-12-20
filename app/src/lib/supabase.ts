/**
 * Supabase client initialization
 */

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Use local Supabase by default (set EXPO_PUBLIC_USE_PROD=true to use production)
const useProd = process.env.EXPO_PUBLIC_USE_PROD === 'true';

const supabaseUrl = useProd
    ? (Constants.expoConfig?.extra?.supabaseUrlProd ?? '')
    : (Constants.expoConfig?.extra?.supabaseUrl ?? 'http://127.0.0.1:54321');

const supabaseAnonKey = useProd
    ? (Constants.expoConfig?.extra?.supabaseAnonKeyProd ?? '')
    : (Constants.expoConfig?.extra?.supabaseAnonKey ?? '');

// Custom storage adapter for React Native
const ExpoSecureStoreAdapter = {
    getItem: async (key: string): Promise<string | null> => {
        if (Platform.OS === 'web') {
            return localStorage.getItem(key);
        }
        return SecureStore.getItemAsync(key);
    },
    setItem: async (key: string, value: string): Promise<void> => {
        if (Platform.OS === 'web') {
            localStorage.setItem(key, value);
            return;
        }
        await SecureStore.setItemAsync(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
        if (Platform.OS === 'web') {
            localStorage.removeItem(key);
            return;
        }
        await SecureStore.deleteItemAsync(key);
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// Export types
export type { User, Session } from '@supabase/supabase-js';
