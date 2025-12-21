/**
 * Table Screen - Main game screen for a single table
 */

import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { PokerTable, ActionButtons, AICopilotToggle } from '../../src/components/Table';
import { TurnTimer } from '../../src/components/Table/TurnTimer';
import { ShowdownOverlay } from '../../src/components/Table/ShowdownOverlay';
import { useTable } from '../../src/hooks/useTable';
import { useAuth } from '../../src/providers/AuthProvider';
import { useAI } from '../../src/hooks/useAI';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/styles/theme';
import { evaluateHand, Card } from '@foldflop/poker-engine';

// Helper component to run AI hook - now with proper import
function WaitAIHook({
    myCards,
    communityCards,
    phase,
    isMyTurn,
    gameStateForAI,
    turnId,
    heroSeatIndex,
    onSuggestion
}: {
    myCards: string[];
    communityCards: any[];
    phase: string;
    isMyTurn: boolean;
    gameStateForAI: any;
    turnId: string;
    heroSeatIndex: number;
    onSuggestion: (suggestion: any) => void;
}) {
    const { suggestion } = useAI(
        myCards,
        communityCards,
        phase,
        isMyTurn,
        gameStateForAI,
        turnId,
        heroSeatIndex,
    );

    // Use ref to track last processed suggestion to avoid loops
    const lastProcessedRef = useRef<string>('');

    useEffect(() => {
        if (suggestion && isMyTurn && typeof onSuggestion === 'function') {
            // Only process if this is a new suggestion
            const suggestionKey = `${suggestion.action}-${suggestion.amount || 0}-${turnId}`;
            if (lastProcessedRef.current !== suggestionKey) {
                lastProcessedRef.current = suggestionKey;
                onSuggestion(suggestion);
            }
        }
    }, [suggestion, isMyTurn, onSuggestion, turnId]);

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
        claimTimeout,
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

    // Correct min-raise calculation:
    // minRaise = currentBet + lastRaiseAmount (at minimum the big blind)
    const lastRaiseAmount = (tableState as any)?.lastRaiseAmount ?? minBet;
    const minRaise = Math.max(currentBet + lastRaiseAmount, currentBet + minBet);
    const maxRaise = heroPlayer?.stack ?? 0;

    // AI countdown and action history state
    const [aiCountdown, setAICountdown] = useState(0);
    const [aiPendingAction, setAIPendingAction] = useState<string>('');
    const [currentSuggestion, setCurrentSuggestion] = useState<any>(null);
    const [actionHistory, setActionHistory] = useState<Array<{ key?: string; player: string; action: string; amount?: number; timestamp: number }>>([]);
    const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastTurnIdRef = useRef<string>('');
    const lastProcessedWinnerRef = useRef<string>('');
    const lastProcessedActionKeyRef = useRef<string>('');

    // Calculate current hand strength (for display)
    const handDescription = useMemo(() => {
        if (!myCards || myCards.length < 2) return null;

        const communityCards = (tableState as any)?.communityCards;
        if (!communityCards || communityCards.length < 3) {
            // Preflop - just show hole cards info
            return null;
        }

        try {
            // Convert string cards to Card objects if needed
            const parseCard = (c: string | Card): Card => {
                if (typeof c === 'object' && 'rank' in c && 'suit' in c) return c as Card;
                // Parse "Ah" format to {rank: 'A', suit: 'h'}
                const rank = c.slice(0, -1);
                const suit = c.slice(-1);
                return { rank, suit } as Card;
            };

            const allCards = [...myCards.map(parseCard), ...communityCards.map(parseCard)];
            const result = evaluateHand(allCards);
            return result?.description || null;
        } catch {
            return null;
        }
    }, [myCards, tableState]);

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
        // If AI is currently playing, just wait (don't reset ref yet, otherwise we loop)
        if (isAIPlaying) return;

        // If it's not our turn, AI is disabled, or not seated, clear everything and reset ref
        if (!isFullAuto || !isMyTurn || !isSeated) {
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
        // Adaptive Strategy: Use 20s normally, but shorten if turn timer is running out.
        // This ensures the AI sends the action before the server timeout (30s) kills the hand.
        const ts = tableState as any;
        const startTime = ts?.turnStartTime ? new Date(ts.turnStartTime).getTime() : Date.now();
        const timeout = ts?.turnTimeout ?? 30000;
        const now = Date.now();
        const remainingSec = Math.floor((timeout - (now - startTime)) / 1000);

        // Aim for 20s, but ensure we have at least 3s buffer before server timeout
        let count = Math.min(20, Math.max(1, remainingSec - 3));

        console.log(`[AI] Turn Time Check: Remaining=${remainingSec}s, AI_Countdown=${count}s`);

        setAICountdown(count);

        aiIntervalRef.current = setInterval(() => {
            count--;
            // Console warning if time is running out (user request)
            if (count === 5) console.warn('[AI] ⚠️ Only 5 seconds left for manual override!');
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
                        let result;
                        if (execCheck) {
                            result = await performAction('check');
                        } else if (execCall) {
                            const amt = Math.min(execToCall, heroPlayer?.stack ?? 0);
                            result = await performAction('call', amt);
                        } else {
                            result = await performAction('fold');
                        }

                        // Auto-recover AI
                        if (result && !result.success && result.error === 'No active hand at this table') {
                            console.log('[AI] Hand lost sync, refreshing...');
                            await refetch();
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

            // Auto-recover from "No active hand" error
            if (result.error === 'No active hand at this table') {
                console.log('Hand lost sync, refreshing...');
                await refetch();
                return;
            }

            Alert.alert('Error', result.error || 'Action failed');
        }
        // Action history will be updated via Realtime broadcast
    }, [performAction]);

    // Add winner to action history (Debounced/Deduped)
    useEffect(() => {
        if (lastWinner) {
            const winKey = `${lastWinner.playerName}-${lastWinner.amount}`;
            if (lastProcessedWinnerRef.current === winKey) return;
            lastProcessedWinnerRef.current = winKey;

            setActionHistory(prev => [...prev.slice(-29), {
                player: lastWinner.playerName,
                action: `wins ${lastWinner.amount} chips! 🏆`,
                timestamp: Date.now(),
                key: `win-${Date.now()}`
            }]);
        }
    }, [lastWinner]);

    // Sync action history from Realtime (all players' actions)
    // Sync action history from Realtime (all players' actions)
    useEffect(() => {
        if (lastAction) {
            console.log('[ActionHistory] Received:', lastAction.playerName, lastAction.action, lastAction.phase, lastAction.timestamp);

            // Build unique action key using server timestamp
            const actionKey = `${lastAction.playerId}-${lastAction.action}-${lastAction.phase}-${lastAction.timestamp}`;

            // Ref-based deduplication
            if (lastProcessedActionKeyRef.current === actionKey) return;
            lastProcessedActionKeyRef.current = actionKey;

            const timeStr = new Date(lastAction.timestamp).toLocaleTimeString();
            const debugInfo = `[${lastAction.phase}|S${lastAction.seat}|${timeStr}]`;

            const actionText = lastAction.amount > 0
                ? `${lastAction.action} ${lastAction.amount} ${debugInfo}`
                : `${lastAction.action} ${debugInfo}`;

            setActionHistory(prev => {
                // Avoid duplicates using unique action key
                const isDuplicate = prev.some(a => a.key === actionKey);
                if (isDuplicate) return prev;

                // Add entry with unique key and sort by timestamp (oldest first)
                const newHistory = [...prev, {
                    key: actionKey,
                    player: lastAction.playerName,
                    action: actionText,
                    timestamp: lastAction.timestamp,
                }].sort((a, b) => a.timestamp - b.timestamp);

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

    // Auto-deal next hand after showdown (5 second delay)
    useEffect(() => {
        // Only auto-deal if:
        // 1. We're seated
        // 2. Phase is 'waiting' (hand complete)
        // 3. There are at least 2 players
        // 4. We're not already dealing
        const canAutoDeal = isSeated && playerCount >= 2 && (phase === 'waiting' || !phase) && !isDealing;

        if (!canAutoDeal) return;

        console.log('[AutoDeal] Starting 5 second countdown...');
        const timer = setTimeout(() => {
            console.log('[AutoDeal] Dealing next hand!');
            handleDealHand();
        }, 5000);

        return () => clearTimeout(timer);
    }, [isSeated, playerCount, phase, isDealing, handleDealHand]);

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
            // Show actual cards if available, card backs if cards are loading
            cards: player.id === user?.id
                ? (myCards && myCards.length > 0 ? myCards : (player.hasCards ? ['back', 'back'] : undefined))
                : undefined,
            seatIndex: player.seatIndex,
        };
    }) ?? [];

    // Loading state


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

    // Prepare Game State for AI - Memorized to prevent loops
    const gameStateForAI = React.useMemo(() => {
        if (!tableState) return null;

        // Helper to parse card string to object
        const parseCardString = (cardStr: string | any) => {
            if (typeof cardStr !== 'string') return cardStr;
            if (cardStr.length < 2) return null;
            return { rank: cardStr.slice(0, -1), suit: cardStr.slice(-1) };
        };

        return {
            players: tableState.players?.map(p => ({
                id: p.id,
                stack: p.stack,
                currentBet: p.currentBet,
                isFolded: p.isFolded,
                isAllIn: p.isAllIn,
                isSittingOut: p.isSittingOut,
                seatIndex: p.seatIndex,
                // Only provide hole cards for hero
                holeCards: (p.id === user?.id && myCards)
                    ? myCards.map(parseCardString)
                    : null
            })) || [],
            communityCards: tableState.communityCards?.map(parseCardString) || [],
            pot: tableState.pot || 0,
            currentBet: (tableState as any)?.currentBet || 0,
            dealerIndex: tableState.players?.findIndex(p => p.isDealer) ?? 0,
            smallBlind: tableState.blinds?.sb || 10,
            bigBlind: tableState.blinds?.bb || 20,
        };
    }, [tableState, myCards, user?.id]);

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
                    {/* Turn indicator in header */}
                    {isSeated && (tableState as any)?.phase !== 'waiting' && !lastWinner && (
                        <Text style={isMyTurn ? styles.yourTurnTextHeader : styles.waitingTurnTextHeader}>
                            {isMyTurn ? '🎯 YOUR TURN!' : '⏳ Waiting...'}
                        </Text>
                    )}
                    <View style={styles.headerButtons}>
                        <TouchableOpacity onPress={refetch} style={styles.refreshIcon}>
                            <Text style={styles.refreshIconText}>🔄</Text>
                        </TouchableOpacity>
                        {isSeated && (
                            <TouchableOpacity
                                style={[styles.aiHeaderToggle, isFullAuto && styles.aiHeaderToggleActive]}
                                onPress={() => setIsFullAuto(!isFullAuto)}
                            >
                                <Text style={styles.aiHeaderToggleText}>
                                    {isFullAuto ? '🤖 ON' : '🤖 OFF'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* AI Status Overlay - Top Right under header */}
                {isSeated && isFullAuto && aiCountdown > 0 && isMyTurn && (
                    <View style={styles.aiStatusOverlay}>
                        <Text style={styles.aiStatusText}>
                            🤖 AI will {aiPendingAction || 'play'} in {aiCountdown}s
                        </Text>
                        <Text style={styles.aiStatusSubtext}>
                            Tap to override
                        </Text>
                    </View>
                )}

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
                    onTimeout={claimTimeout}
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
                            onSuggestion={setCurrentSuggestion}
                        />
                        {isAIPlaying && (
                            <Text style={styles.aiPlayingText}>🤖 AI is playing...</Text>
                        )}
                        {isFullAuto && aiCountdown > 0 && isMyTurn && (
                            // Copilot moved to absolute overlay in header area (see below)
                            null
                        )}
                    </View>
                )}

                {/* Winner banner */}
                {lastWinner && (
                    <View style={styles.winnerBanner}>
                        <Text style={styles.winnerText}>🏆 {lastWinner.playerName} wins {lastWinner.amount} chips!</Text>
                    </View>
                )}
            </ScrollView>

            {/* Turn Timer - Visible to everyone when a turn is active */}
            {(() => {
                const ts = tableState as any;

                return ts?.turnStartTime && ts?.currentPlayerIndex !== -1 && (
                    <View style={{
                        position: 'absolute',
                        // If my turn, dock it slightly above the actions container (which is roughly 180px-200px high with slider)
                        // If not, dock at bottom
                        bottom: isMyTurn ? 180 : 0,
                        left: 0,
                        right: 0,
                        zIndex: 90, // Lower than actions
                        paddingHorizontal: 20,
                        paddingBottom: isMyTurn ? 10 : 30,
                    }}>
                        <TurnTimer
                            key={ts.turnStartTime} // Force re-mount on turn change to reset animation
                            totalTime={ts?.turnTimeout ?? 30000}
                            startTime={new Date(ts.turnStartTime).getTime()}
                            isActive={true}
                            onTimeout={claimTimeout}
                            gracePeriod={5000}
                        />
                    </View>
                );
            })()}

            {/* Hand Strength Display - Right side, above timer, always visible when we have cards */}
            {isSeated && handDescription && (
                <View style={styles.handStrengthFloating}>
                    <Text style={styles.handStrengthLabel}>🃏 Votre Main</Text>
                    <Text style={styles.handStrengthValue}>{handDescription}</Text>
                </View>
            )}

            {/* Action History Box - Top Left under header */}
            <View style={styles.actionHistoryBox}>
                <Text style={styles.actionHistoryTitle}>📜 Action History</Text>
                <ScrollView style={styles.actionHistoryScroll} showsVerticalScrollIndicator={false}>
                    {actionHistory.length === 0 ? (
                        <Text style={styles.actionHistoryEmpty}>No actions yet...</Text>
                    ) : (
                        [...actionHistory].reverse().map((entry, index) => (
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

            {/* Action Buttons - Fixed at bottom (always visible when seated, disabled when not turn) */}
            {isSeated && (
                <View style={[styles.actionsContainer, { zIndex: 200 }]}>
                    <ActionButtons
                        canFold={isMyTurn && canFold}
                        canCheck={isMyTurn && canCheck}
                        canCall={isMyTurn && canCall}
                        canBet={isMyTurn && canBet}
                        canRaise={isMyTurn && canRaise}
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

            {/* Cinematic Showdown Overlay */}
            <ShowdownOverlay
                isVisible={!!lastWinner}
                winners={lastWinner ? [lastWinner] : []}
                communityCards={tableState?.communityCards || []}
                onComplete={() => {
                    // Optional callback if we wanted to trigger something manually
                }}
            />
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
    turnIndicatorCentered: {
        position: 'absolute',
        top: '25%', // Higher up to avoid covering flop cards
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 50,
        backgroundColor: colors.dark.background + 'CC',
        marginHorizontal: spacing.xl * 2,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.lg,
        alignSelf: 'center',
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
    yourTurnTextHeader: {
        color: colors.dark.accent,
        fontSize: fontSize.sm,
        fontWeight: '700',
    },
    waitingTurnTextHeader: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
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
        top: 100, // Under header
        left: spacing.md,
        width: 200,
        maxHeight: 250,
        backgroundColor: colors.dark.surface + 'E6',
        borderRadius: borderRadius.md,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.dark.border,
        zIndex: 60,
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
    handStrengthFloating: {
        position: 'absolute',
        right: spacing.md,
        bottom: 220, // Above action buttons bar
        backgroundColor: colors.dark.primary + '40',
        borderRadius: borderRadius.md,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderWidth: 1,
        borderColor: colors.dark.primary,
        zIndex: 250, // Above action buttons (200)
    },
    handStrengthLabel: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
    },
    handStrengthValue: {
        color: colors.dark.accent,
        fontSize: fontSize.base,
        fontWeight: '700',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    aiHeaderToggle: {
        backgroundColor: colors.dark.surface,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
        borderWidth: 1,
        borderColor: colors.dark.border,
    },
    aiHeaderToggleActive: {
        backgroundColor: colors.dark.primary + '30',
        borderColor: colors.dark.primary,
    },
    aiHeaderToggleText: {
        color: colors.dark.text,
        fontSize: fontSize.xs,
        fontWeight: '600',
    },
    aiStatusOverlay: {
        position: 'absolute',
        top: 60, // Below header
        right: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: spacing.sm,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.dark.primary,
        zIndex: 1000,
        alignItems: 'flex-end',
    },
    aiStatusText: {
        color: colors.dark.primary,
        fontSize: fontSize.sm,
        fontWeight: 'bold',
        textAlign: 'right',
    },
    aiStatusSubtext: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
        textAlign: 'right',
    },
});


