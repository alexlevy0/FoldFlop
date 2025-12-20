/**
 * Authentication Provider
 * Manages user session, login, signup, and logout
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, type User, type Session } from '../lib/supabase';

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
    signInWithGoogle: () => Promise<{ error?: string }>;
    signInWithApple: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        session: null,
        isLoading: true,
        isAuthenticated: false,
    });

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setState({
                user: session?.user ?? null,
                session,
                isLoading: false,
                isAuthenticated: !!session,
            });
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setState({
                    user: session?.user ?? null,
                    session,
                    isLoading: false,
                    isAuthenticated: !!session,
                });
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return { error: error.message };
        }

        return {};
    }, []);

    const signUp = useCallback(async (email: string, password: string, username: string) => {
        // Check username availability first
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .single();

        if (existing) {
            return { error: 'Username is already taken' };
        }

        const { data: authData, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username,
                },
            },
        });

        if (error) {
            return { error: error.message };
        }

        // Create profile manually (in case database trigger doesn't work)
        if (authData.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    username: username,
                    chips: 10000, // Starting chips (welcome bonus)
                    welcome_bonus_claimed: true,
                }, {
                    onConflict: 'id',
                });

            if (profileError) {
                console.error('Profile creation error:', profileError);
                // Don't fail the signup, profile might have been created by trigger
            }
        }

        return {};
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const signInWithGoogle = useCallback(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
        });

        if (error) {
            return { error: error.message };
        }

        return {};
    }, []);

    const signInWithApple = useCallback(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'apple',
        });

        if (error) {
            return { error: error.message };
        }

        return {};
    }, []);

    const value: AuthContextValue = {
        ...state,
        signIn,
        signUp,
        signOut,
        signInWithGoogle,
        signInWithApple,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
