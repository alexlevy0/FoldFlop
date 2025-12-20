/**
 * Table Screen - Main game screen for a single table
 */

import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { PokerTable, ActionButtons, AICopilotToggle } from '../../src/components/Table';
import { useTable } from '../../src/hooks/useTable';
import { useAuth } from '../../src/providers/AuthProvider';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/styles/theme';

export default function TableScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const {
        tableState,
        isLoading,
        error,
        isMyTurn,
        myCards,
        joinTable,
        leaveTable,
        performAction,
        refetch,
    } = useTable(id);

    const [isFullAuto, setIsFullAuto] = useState(true); // AI enabled by default
    const [joinError, setJoinError] = useState('');
    const [isDealing, setIsDealing] = useState(false);

    // Find hero player and their seat index
    const heroPlayer = tableState?.players?.find(p => p?.id === user?.id) ?? null;
    const heroSeatIndex = heroPlayer?.seatIndex ?? -1;
    const isSeated = !!heroPlayer;
    const playerCount = tableState?.players?.length ?? 0;
    const canStartGame = isSeated && playerCount >= 2 && (tableState?.phase === 'waiting' || !tableState?.phase);

    // Get valid actions (simplified for now)
    const canFold = isMyTurn;
    const canCheck = isMyTurn && (tableState?.currentBet ?? 0) === (heroPlayer?.currentBet ?? 0);
    const canCall = isMyTurn && !canCheck && (tableState?.currentBet ?? 0) > 0;
    const callAmount = (tableState?.currentBet ?? 0) - (heroPlayer?.currentBet ?? 0);
    const canBet = isMyTurn && (tableState?.currentBet ?? 0) === 0;
    const canRaise = isMyTurn && (tableState?.currentBet ?? 0) > 0;
    const minBet = tableState?.blinds?.bb ?? 10;
    const maxBet = heroPlayer?.stack ?? 0;
    const minRaise = (tableState?.currentBet ?? 0) * 2;
    const maxRaise = heroPlayer?.stack ?? 0;

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

    // Handle action
    const handleAction = useCallback(async (action: string, amount?: number) => {
        const result = await performAction(action, amount);
        if (!result.success) {
            console.error('Action failed:', result.error);
            Alert.alert('Error', result.error || 'Action failed');
        }
    }, [performAction]);

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
                    </View>
                )}

                {/* AI Copilot */}
                {isSeated && (
                    <View style={styles.aiContainer}>
                        <AICopilotToggle
                            isFullAuto={isFullAuto}
                            onToggle={setIsFullAuto}
                            currentSuggestion={null}
                        />
                    </View>
                )}
            </ScrollView>

            {/* Action Buttons - Fixed at bottom */}
            {isMyTurn && isSeated && (
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
                        pot={tableState?.pot ?? 0}
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
});


