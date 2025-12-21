/**
 * Embedded Table View Component - Full Featured
 * A scaled-down version of the full table view for multi-table grid display
 * Includes: timer, AI toggle, fullscreen mode, action buttons
 */

import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Modal, ScrollView } from 'react-native';
import { PokerTable, ActionButtons, AICopilotToggle } from './index';
import { TurnTimer } from './TurnTimer';
import { useTable } from '../../hooks/useTable';
import { useAuth } from '../../providers/AuthProvider';
import { useAI } from '../../hooks/useAI';
import { colors, spacing, fontSize, borderRadius } from '../../styles/theme';
import { evaluateHand, Card } from '@foldflop/poker-engine';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isDesktop = SCREEN_WIDTH > 768;
const GRID_COLS = isDesktop ? 3 : 2;
const TABLE_GAP = spacing.sm;
const EMBEDDED_WIDTH = (SCREEN_WIDTH - (GRID_COLS + 1) * TABLE_GAP) / GRID_COLS;
const SCALE_FACTOR = EMBEDDED_WIDTH / 850;

interface EmbeddedTableViewProps {
    tableId: string;
    isFocused?: boolean;
    onPress?: () => void;
    onLeave?: () => void;
}

export function EmbeddedTableView({
    tableId,
    isFocused = false,
    onPress,
    onLeave,
}: EmbeddedTableViewProps) {
    const { user } = useAuth();
    const {
        tableState,
        isLoading,
        error,
        isMyTurn,
        myCards,
        performAction,
        refetch,
    } = useTable(tableId);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isAIEnabled, setIsAIEnabled] = useState(true);

    // Find hero player and their seat index
    const heroPlayer = tableState?.players?.find(p => p?.id === user?.id) ?? null;
    const heroSeatIndex = heroPlayer?.seatIndex ?? -1;
    const isSeated = !!heroPlayer;

    // Get valid actions
    const currentBet = (tableState as any)?.currentBet ?? 0;
    const heroCurrentBet = heroPlayer?.currentBet ?? 0;
    const canFold = isMyTurn;
    const canCheck = isMyTurn && currentBet === heroCurrentBet;
    const canCall = isMyTurn && !canCheck && currentBet > 0;
    const canBet = isMyTurn && currentBet === 0;
    const canRaise = isMyTurn && currentBet > 0;
    const minBet = (tableState as any)?.blinds?.bb ?? 10;
    const lastRaiseAmount = (tableState as any)?.lastRaiseAmount ?? minBet;
    const minRaise = Math.max(currentBet + lastRaiseAmount, currentBet + minBet);
    const maxRaise = heroPlayer?.stack ?? 0;
    const pot = tableState?.pot ?? 0;
    const phase = (tableState as any)?.phase ?? 'waiting';

    // Turn timer - convert ISO string to timestamp if needed
    const rawTurnStartTime = (tableState as any)?.turnStartTime;
    const turnStartTime = rawTurnStartTime
        ? (typeof rawTurnStartTime === 'string' ? new Date(rawTurnStartTime).getTime() : rawTurnStartTime)
        : null;
    const turnTimeout = (tableState as any)?.turnTimeout ?? 30000; // Sync with tableState

    // AI Auto-Play state
    const [aiCountdown, setAICountdown] = useState(0);
    const [isAIPlaying, setIsAIPlaying] = useState(false);
    const [aiPendingAction, setAIPendingAction] = useState('');
    const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastTurnIdRef = useRef<string>('');

    // Turn ID for tracking - SAME as [id].tsx
    const turnId = `${isMyTurn}-${phase}-${pot}-${currentBet}`;

    // AI Auto-Play - detect new turn and start countdown (SAME as [id].tsx)
    useEffect(() => {
        // If AI is currently playing, just wait (don't reset ref yet, otherwise we loop)
        if (isAIPlaying) return;

        // If it's not our turn, AI is disabled, or not seated, clear everything and reset ref
        if (!isAIEnabled || !isMyTurn || !isSeated) {
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

        console.log(`[AI-MultiTable] New turn on ${tableId.slice(0, 6)}:`, turnId, '- Will:', pendingAction);

        // Start countdown - Adaptive Strategy (SAME as [id].tsx)
        // Use 20s normally, but shorten if turn timer is running out.
        const ts = tableState as any;
        const startTime = ts?.turnStartTime ? new Date(ts.turnStartTime).getTime() : Date.now();
        const timeout = ts?.turnTimeout ?? 30000;
        const now = Date.now();
        const remainingSec = Math.floor((timeout - (now - startTime)) / 1000);

        // Aim for 20s, but ensure we have at least 3s buffer before server timeout
        let count = Math.min(20, Math.max(1, remainingSec - 3));

        console.log(`[AI-MultiTable] Turn Time Check: Remaining=${remainingSec}s, AI_Countdown=${count}s`);

        setAICountdown(count);

        aiIntervalRef.current = setInterval(() => {
            count--;
            // Console warning if time is running out
            if (count === 5) console.warn(`[AI-MultiTable] ⚠️ Only 5 seconds left for manual override on ${tableId.slice(0, 6)}!`);
            console.log(`[AI-MultiTable] Countdown on ${tableId.slice(0, 6)}:`, count);
            setAICountdown(count);

            if (count <= 0) {
                // Clear interval
                if (aiIntervalRef.current) {
                    clearInterval(aiIntervalRef.current);
                    aiIntervalRef.current = null;
                }

                // Execute action
                console.log(`[AI-MultiTable] Executing on ${tableId.slice(0, 6)}:`, pendingAction);
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

                        // Auto-recover AI (SAME as [id].tsx)
                        if (result && !result.success && result.error === 'No active hand at this table') {
                            console.log(`[AI-MultiTable] Hand lost sync on ${tableId.slice(0, 6)}, refreshing...`);
                            await refetch();
                        }
                    } catch (err) {
                        console.error(`[AI-MultiTable] Action error on ${tableId.slice(0, 6)}:`, err);
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
    }, [turnId, isAIEnabled, isMyTurn, isSeated, isAIPlaying, currentBet, heroCurrentBet, heroPlayer?.stack, performAction, phase, tableState, refetch, tableId]);

    // Handle action
    const handleAction = useCallback(async (action: string, amount?: number) => {
        // Cancel AI if user takes manual action
        if (aiIntervalRef.current) {
            clearInterval(aiIntervalRef.current);
            aiIntervalRef.current = null;
        }
        setAICountdown(0);
        setAIPendingAction('');

        try {
            await performAction(action, amount);
        } catch (err) {
            console.error('[EmbeddedTable] Action error:', err);
        }
    }, [performAction]);

    // Map players for PokerTable
    // Map players for PokerTable - cast to any to access extended properties
    const tablePlayers = tableState?.players?.map((player: any) => {
        const isHero = player.id === user?.id;
        return {
            id: player.id,
            username: player.username ?? `Player ${player.seatIndex + 1}`,
            stack: player.stack,
            currentBet: player.currentBet ?? 0,
            isFolded: player.isFolded ?? false,
            isAllIn: player.isAllIn ?? false,
            isDealer: player.isDealer ?? false,
            isSmallBlind: player.isSmallBlind ?? false,
            isBigBlind: player.isBigBlind ?? false,
            isCurrentPlayer: player.isCurrentPlayer ?? false,
            hasCards: player.hasCards ?? false,
            cards: isHero
                ? (myCards && myCards.length > 0 ? myCards : (player.hasCards ? ['back', 'back'] : undefined))
                : undefined,
            seatIndex: player.seatIndex,
        };
    }) ?? [];

    // Calculate hand description
    const handDescription = useMemo(() => {
        if (!myCards || myCards.length === 0 || !tableState?.communityCards) return null;
        if (phase === 'preflop') return null;
        try {
            const parseCard = (c: string | Card): Card => {
                if (typeof c === 'object' && 'rank' in c && 'suit' in c) return c as Card;
                const rank = c.slice(0, -1);
                const suit = c.slice(-1);
                return { rank, suit } as Card;
            };
            const allCards = [...myCards.map(parseCard), ...tableState.communityCards.map(parseCard)];
            const result = evaluateHand(allCards);
            return result?.description || null;
        } catch {
            return null;
        }
    }, [myCards, tableState, phase]);

    // Toggle fullscreen
    const toggleFullscreen = useCallback(() => {
        setIsFullscreen(!isFullscreen);
    }, [isFullscreen]);

    if (isLoading && !tableState) {
        return (
            <View style={[styles.container, isFocused && styles.focused]}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={[styles.container, styles.error]}>
                <Text style={styles.errorText}>Error</Text>
                <TouchableOpacity onPress={refetch}>
                    <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Mini view (in grid)
    const miniView = (
        <TouchableOpacity
            style={[
                styles.container,
                isFocused && styles.focused,
                isMyTurn && styles.myTurn,
            ]}
            onPress={toggleFullscreen}
            activeOpacity={0.9}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.tableName} numberOfLines={1}>
                    {tableState?.name ?? `Table ${tableId.slice(0, 6)}`}
                </Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={[styles.aiToggleMini, isAIEnabled && styles.aiToggleActive]}
                        onPress={() => setIsAIEnabled(!isAIEnabled)}
                    >
                        <Text style={styles.aiToggleText}>🤖</Text>
                    </TouchableOpacity>
                    {onLeave && (
                        <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
                            <Text style={styles.leaveBtnText}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Timer when it's my turn */}
            {isMyTurn && turnStartTime && (
                <View style={styles.timerContainer}>
                    <TurnTimer
                        totalTime={turnTimeout}
                        startTime={turnStartTime}
                        isActive={isMyTurn}
                    />
                </View>
            )}

            {/* Scaled Table */}
            <View style={styles.tableWrapper}>
                <View style={[styles.scaledContent, { transform: [{ scale: SCALE_FACTOR }] }]}>
                    <PokerTable
                        players={tablePlayers}
                        communityCards={tableState?.communityCards ?? []}
                        phase={phase}
                        pot={pot}
                        currentPlayerIndex={tableState?.players?.findIndex(p => p.isCurrentPlayer) ?? -1}
                        heroSeatIndex={heroSeatIndex}
                        maxPlayers={tableState?.maxPlayers ?? 6}
                    />
                </View>
            </View>

            {/* Turn indicator + AI status */}
            {isMyTurn && (
                <View style={styles.turnBanner}>
                    <Text style={styles.turnText}>🎯 YOUR TURN</Text>
                    {isAIEnabled && aiCountdown > 0 && (
                        <Text style={styles.aiCountdownText}>
                            🤖 {aiPendingAction} in {aiCountdown}s
                        </Text>
                    )}
                    {isAIPlaying && (
                        <Text style={styles.aiPlayingText}>🤖 Playing...</Text>
                    )}
                </View>
            )}

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.potText}>Pot: {pot.toLocaleString()}</Text>
                <Text style={styles.blindsText}>
                    {tableState?.blinds?.sb}/{tableState?.blinds?.bb}
                </Text>
                {handDescription && (
                    <Text style={styles.handText}>{handDescription}</Text>
                )}
            </View>

            {/* Quick Action Buttons */}
            {isMyTurn && isSeated && (
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.foldBtn]}
                        onPress={() => handleAction('fold')}
                    >
                        <Text style={styles.actionBtnText}>Fold</Text>
                    </TouchableOpacity>
                    {canCheck && (
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.checkBtn]}
                            onPress={() => handleAction('check')}
                        >
                            <Text style={styles.actionBtnText}>Check</Text>
                        </TouchableOpacity>
                    )}
                    {canCall && (
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.callBtn]}
                            onPress={() => handleAction('call')}
                        >
                            <Text style={styles.actionBtnText}>Call {currentBet - heroCurrentBet}</Text>
                        </TouchableOpacity>
                    )}
                    {(canBet || canRaise) && (
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.raiseBtn]}
                            onPress={() => handleAction(canBet ? 'bet' : 'raise', canBet ? minBet * 3 : minRaise)}
                        >
                            <Text style={styles.actionBtnText}>{canBet ? 'Bet' : 'Raise'}</Text>
                        </TouchableOpacity>
                    )}
                    {heroPlayer && heroPlayer.stack > 0 && (
                        <TouchableOpacity
                            style={[styles.actionBtn, styles.allinBtn]}
                            onPress={() => handleAction('raise', heroPlayer.stack + heroCurrentBet)}
                        >
                            <Text style={styles.actionBtnText}>All-in</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );

    // Fullscreen modal
    const fullscreenView = (
        <Modal
            visible={isFullscreen}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={toggleFullscreen}
        >
            <View style={styles.fullscreenContainer}>
                {/* Fullscreen Header */}
                <View style={styles.fullscreenHeader}>
                    <TouchableOpacity onPress={toggleFullscreen} style={styles.closeFullscreenBtn}>
                        <Text style={styles.closeFullscreenText}>← Back to Grid</Text>
                    </TouchableOpacity>
                    <Text style={styles.fullscreenTitle}>
                        {tableState?.name ?? `Table ${tableId.slice(0, 6)}`}
                    </Text>
                    <View style={styles.fullscreenHeaderRight}>
                        <TouchableOpacity
                            style={[styles.aiToggleFull, isAIEnabled && styles.aiToggleActive]}
                            onPress={() => setIsAIEnabled(!isAIEnabled)}
                        >
                            <Text style={styles.aiToggleFullText}>
                                {isAIEnabled ? '🤖 AI ON' : '🤖 OFF'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={refetch} style={styles.refreshBtn}>
                            <Text style={styles.refreshBtnText}>🔄</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Info Bar */}
                <View style={styles.infoBar}>
                    <Text style={styles.infoText}>
                        Blinds: {tableState?.blinds?.sb}/{tableState?.blinds?.bb}
                    </Text>
                    <Text style={styles.infoText}>
                        Players: {tableState?.players?.length ?? 0}/{tableState?.maxPlayers ?? 6}
                    </Text>
                    {isMyTurn && (
                        <Text style={styles.yourTurnText}>🎯 YOUR TURN!</Text>
                    )}
                </View>

                {/* Timer */}
                {isMyTurn && turnStartTime && (
                    <TurnTimer
                        totalTime={turnTimeout}
                        startTime={turnStartTime}
                        isActive={isMyTurn}
                    />
                )}

                {/* Hero Status */}
                {isSeated && heroPlayer && (
                    <View style={styles.heroStatus}>
                        <Text style={styles.heroStatusText}>
                            🎮 Seat {heroSeatIndex + 1} | Stack: {heroPlayer.stack?.toLocaleString()} chips
                        </Text>
                        {handDescription && (
                            <Text style={styles.handDescText}>Hand: {handDescription}</Text>
                        )}
                    </View>
                )}

                {/* Full Table */}
                <ScrollView contentContainerStyle={styles.fullTableContainer}>
                    <PokerTable
                        players={tablePlayers}
                        communityCards={tableState?.communityCards ?? []}
                        phase={phase}
                        pot={pot}
                        currentPlayerIndex={tableState?.players?.findIndex(p => p.isCurrentPlayer) ?? -1}
                        heroSeatIndex={heroSeatIndex}
                        maxPlayers={tableState?.maxPlayers ?? 6}
                    />
                </ScrollView>

                {/* Full Action Buttons */}
                {isMyTurn && isSeated && (
                    <ActionButtons
                        canFold={canFold}
                        canCheck={canCheck}
                        canCall={canCall}
                        canBet={canBet}
                        canRaise={canRaise}
                        callAmount={currentBet - heroCurrentBet}
                        minBet={minBet}
                        maxBet={heroPlayer?.stack ?? 0}
                        minRaise={minRaise}
                        maxRaise={maxRaise}
                        pot={pot}
                        onAction={handleAction}
                    />
                )}

                {/* Leave Button */}
                {onLeave && (
                    <TouchableOpacity style={styles.fullscreenLeaveBtn} onPress={() => { toggleFullscreen(); onLeave(); }}>
                        <Text style={styles.fullscreenLeaveText}>Leave Table</Text>
                    </TouchableOpacity>
                )}
            </View>
        </Modal>
    );

    return (
        <>
            {miniView}
            {fullscreenView}
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        width: EMBEDDED_WIDTH,
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: colors.dark.border,
    },
    focused: {
        borderColor: colors.dark.primary,
        borderWidth: 3,
    },
    myTurn: {
        borderColor: colors.dark.success,
        borderWidth: 3,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        backgroundColor: colors.dark.background,
    },
    tableName: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
        flex: 1,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    aiToggleMini: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.dark.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    aiToggleActive: {
        backgroundColor: colors.dark.primary,
    },
    aiToggleText: {
        fontSize: 12,
    },
    leaveBtn: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.dark.error,
        alignItems: 'center',
        justifyContent: 'center',
    },
    leaveBtnText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    timerContainer: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
    },
    tableWrapper: {
        height: EMBEDDED_WIDTH * 0.55,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scaledContent: {
        transformOrigin: 'center center',
    },
    turnBanner: {
        backgroundColor: colors.dark.success,
        paddingVertical: 4,
        alignItems: 'center',
    },
    turnText: {
        color: '#fff',
        fontSize: fontSize.xs,
        fontWeight: '700',
    },
    aiCountdownText: {
        color: '#fff',
        fontSize: fontSize.xs - 1,
        opacity: 0.9,
    },
    aiPlayingText: {
        color: '#fff',
        fontSize: fontSize.xs - 1,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        backgroundColor: colors.dark.background,
    },
    potText: {
        color: colors.dark.accent,
        fontSize: fontSize.xs,
        fontWeight: '600',
    },
    blindsText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
    },
    handText: {
        color: colors.dark.info,
        fontSize: fontSize.xs,
        fontWeight: '500',
    },
    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.xs,
        backgroundColor: colors.dark.background,
    },
    actionBtn: {
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: borderRadius.sm,
        minWidth: 45,
        alignItems: 'center',
    },
    actionBtnText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '600',
    },
    foldBtn: { backgroundColor: colors.dark.error },
    checkBtn: { backgroundColor: colors.dark.warning },
    callBtn: { backgroundColor: colors.dark.info },
    raiseBtn: { backgroundColor: colors.dark.success },
    allinBtn: { backgroundColor: '#9333ea' },
    loadingText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
        textAlign: 'center',
        paddingVertical: spacing.xl,
    },
    error: { borderColor: colors.dark.error },
    errorText: {
        color: colors.dark.error,
        fontSize: fontSize.sm,
        textAlign: 'center',
        paddingVertical: spacing.md,
    },
    retryText: {
        color: colors.dark.primary,
        fontSize: fontSize.xs,
        textAlign: 'center',
    },

    // Fullscreen styles
    fullscreenContainer: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    fullscreenHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.dark.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.dark.border,
    },
    closeFullscreenBtn: {
        paddingVertical: spacing.xs,
    },
    closeFullscreenText: {
        color: colors.dark.primary,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    fullscreenTitle: {
        color: colors.dark.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
    },
    fullscreenHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    aiToggleFull: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
        backgroundColor: colors.dark.border,
    },
    aiToggleFullText: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
    },
    refreshBtn: {
        padding: spacing.xs,
    },
    refreshBtnText: {
        fontSize: 18,
    },
    infoBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.dark.surface,
    },
    infoText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
    },
    yourTurnText: {
        color: colors.dark.success,
        fontSize: fontSize.sm,
        fontWeight: '700',
    },
    heroStatus: {
        backgroundColor: colors.dark.surfaceElevated,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    heroStatusText: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
    },
    handDescText: {
        color: colors.dark.info,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    fullTableContainer: {
        alignItems: 'center',
        paddingVertical: spacing.md,
    },
    fullscreenLeaveBtn: {
        backgroundColor: colors.dark.error,
        marginHorizontal: spacing.md,
        marginBottom: spacing.md,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    fullscreenLeaveText: {
        color: '#fff',
        fontSize: fontSize.base,
        fontWeight: '600',
    },
});
