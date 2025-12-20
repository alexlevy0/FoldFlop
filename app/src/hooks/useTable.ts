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

interface WinnerInfo {
    playerId: string;
    playerName: string;
    amount: number;
    hand?: {
        rank: string;
        cards: string[];
        description: string;
    } | null;
}

interface ActionInfo {
    playerId: string;
    playerName: string;
    seat: number;
    action: string;
    amount: number;
    phase: string;
    timestamp: number;
}

interface UseTableReturn {
    tableState: TableState | null;
    isLoading: boolean;
    error: string | null;
    isMyTurn: boolean;
    myCards: string[];
    lastWinner: WinnerInfo | null;
    lastAction: ActionInfo | null;
    joinTable: (seatIndex: number, buyIn: number) => Promise<{ success: boolean; error?: string }>;
    leaveTable: () => Promise<{ success: boolean; error?: string }>;
    performAction: (action: string, amount?: number) => Promise<{ success: boolean; error?: string }>;
    claimTimeout: () => Promise<{ success: boolean; error?: any }>;
    refetch: () => Promise<void>;
}

export function useTable(tableId: string): UseTableReturn {
    const { user } = useAuth();
    const { subscribeToTable } = useSocket();
    const { state: gameState, addTable, handleEvent } = useGame();

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastWinner, setLastWinner] = useState<WinnerInfo | null>(null);
    const [lastAction, setLastAction] = useState<ActionInfo | null>(null);

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

    // Keep a ref to tableState to access latest data in event callbacks without re-subscribing
    const tableStateRef = useRef(tableState);
    useEffect(() => {
        tableStateRef.current = tableState;
    }, [tableState]);

    // Subscribe to real-time events and auto-refresh
    useEffect(() => {
        const unsubscribe = subscribeToTable(tableId, (event: GameEvent) => {
            console.log('Realtime event received:', event.type);
            handleEvent(tableId, event);

            // Auto-refresh on important events
            if (
                event.type === 'player_joined' ||
                event.type === 'player_left' ||
                event.type === 'player_action' ||
                event.type === 'hand_started' ||
                event.type === 'phase_changed' ||
                event.type === 'hand_complete' ||
                event.type === 'table_reset'
            ) {
                // Debounce to avoid too many refreshes
                setTimeout(() => {
                    loadTable();
                }, 100);
            }

            // Capture winner info from hand_complete event
            if (event.type === 'hand_complete' && 'winners' in event) {
                const eventAny = event as any;
                console.log('[useTable] Hand Complete Event:', JSON.stringify(eventAny.winners));

                if (eventAny.winners && eventAny.winners.length > 0) {
                    const winnerData = eventAny.winners[0];

                    // Try to find player name from latest table state if missing in event
                    let playerName = winnerData.playerName;
                    if (!playerName || playerName === 'Player') {
                        const currentPlayers = tableStateRef.current?.players || [];
                        const p = currentPlayers.find((p: any) => p.id === winnerData.playerId);
                        if (p) playerName = p.username;
                    }
                    // Fallback
                    if (!playerName) playerName = 'Player';

                    setLastWinner({
                        playerId: winnerData.playerId,
                        playerName: playerName,
                        amount: winnerData.amount ?? eventAny.pot ?? 0,
                        hand: winnerData.hand ? {
                            rank: winnerData.hand.rank,
                            // Robust mapping: handle both {rank, suit} objects and "Ah" strings
                            cards: winnerData.hand.cards.map((c: any) =>
                                typeof c === 'string' ? c : (c.rank && c.suit ? c.rank + c.suit : '??')
                            ),
                            description: winnerData.hand.description
                        } : null
                    });
                    // Clear winner after 10 seconds
                    setTimeout(() => setLastWinner(null), 10000);
                }
            }

            // Capture player_action events from all players for synced history
            if (event.type === 'player_action') {
                const actionEvent = event as any;
                console.log('[useTable] Received player_action:', actionEvent.playerName, actionEvent.action, actionEvent.phase);
                setLastAction({
                    playerId: actionEvent.playerId,
                    playerName: actionEvent.playerName || 'Player',
                    seat: actionEvent.seat ?? 0,
                    action: actionEvent.action,
                    amount: actionEvent.amount ?? 0,
                    phase: actionEvent.phase || 'unknown',
                    timestamp: actionEvent.timestamp || Date.now(),
                });
            }

            // Handle cards dealt specifically for this user
            if (event.type === 'cards_dealt' && 'playerId' in event && event.playerId === user?.id) {
                // Update my cards through game context
                loadTable();
            }
        });

        return unsubscribe;
    }, [tableId, subscribeToTable, handleEvent, user?.id, loadTable]);

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

    const claimTimeout = useCallback(async () => {
        try {
            const { data, error: invokeError } = await supabase.functions.invoke('player-timeout', {
                body: { tableId },
            });

            if (invokeError) throw invokeError;
            if (!data.success) {
                console.warn('Claim timeout failed:', data.error);
                return { success: false, error: data.error };
            }
            return { success: true };
        } catch (err) {
            console.error('Claim timeout error:', err);
            return { success: false, error: 'Failed' };
        }
    }, [tableId]);

    return {
        tableState,
        isLoading,
        error,
        isMyTurn,
        myCards,
        lastWinner,
        lastAction,
        joinTable,
        leaveTable,
        performAction,
        claimTimeout,
        refetch: loadTable,
    };
}
