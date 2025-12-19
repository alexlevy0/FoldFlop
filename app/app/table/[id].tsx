/**
 * Table Screen - Main game screen for a single table
 */

import React, { useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { PokerTable, ActionButtons, AICopilotToggle } from '../../src/components/Table';
import { useTable } from '../../src/hooks/useTable';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing } from '../../src/styles/theme';

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
    } = useTable(id);

    const [isFullAuto, setIsFullAuto] = useState(false);

    // Find hero seat index
    const heroSeatIndex = tableState?.players?.findIndex(p => p?.id === user?.id) ?? -1;
    const heroPlayer = heroSeatIndex >= 0 ? tableState?.players?.[heroSeatIndex] : null;

    // Get valid actions
    const canFold = isMyTurn;
    const canCheck = isMyTurn && (tableState?.game?.currentBet ?? 0) === (heroPlayer?.currentBet ?? 0);
    const canCall = isMyTurn && !canCheck && (tableState?.game?.currentBet ?? 0) > 0;
    const callAmount = (tableState?.game?.currentBet ?? 0) - (heroPlayer?.currentBet ?? 0);
    const canBet = isMyTurn && (tableState?.game?.currentBet ?? 0) === 0;
    const canRaise = isMyTurn && (tableState?.game?.currentBet ?? 0) > 0;
    const minBet = tableState?.table?.bigBlind ?? 0;
    const maxBet = heroPlayer?.stack ?? 0;
    const minRaise = (tableState?.game?.currentBet ?? 0) * 2;
    const maxRaise = heroPlayer?.stack ?? 0;

    // Handle action
    const handleAction = useCallback(async (action: string, amount?: number) => {
        const result = await performAction(action, amount);
        if (!result.success) {
            console.error('Action failed:', result.error);
        }
    }, [performAction]);

    // Handle seat click (join table)
    const handleSeatClick = useCallback(async (seatIndex: number) => {
        if (!user) return;

        const buyIn = (tableState?.table?.minBuyIn ?? 100) * (tableState?.table?.bigBlind ?? 2);
        const result = await joinTable(seatIndex, buyIn);
        if (!result.success) {
            console.error('Join failed:', result.error);
        }
    }, [user, tableState, joinTable]);

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
            isDealer: index === (tableState?.game?.dealerIndex ?? -1),
            isSmallBlind: index === (tableState?.game?.smallBlindIndex ?? -1),
            isBigBlind: index === (tableState?.game?.bigBlindIndex ?? -1),
            isCurrentPlayer: index === (tableState?.game?.currentPlayerIndex ?? -1),
            hasCards: !player.isFolded && tableState?.game?.phase !== 'waiting',
            cards: player.id === user?.id ? myCards : player.showdownCards,
        };
    }) ?? [];

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: tableState?.table?.name ?? 'Table',
                    headerStyle: { backgroundColor: colors.dark.surface },
                    headerTintColor: colors.dark.text,
                }}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Poker Table */}
                <PokerTable
                    players={tablePlayers}
                    communityCards={tableState?.game?.communityCards ?? []}
                    phase={tableState?.game?.phase ?? 'waiting'}
                    pot={tableState?.game?.pot ?? 0}
                    currentPlayerIndex={tableState?.game?.currentPlayerIndex ?? -1}
                    turnStartTime={tableState?.game?.turnStartedAt}
                    turnTimeout={30000}
                    heroSeatIndex={heroSeatIndex}
                    onSeatClick={handleSeatClick}
                />

                {/* AI Copilot */}
                {heroSeatIndex >= 0 && (
                    <View style={styles.aiContainer}>
                        <AICopilotToggle
                            isFullAuto={isFullAuto}
                            onToggle={setIsFullAuto}
                            currentSuggestion={tableState?.aiSuggestion}
                        />
                    </View>
                )}
            </ScrollView>

            {/* Action Buttons - Fixed at bottom */}
            {isMyTurn && heroSeatIndex >= 0 && (
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
                        pot={tableState?.game?.pot ?? 0}
                        suggestedAction={tableState?.aiSuggestion?.action}
                        suggestedAmount={tableState?.aiSuggestion?.amount}
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
        paddingBottom: 120, // Space for action buttons
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
