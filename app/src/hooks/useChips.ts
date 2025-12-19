/**
 * useChips hook
 * Manages user chip balance and transactions
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

interface ChipsState {
    balance: number;
    isLoading: boolean;
    error: string | null;
    canClaimDailyBonus: boolean;
    hasClaimedWelcomeBonus: boolean;
}

interface UseChipsReturn extends ChipsState {
    refresh: () => Promise<void>;
    claimDailyBonus: () => Promise<{ success: boolean; amount?: number; error?: string }>;
    claimWelcomeBonus: () => Promise<{ success: boolean; amount?: number; error?: string }>;
}

export function useChips(): UseChipsReturn {
    const { user, isAuthenticated } = useAuth();
    const [state, setState] = useState<ChipsState>({
        balance: 0,
        isLoading: true,
        error: null,
        canClaimDailyBonus: false,
        hasClaimedWelcomeBonus: true,
    });

    const refresh = useCallback(async () => {
        if (!user) {
            setState(prev => ({ ...prev, isLoading: false, balance: 0 }));
            return;
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('chips, last_daily_bonus, welcome_bonus_claimed')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            // Check if daily bonus can be claimed
            const lastBonus = data.last_daily_bonus ? new Date(data.last_daily_bonus) : null;
            const today = new Date();
            const canClaim = !lastBonus || lastBonus.toDateString() !== today.toDateString();

            setState({
                balance: data.chips ?? 0,
                isLoading: false,
                error: null,
                canClaimDailyBonus: canClaim,
                hasClaimedWelcomeBonus: data.welcome_bonus_claimed,
            });
        } catch (err) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to load chips',
            }));
        }
    }, [user]);

    useEffect(() => {
        if (isAuthenticated) {
            refresh();
        }
    }, [isAuthenticated, refresh]);

    const claimDailyBonus = useCallback(async () => {
        if (!user) return { success: false, error: 'Not logged in' };

        try {
            const { data, error } = await supabase.functions.invoke('claim-bonus', {
                body: { bonusType: 'daily' },
            });

            if (error) throw error;

            if (data.success) {
                setState(prev => ({
                    ...prev,
                    balance: data.data.newBalance,
                    canClaimDailyBonus: false,
                }));
                return { success: true, amount: data.data.amount };
            }

            return { success: false, error: data.error };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to claim bonus',
            };
        }
    }, [user]);

    const claimWelcomeBonus = useCallback(async () => {
        if (!user) return { success: false, error: 'Not logged in' };

        try {
            const { data, error } = await supabase.functions.invoke('claim-bonus', {
                body: { bonusType: 'welcome' },
            });

            if (error) throw error;

            if (data.success) {
                setState(prev => ({
                    ...prev,
                    balance: data.data.newBalance,
                    hasClaimedWelcomeBonus: true,
                }));
                return { success: true, amount: data.data.amount };
            }

            return { success: false, error: data.error };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to claim bonus',
            };
        }
    }, [user]);

    return {
        ...state,
        refresh,
        claimDailyBonus,
        claimWelcomeBonus,
    };
}
