/**
 * Table Screen - Main game screen for a single table
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { PokerTable, ActionButtons, AICopilotToggle } from '../../src/components/Table';
import { useTable } from '../../src/hooks/useTable';
import { useAuth } from '../../src/providers/AuthProvider';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/styles/theme';

// Helper component to run AI hook
function WaitAIHook({
    myCards,
    communityCards,
    phase,
    isMyTurn,
    gameStateForAI,
    turnId,
    heroSeatIndex,
    setAIPendingAction
}: any) {
    const { useAI } = require('../../src/hooks/useAI');
    const { suggestion } = useAI(
        myCards,
        communityCards,
        phase,
        isMyTurn,
        gameStateForAI,
        turnId,
        heroSeatIndex,
    );

    useEffect(() => {
        if (suggestion && isMyTurn) {
            setAIPendingAction(`${suggestion.action} (${suggestion.confidence.toFixed(0)}%)`);
        }
    }, [suggestion, isMyTurn, setAIPendingAction]);

    return null;
}

export default function TableScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const {
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
        refetch,
    } = useTable(id);

    const [isFullAuto, setIsFullAuto] = useState(true); // AI enabled by default
    const [joinError, setJoinError] = useState('');
    const [isDealing, setIsDealing] = useState(false);
    const [isAIPlaying, setIsAIPlaying] = useState(false);

    // Find hero player and their seat index
    const heroPlayer = tableState?.players?.find(p => p?.id === user?.id) ?? null;
    const heroSeatIndex = heroPlayer?.seatIndex ?? -1;
    const isSeated = !!heroPlayer;
    const playerCount = tableState?.players?.length ?? 0;
    const canStartGame = isSeated && playerCount >= 2 && (tableState?.phase === 'waiting' || !tableState?.phase);

    // Get valid actions (simplified for now)
    const currentBet = (tableState as any)?.currentBet ?? 0;
    const heroCurrentBet = heroPlayer?.currentBet ?? 0;
    const canFold = isMyTurn;
    const canCheck = isMyTurn && currentBet === heroCurrentBet;
    const canCall = isMyTurn && !canCheck && currentBet > 0;
    const callAmount = currentBet - heroCurrentBet;
    const canBet = isMyTurn && currentBet === 0;
    const canRaise = isMyTurn && currentBet > 0;
    const minBet = (tableState as any)?.blinds?.bb ?? 10;
    const maxBet = heroPlayer?.stack ?? 0;
    const minRaise = currentBet * 2;
    const maxRaise = heroPlayer?.stack ?? 0;

    // AI countdown and action history state
    const [aiCountdown, setAICountdown] = useState(0);
    const [aiPendingAction, setAIPendingAction] = useState<string>('');
    const [actionHistory, setActionHistory] = useState<Array<{ key?: string; player: string; action: string; amount?: number; timestamp: number }>>([]);
    const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastTurnIdRef = useRef<string>('');

    // Generate a unique turn ID to detect when a new turn starts
    const phase = (tableState as any)?.phase ?? 'waiting';
    const pot = (tableState as any)?.pot ?? 0;
    const turnId = `${isMyTurn}-${phase}-${pot}-${currentBet}`;

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (aiIntervalRef.current) {
                clearInterval(aiIntervalRef.current);
            }
        };
    }, []);

    // AI Auto-Play - detect new turn and start countdown
    useEffect(() => {
        // If it's not our turn, AI is disabled, or already playing, clear everything
        if (!isFullAuto || !isMyTurn || !isSeated || isAIPlaying) {
            if (aiIntervalRef.current) {
                clearInterval(aiIntervalRef.current);
                aiIntervalRef.current = null;
            }
            setAICountdown(0);
            setAIPendingAction('');
            lastTurnIdRef.current = '';
            return;
        }

        // If this is the same turn ID, don't restart
        if (turnId === lastTurnIdRef.current) {
            return;
        }

        // New turn detected! Clear any existing interval
        if (aiIntervalRef.current) {
            clearInterval(aiIntervalRef.current);
            aiIntervalRef.current = null;
        }
        lastTurnIdRef.current = turnId;

        // Determine what action AI will take
        const toCall = currentBet - heroCurrentBet;
        const willCheck = toCall === 0;
        const willCall = toCall > 0 && (heroPlayer?.stack ?? 0) >= toCall;
        const callAmt = Math.min(toCall, heroPlayer?.stack ?? 0);

        let pendingAction = '🃏 Fold';
        if (willCheck) {
            pendingAction = '✓ Check';
        } else if (willCall) {
            pendingAction = `📞 Call ${callAmt}`;
        }
        setAIPendingAction(pendingAction);

        console.log('[AI] New turn detected:', turnId, '- Will:', pendingAction);

        // Start countdown
        let count = 1; // Faster AI
        setAICountdown(count);

        aiIntervalRef.current = setInterval(() => {
            count--;
            console.log('[AI] Countdown:', count);
            setAICountdown(count);

            if (count <= 0) {
                // Clear interval
                if (aiIntervalRef.current) {
                    clearInterval(aiIntervalRef.current);
                    aiIntervalRef.current = null;
                }

                // Execute action
                console.log('[AI] Executing action:', pendingAction);
                setIsAIPlaying(true);

                // Determine fresh action at execution time
                const execToCall = currentBet - heroCurrentBet;
                const execCheck = execToCall === 0;
                const execCall = execToCall > 0;

                const doAction = async () => {
                    try {
                        if (execCheck) {
                            await performAction('check');
                        } else if (execCall) {
                            const amt = Math.min(execToCall, heroPlayer?.stack ?? 0);
                            await performAction('call', amt);
                        } else {
                            await performAction('fold');
                        }
                        // Action history will be updated via Realtime broadcast
                    } catch (err) {
                        console.error('[AI] Action error:', err);
                        setActionHistory(prev => [...prev.slice(-29), { player: 'SYSTEM', action: `ERROR: ${err}`, timestamp: Date.now() }]);
                    } finally {
                        setIsAIPlaying(false);
                        setAIPendingAction('');
                    }
                };
                doAction();
            }
        }, 1000);

        return () => {
            if (aiIntervalRef.current) {
                clearInterval(aiIntervalRef.current);
                aiIntervalRef.current = null;
            }
        };
    }, [turnId, isFullAuto, isMyTurn, isSeated, isAIPlaying, currentBet, heroCurrentBet, heroPlayer?.stack, heroPlayer?.username, performAction, phase]);

    // Handle manual action (overrides AI)
    const handleAction = useCallback(async (action: string, amount?: number) => {
        // Cancel AI countdown
        if (aiIntervalRef.current) {
            clearInterval(aiIntervalRef.current);
            aiIntervalRef.current = null;
        }
        setAICountdown(0);
        setAIPendingAction('');
        lastTurnIdRef.current = ''; // Allow restart after manual action

        const result = await performAction(action, amount);
        if (!result.success) {
            console.error('Action failed:', result.error);
            Alert.alert('Error', result.error || 'Action failed');
        }
        // Action history will be updated via Realtime broadcast
    }, [performAction]);

    // Add winner to action history
    useEffect(() => {
        if (lastWinner) {
            setActionHistory(prev => [...prev.slice(-29), {
                player: lastWinner.playerName,
                action: `wins ${lastWinner.amount} chips! 🏆`,
                timestamp: Date.now(),
            }]);
        }
    }, [lastWinner]);

    // Sync action history from Realtime (all players' actions)
    useEffect(() => {
        if (lastAction) {
            console.log('[ActionHistory] Received:', lastAction.playerName, lastAction.action, lastAction.phase, lastAction.timestamp);

            // Build unique action key using server timestamp
            const actionKey = `${lastAction.playerId}-${lastAction.action}-${lastAction.phase}-${lastAction.timestamp}`;
            const debugInfo = `[${lastAction.phase}|S${lastAction.seat}]`;
            const actionText = lastAction.amount > 0
                ? `${lastAction.action} ${lastAction.amount} ${debugInfo}`
                : `${lastAction.action} ${debugInfo}`;

            setActionHistory(prev => {
                // Avoid duplicates using unique action key
                const isDuplicate = prev.some(a => a.key === actionKey);
                if (isDuplicate) {
                    console.log('[ActionHistory] Duplicate detected, skipping:', actionKey);
                    return prev;
                }

                // Add entry with unique key and sort by timestamp (oldest first)
                const newHistory = [...prev, {
                    key: actionKey,
                    player: lastAction.playerName,
                    action: actionText,
                    timestamp: lastAction.timestamp,
                }].sort((a, b) => a.timestamp - b.timestamp);

                // Keep last 30 entries
                return newHistory.slice(-30);
            });
        }
    }, [lastAction]);

    // Handle deal hand
    const handleDealHand = useCallback(async () => {
        setIsDealing(true);
        try {
            const { data, error: dealError } = await supabase.functions.invoke('deal-hand', {
                body: { tableId: id },
            });

            if (dealError) throw dealError;

            if (!data.success) {
                Alert.alert('Error', data.error || 'Failed to deal hand');
            } else {
                // Refresh table state after dealing
                await refetch();
            }
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to deal hand');
        } finally {
            setIsDealing(false);
        }
    }, [id, refetch]);

    // Handle seat click (join table)
    const handleSeatClick = useCallback(async (seatIndex: number) => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in to join');
            return;
        }
        if (isSeated) {
            Alert.alert('Already seated', 'You are already at this table');
            return;
        }

        setJoinError('');
        const buyIn = (tableState?.blinds?.bb ?? 10) * 100; // 100BB buy-in
        const result = await joinTable(seatIndex, buyIn);
        if (!result.success) {
            setJoinError(result.error || 'Failed to join');
            Alert.alert('Join Failed', result.error || 'Could not join table');
        }
    }, [user, tableState, joinTable, isSeated]);

    // Handle leave table
    const handleLeave = useCallback(async () => {
        const result = await leaveTable();
        if (!result.success) {
            Alert.alert('Error', result.error || 'Failed to leave table');
        } else {
            await refetch();
        }
    }, [leaveTable, refetch]);

    // Transform players for PokerTable component
    const tablePlayers = tableState?.players?.map((player, index) => {
        if (!player) return null;
        return {
            id: player.id,
            username: player.username ?? 'Player',
            stack: player.stack,
            currentBet: player.currentBet ?? 0,
            isFolded: player.isFolded ?? false,
            isAllIn: player.isAllIn ?? false,
            isDealer: player.isDealer ?? false,
            isSmallBlind: player.isSmallBlind ?? false,
            isBigBlind: player.isBigBlind ?? false,
            isCurrentPlayer: player.isCurrentPlayer ?? false,
            hasCards: player.hasCards ?? false,
            cards: player.id === user?.id ? myCards : undefined,
            seatIndex: player.seatIndex,
        };
    }) ?? [];

    // Loading state
    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading table...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // Error state
    if (error) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Error: {error}</Text>
                    <TouchableOpacity style={styles.refreshButton} onPress={refetch}>
                        <Text style={styles.refreshButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Prepare Game State for AI
    // We can just use the tableState objects directly if they match or map them
    // Assuming tableState maps roughly to GameState or we can construct minimal one
    // But wait, useAI expects GameState. We need to construct it or pass null if not ready.
    // Let's create a minimal helper or just cast if the shape is close enough.
    // Actually, tableState from useTable is the View Model, not the Engine Model.
    // The Engine Model is what AI needs. 
    // BUT, the AI engine runs on client or server? It runs on client here via useAI.
    // We need to map View Model -> Engine Model.
    // For now, let's assume we have a mapper or just pass what we have if it works.
    // Checking useTable, it returns tableState.
    // checking useAI usage below...

    const gameStateForAI: any = {
        players: tableState?.players?.map(p => ({
            stack: p.stack,
            currentBet: p.currentBet,
            isFolded: p.isFolded,
            isAllIn: p.isAllIn,
            isSittingOut: p.isSittingOut,
            seatIndex: p.seatIndex
        })) || [],
        communityCards: tableState?.communityCards || [],
        pot: tableState?.pot || 0,
        currentBet: (tableState as any)?.currentBet || 0,
        dealerIndex: tableState?.players?.findIndex(p => p.isDealer) ?? 0,
        // ... other fields
    };

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: tableState?.name ?? 'Table',
                    headerStyle: { backgroundColor: colors.dark.surface },
                    headerTintColor: colors.dark.text,
                }}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Table Info */}
                <View style={styles.infoBar}>
                    <Text style={styles.infoText}>
                        Blinds: {tableState?.blinds?.sb}/{tableState?.blinds?.bb}
                    </Text>
                    <Text style={styles.infoText}>
                        Players: {playerCount}/{tableState?.maxPlayers ?? 6}
                    </Text>
                    <Text style={styles.infoText}>
                        Phase: {tableState?.phase ?? 'waiting'}
                    </Text>
                    <TouchableOpacity onPress={refetch} style={styles.refreshIcon}>
                        <Text style={styles.refreshIconText}>🔄</Text>
                    </TouchableOpacity>
                </View>

                {/* Hero status */}
                {isSeated && heroPlayer && (
                    <View style={styles.heroStatus}>
                        <Text style={styles.heroStatusText}>
                            🎮 You are at Seat {(heroPlayer as any)?.seatIndex + 1} | Stack: {heroPlayer.stack?.toLocaleString()} chips
                        </Text>
                    </View>
                )}

                {/* Join prompt if not seated */}
                {!isSeated && (
                    <View style={styles.joinPrompt}>
                        <Text style={styles.joinPromptText}>
                            👆 Click on an empty seat to join
                        </Text>
                        <Text style={styles.joinPromptSubtext}>
                            Buy-in: {(tableState?.blinds?.bb ?? 10) * 100} chips (100 BB)
                        </Text>
                    </View>
                )}

                {/* Poker Table */}
                <PokerTable
                    players={tablePlayers}
                    communityCards={tableState?.communityCards ?? []}
                    phase={tableState?.phase ?? 'waiting'}
                    pot={tableState?.pot ?? 0}
                    currentPlayerIndex={tableState?.currentPlayerIndex ?? -1}
                    turnStartTime={tableState?.turnStartTime}
                    turnTimeout={tableState?.turnTimeout ?? 30000}
                    heroSeatIndex={heroSeatIndex}
                    onSeatClick={handleSeatClick}
                    maxPlayers={tableState?.maxPlayers ?? 6}
                />

                {/* Game Controls */}
                {isSeated && (
                    <View style={styles.gameControls}>
                        {/* Deal Hand Button */}
                        {canStartGame && (
                            <TouchableOpacity
                                style={[styles.dealButton, isDealing && styles.dealButtonDisabled]}
                                onPress={handleDealHand}
                                disabled={isDealing}
                            >
                                <Text style={styles.dealButtonText}>
                                    {isDealing ? 'Dealing...' : '🃏 Deal Hand'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Waiting for players message */}
                        {playerCount < 2 && (
                            <View style={styles.waitingMessage}>
                                <Text style={styles.waitingMessageText}>
                                    Waiting for more players... ({playerCount}/2 minimum)
                                </Text>
                            </View>
                        )}

                        {/* Leave Button */}
                        <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
                            <Text style={styles.leaveButtonText}>Leave Table</Text>
                        </TouchableOpacity>

                        {/* Hard Reset Button (Debug) */}
                        {/* Hard Reset Button (Direct) */}
                        <TouchableOpacity style={[styles.leaveButton, { backgroundColor: '#442222', marginTop: 10 }]} onPress={async () => {
                            // Simple confirmation via window.confirm if on web, otherwise direct
                            // @ts-ignore
                            if (typeof window !== 'undefined' && window.confirm && !window.confirm('Reset table? This kills the hand.')) return;

                            try {
                                const { error } = await supabase.functions.invoke('reset-table', {
                                    body: { tableId: id }
                                });
                                if (error) throw error;
                                refetch();
                            } catch (e) {
                                console.error(e);
                            }
                        }}>
                            <Text style={styles.leaveButtonText}>⚠️ Reset Table (Click to KIll)</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* AI Copilot */}
                {isSeated && (
                    <View style={styles.aiContainer}>
                        <WaitAIHook
                            myCards={myCards}
                            communityCards={tableState?.communityCards ?? []}
                            phase={phase ?? 'preflop'}
                            isMyTurn={isMyTurn}
                            gameStateForAI={gameStateForAI}
                            turnId={turnId}
                            heroSeatIndex={heroSeatIndex}
                            setAIPendingAction={setAIPendingAction}
                        />
                        <AICopilotToggle
                            isFullAuto={isFullAuto}
                            onToggle={setIsFullAuto}
                            currentSuggestion={null}
                        />
                        {isAIPlaying && (
                            <Text style={styles.aiPlayingText}>🤖 AI is playing...</Text>
                        )}
                        {isFullAuto && aiCountdown > 0 && isMyTurn && (
                            <Text style={styles.countdownText}>
                                🤖 AI will {aiPendingAction || 'play'} in {aiCountdown}s - Play manually to override
                            </Text>
                        )}
                    </View>
                )}


                {/* Winner banner */}
                {lastWinner && (
                    <View style={styles.winnerBanner}>
                        <Text style={styles.winnerText}>🏆 {lastWinner.playerName} wins {lastWinner.amount} chips!</Text>
                    </View>
                )}

                {/* Turn indicator */}
                {isSeated && (tableState as any)?.phase !== 'waiting' && !lastWinner && (
                    <View style={styles.turnIndicator}>
                        {isMyTurn ? (
                            <Text style={styles.yourTurnText}>🎯 YOUR TURN!</Text>
                        ) : (
                            <Text style={styles.waitingTurnText}>⏳ Waiting for opponent...</Text>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* Action History Box - Bottom Left */}
            <View style={styles.actionHistoryBox}>
                <Text style={styles.actionHistoryTitle}>📜 Action History</Text>
                <ScrollView style={styles.actionHistoryScroll} showsVerticalScrollIndicator={false}>
                    {actionHistory.length === 0 ? (
                        <Text style={styles.actionHistoryEmpty}>No actions yet...</Text>
                    ) : (
                        actionHistory.slice(-10).reverse().map((entry, index) => (
                            <Text key={index} style={[
                                styles.actionHistoryEntry,
                                entry.action.includes('🏆') && styles.actionHistoryWinner
                            ]}>
                                <Text style={styles.actionHistoryPlayer}>{entry.player}</Text>
                                {' '}{entry.action}
                                {entry.amount !== undefined && ` (${entry.amount})`}
                            </Text>
                        ))
                    )}
                </ScrollView>
            </View>

            {/* Action Buttons - Fixed at bottom (always show when it's player's turn) */}
            {isMyTurn && isSeated && !isAIPlaying && (
                <View style={styles.actionsContainer}>
                    <ActionButtons
                        canFold={canFold}
                        canCheck={canCheck}
                        canCall={canCall}
                        canBet={canBet}
                        canRaise={canRaise}
                        callAmount={callAmount}
                        minBet={minBet}
                        maxBet={maxBet}
                        minRaise={minRaise}
                        maxRaise={maxRaise}
                        pot={(tableState as any)?.pot ?? 0}
                        onAction={handleAction}
                    />
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    content: {
        flexGrow: 1,
        paddingBottom: 120,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.base,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.lg,
        gap: spacing.md,
    },
    errorText: {
        color: colors.dark.error,
        fontSize: fontSize.base,
        textAlign: 'center',
    },
    refreshButton: {
        backgroundColor: colors.dark.primary,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
    },
    refreshButtonText: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    infoBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: colors.dark.surface,
        padding: spacing.sm,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.md,
    },
    infoText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
    },
    refreshIcon: {
        padding: spacing.xs,
    },
    refreshIconText: {
        fontSize: fontSize.base,
    },
    heroStatus: {
        backgroundColor: colors.dark.primary + '30',
        padding: spacing.sm,
        marginHorizontal: spacing.md,
        marginTop: spacing.sm,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.dark.primary,
    },
    heroStatusText: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
        textAlign: 'center',
        fontWeight: '600',
    },
    joinPrompt: {
        backgroundColor: colors.dark.primary + '20',
        padding: spacing.md,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.dark.primary,
        alignItems: 'center',
    },
    joinPromptText: {
        color: colors.dark.text,
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    joinPromptSubtext: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
        marginTop: spacing.xs,
    },
    gameControls: {
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: spacing.md,
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
    },
    dealButton: {
        backgroundColor: colors.dark.accent,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.lg,
    },
    dealButtonDisabled: {
        opacity: 0.5,
    },
    dealButtonText: {
        color: colors.dark.background,
        fontSize: fontSize.lg,
        fontWeight: '700',
    },
    waitingMessage: {
        padding: spacing.sm,
    },
    waitingMessageText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
        fontStyle: 'italic',
    },
    leaveButton: {
        backgroundColor: colors.dark.error + '20',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.dark.error,
    },
    leaveButtonText: {
        color: colors.dark.error,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    seatedControls: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: spacing.md,
        paddingHorizontal: spacing.md,
    },
    aiContainer: {
        paddingHorizontal: spacing.md,
        marginTop: spacing.md,
        alignItems: 'center',
    },
    aiPlayingText: {
        color: colors.dark.accent,
        fontSize: fontSize.base,
        fontWeight: '600',
        marginTop: spacing.sm,
    },
    turnIndicator: {
        alignItems: 'center',
        padding: spacing.md,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.md,
    },
    yourTurnText: {
        color: colors.dark.accent,
        fontSize: fontSize.xl,
        fontWeight: '700',
    },
    waitingTurnText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.base,
    },
    countdownText: {
        color: colors.dark.warning,
        fontSize: fontSize.sm,
        marginTop: spacing.xs,
        textAlign: 'center',
    },
    winnerBanner: {
        backgroundColor: colors.dark.success + '30',
        padding: spacing.lg,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.lg,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.dark.success,
    },
    winnerText: {
        color: colors.dark.success,
        fontSize: fontSize.xl,
        fontWeight: '700',
        textAlign: 'center',
    },
    actionsContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.dark.surface,
        borderTopWidth: 1,
        borderTopColor: colors.dark.border,
        paddingTop: spacing.md,
        paddingBottom: spacing.lg,
    },
    actionHistoryBox: {
        position: 'absolute',
        bottom: spacing.lg,
        left: spacing.md,
        width: 220,
        maxHeight: 180,
        backgroundColor: colors.dark.surface + 'E6',
        borderRadius: borderRadius.md,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.dark.border,
    },
    actionHistoryTitle: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
        marginBottom: spacing.xs,
    },
    actionHistoryScroll: {
        flex: 1,
    },
    actionHistoryEmpty: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
        fontStyle: 'italic',
    },
    actionHistoryEntry: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
        marginBottom: 2,
    },
    actionHistoryPlayer: {
        color: colors.dark.accent,
        fontWeight: '600',
    },
    actionHistoryWinner: {
        color: colors.dark.success,
        fontWeight: '700',
    },
});


