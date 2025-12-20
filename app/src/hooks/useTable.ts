/**
 * useTable hook
 * Manages state and actions for a single table
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useSocket } from '../providers/SocketProvider';
import { useGame } from '../providers/GameProvider';
import { useAuth } from '../providers/AuthProvider';
import type { TableState, GameEvent } from '@foldflop/shared';

interface UseTableReturn {
    tableState: TableState | null;
    isLoading: boolean;
    error: string | null;
    isMyTurn: boolean;
    myCards: string[];
    joinTable: (seatIndex: number, buyIn: number) => Promise<{ success: boolean; error?: string }>;
    leaveTable: () => Promise<{ success: boolean; error?: string }>;
    performAction: (action: string, amount?: number) => Promise<{ success: boolean; error?: string }>;
    refetch: () => Promise<void>;
}

export function useTable(tableId: string): UseTableReturn {
    const { user } = useAuth();
    const { subscribeToTable } = useSocket();
    const { state: gameState, addTable, handleEvent } = useGame();

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Get table state from game context
    const tableState = gameState.tables.get(tableId) ?? null;
    const myCards = tableState?.myCards ?? [];

    // Determine if it's our turn
    const isMyTurn = tableState?.players?.some(
        p => p.id === user?.id && p.isCurrentPlayer
    ) ?? false;

    // Load/refresh table state
    const loadTable = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase.functions.invoke('get-table-state', {
                body: { tableId },
            });

            if (fetchError) throw fetchError;

            if (data.success && data.data) {
                addTable(tableId, data.data);
            }

            setIsLoading(false);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load table');
            setIsLoading(false);
        }
    }, [tableId, addTable]);

    // Load initial table state
    useEffect(() => {
        loadTable();
    }, [loadTable]);

    // Subscribe to real-time events
    useEffect(() => {
        const unsubscribe = subscribeToTable(tableId, (event: GameEvent) => {
            handleEvent(tableId, event);

            // Handle cards dealt specifically for this user
            if (event.type === 'cards_dealt' && 'playerId' in event && event.playerId === user?.id) {
                // Update my cards through game context
            }
        });

        return unsubscribe;
    }, [tableId, subscribeToTable, handleEvent, user?.id]);

    const joinTable = useCallback(async (seatIndex: number, buyIn: number) => {
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('join-table', {
                body: { tableId, seatIndex, buyIn },
            });

            if (invokeError) throw invokeError;

            if (!data.success) {
                return { success: false, error: data.error };
            }

            // Refresh table state after successful join
            await loadTable();

            return { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to join table',
            };
        }
    }, [tableId, loadTable]);

    const leaveTable = useCallback(async () => {
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('leave-table', {
                body: { tableId },
            });

            if (invokeError) throw invokeError;

            if (!data.success) {
                return { success: false, error: data.error };
            }

            return { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to leave table',
            };
        }
    }, [tableId]);

    const performAction = useCallback(async (action: string, amount?: number) => {
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('player-action', {
                body: {
                    tableId,
                    action: { type: action, amount },
                    actionId: crypto.randomUUID(),
                },
            });

            if (invokeError) throw invokeError;

            if (!data.success) {
                return { success: false, error: data.error };
            }

            return { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to perform action',
            };
        }
    }, [tableId]);

    return {
        tableState,
        isLoading,
        error,
        isMyTurn,
        myCards,
        joinTable,
        leaveTable,
        performAction,
        refetch: loadTable,
    };
}
