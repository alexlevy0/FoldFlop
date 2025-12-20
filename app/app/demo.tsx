/**
 * Demo Table Screen - Works without backend
 * Uses poker-engine directly to simulate a game
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PokerTable, ActionButtons, AICopilotToggle } from '../src/components/Table';
import {
    createGameState,
    startHand,
    processAction,
    getValidActions,
    isHandComplete,
    getCurrentPot,
    type GameState,
    type PlayerAction,
} from '@foldflop/poker-engine';
import { getSuggestion, type AISuggestion } from '@foldflop/ai-engine';
import { colors, spacing, fontSize, borderRadius } from '../src/styles/theme';

// Demo players
const DEMO_PLAYERS = [
    { id: 'hero', username: 'You', stack: 1000 },
    { id: 'villain1', username: 'Alice', stack: 1500 },
    { id: 'villain2', username: 'Bob', stack: 800 },
];

export default function DemoTableScreen() {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [isFullAuto, setIsFullAuto] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
    const [message, setMessage] = useState('Click "Deal New Hand" to start');

    const heroIndex = 0; // Hero is always seat 0

    // Initialize game
    const initGame = useCallback(() => {
        const tableConfig = {
            id: 'demo-table',
            name: 'Demo Table',
            maxPlayers: 6,
            smallBlind: 5,
            bigBlind: 10,
            minBuyIn: 20,
            maxBuyIn: 100,
            turnTimeoutMs: 30000,
            isPrivate: false,
            inviteCode: null,
        };

        const players = DEMO_PLAYERS.map((p, i) => ({
            id: p.id,
            seatIndex: i,
            stack: p.stack,
            holeCards: null,
            currentBet: 0,
            totalBetThisHand: 0,
            isFolded: false,
            isAllIn: false,
            isSittingOut: false,
            isDisconnected: false,
        }));

        const state = createGameState(tableConfig, players, 2); // Bob (index 2) is dealer
        return state;
    }, []);

    // Deal a new hand
    const handleDealHand = useCallback(() => {
        let state = initGame();
        state = startHand(state);
        setGameState(state);
        setMessage(`Hand dealt! You have ${state.players[heroIndex].holeCards?.map(c => c.rank + c.suit).join(' ')}`);

        // Get AI suggestion for hero
        const suggestion = getSuggestion(state, heroIndex);
        setAiSuggestion(suggestion);
    }, [initGame]);

    // Process hero action
    const handleAction = useCallback((actionType: string, amount?: number) => {
        if (!gameState || gameState.currentPlayerIndex !== heroIndex) return;

        try {
            let newState = processAction(
                gameState,
                DEMO_PLAYERS[heroIndex].id,
                actionType as any,
                amount ?? 0
            );

            // Check if hand is complete
            if (isHandComplete(newState)) {
                handleHandComplete(newState);
                return;
            }

            // If it's not hero's turn, simulate opponents
            newState = simulateOpponents(newState);

            setGameState(newState);

            // Get new suggestion if it's hero's turn
            if (newState.currentPlayerIndex === heroIndex && !newState.isHandComplete) {
                const suggestion = getSuggestion(newState, heroIndex);
                setAiSuggestion(suggestion);
            } else {
                setAiSuggestion(null);
            }
        } catch (err) {
            setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [gameState, simulateOpponents, handleHandComplete]);

    // Simulate opponent actions
    const simulateOpponents = useCallback((state: GameState): GameState => {
        let currentState = state;
        let iterations = 0;
        const maxIterations = 20; // Prevent infinite loops

        while (
            currentState.currentPlayerIndex !== heroIndex &&
            !currentState.isHandComplete &&
            iterations < maxIterations
        ) {
            iterations++;
            const playerIndex = currentState.currentPlayerIndex;
            const player = currentState.players[playerIndex];

            if (!player || player.isFolded || player.isAllIn) {
                break;
            }

            // Get AI suggestion for opponent
            const suggestion = getSuggestion(currentState, playerIndex);

            try {
                currentState = processAction(
                    currentState,
                    player.id,
                    suggestion.action,
                    suggestion.amount
                );
            } catch (err) {
                console.error('Opponent action error:', err);
                break;
            }

            setMessage(`${DEMO_PLAYERS[playerIndex]?.username}: ${suggestion.action} ${suggestion.amount > 0 ? suggestion.amount : ''}`);
        }

        return currentState;
    }, []);

    // Handle hand completion
    const handleHandComplete = useCallback((state: GameState) => {
        setGameState(state);

        if (state.winners && state.winners.length > 0) {
            const winnerNames = state.winners.map(w => {
                const player = DEMO_PLAYERS.find(p => p.id === w.playerId);
                return `${player?.username} wins ${w.amount} (${w.hand?.description || 'No showdown'})`;
            }).join('\n');

            setMessage(`Hand Complete!\n${winnerNames}\n\nClick "Deal New Hand" to continue`);
        } else {
            setMessage('Hand complete! Click "Deal New Hand" to continue');
        }
        setAiSuggestion(null);
    }, []);

    // Full auto mode
    useEffect(() => {
        if (isFullAuto && gameState && gameState.currentPlayerIndex === heroIndex && aiSuggestion && !gameState.isHandComplete) {
            const timer = setTimeout(() => {
                handleAction(aiSuggestion.action, aiSuggestion.amount);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [isFullAuto, gameState, aiSuggestion, handleAction]);

    // Get valid actions for hero
    const validActions = gameState ? getValidActions(gameState) : null;
    const isHeroTurn = gameState?.currentPlayerIndex === heroIndex && !gameState?.isHandComplete;
    const heroPlayer = gameState?.players[heroIndex];

    // Transform players for PokerTable
    const tablePlayers = gameState ? gameState.players.map((player, index) => {
        if (!player) return null;
        return {
            id: player.id,
            username: DEMO_PLAYERS[index]?.username ?? 'Player',
            stack: player.stack,
            currentBet: player.currentBet ?? 0,
            isFolded: player.isFolded ?? false,
            isAllIn: player.isAllIn ?? false,
            isDealer: index === gameState.dealerIndex,
            isSmallBlind: index === gameState.smallBlindIndex,
            isBigBlind: index === gameState.bigBlindIndex,
            isCurrentPlayer: index === gameState.currentPlayerIndex,
            hasCards: !player.isFolded && player.holeCards !== null,
            cards: index === heroIndex
                ? player.holeCards?.map(c => c.rank + c.suit)
                : (gameState.phase === 'showdown' && !player.isFolded
                    ? player.holeCards?.map(c => c.rank + c.suit)
                    : undefined),
        };
    }) : [];

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: '🎮 Demo Mode',
                    headerStyle: { backgroundColor: colors.dark.surface },
                    headerTintColor: colors.dark.text,
                }}
            />

            <ScrollView contentContainerStyle={styles.content}>
                {/* Demo Banner */}
                <View style={styles.demoBanner}>
                    <Ionicons name="flask" size={20} color={colors.dark.warning} />
                    <Text style={styles.demoBannerText}>
                        Demo Mode - No Supabase Required
                    </Text>
                </View>

                {/* Deal Button */}
                <TouchableOpacity style={styles.dealButton} onPress={handleDealHand}>
                    <Ionicons name="shuffle" size={20} color="#fff" />
                    <Text style={styles.dealButtonText}>Deal New Hand</Text>
                </TouchableOpacity>

                {/* Message */}
                <View style={styles.messageContainer}>
                    <Text style={styles.messageText}>{message}</Text>
                </View>

                {/* Game Phase */}
                {gameState && (
                    <View style={styles.phaseContainer}>
                        <Text style={styles.phaseLabel}>Phase:</Text>
                        <Text style={styles.phaseValue}>{gameState.phase.toUpperCase()}</Text>
                        <Text style={styles.potLabel}>Pot:</Text>
                        <Text style={styles.potValue}>{getCurrentPot(gameState)}</Text>
                    </View>
                )}

                {/* Poker Table */}
                {gameState && (
                    <PokerTable
                        players={tablePlayers}
                        communityCards={gameState.communityCards.map(c => c.rank + c.suit)}
                        phase={gameState.phase as any}
                        pot={getCurrentPot(gameState)}
                        currentPlayerIndex={gameState.currentPlayerIndex}
                        turnStartTime={Date.now()}
                        turnTimeout={30000}
                        heroSeatIndex={heroIndex}
                    />
                )}

                {/* AI Copilot */}
                {gameState && !gameState.isHandComplete && (
                    <View style={styles.aiContainer}>
                        <AICopilotToggle
                            isFullAuto={isFullAuto}
                            onToggle={setIsFullAuto}
                            currentSuggestion={aiSuggestion ? {
                                action: aiSuggestion.action,
                                amount: aiSuggestion.amount,
                                confidence: aiSuggestion.confidence,
                                reason: aiSuggestion.reason,
                            } : null}
                        />
                    </View>
                )}
            </ScrollView>

            {/* Action Buttons */}
            {isHeroTurn && validActions && (
                <View style={styles.actionsContainer}>
                    <ActionButtons
                        canFold={validActions.canFold}
                        canCheck={validActions.canCheck}
                        canCall={validActions.canCall}
                        canBet={validActions.canBet}
                        canRaise={validActions.canRaise}
                        callAmount={validActions.callAmount}
                        minBet={validActions.minBet}
                        maxBet={validActions.maxBet}
                        minRaise={validActions.minRaise}
                        maxRaise={validActions.maxRaise}
                        pot={getCurrentPot(gameState!)}
                        suggestedAction={aiSuggestion?.action}
                        suggestedAmount={aiSuggestion?.amount}
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
        paddingBottom: 140,
    },
    demoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.dark.warning + '20',
        padding: spacing.sm,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.md,
    },
    demoBannerText: {
        color: colors.dark.warning,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    dealButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.dark.primary,
        padding: spacing.md,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.md,
    },
    dealButtonText: {
        color: '#fff',
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    messageContainer: {
        backgroundColor: colors.dark.surface,
        padding: spacing.md,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.md,
    },
    messageText: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
        textAlign: 'center',
        lineHeight: 20,
    },
    phaseContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        marginTop: spacing.md,
        padding: spacing.sm,
    },
    phaseLabel: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
    },
    phaseValue: {
        color: colors.dark.primary,
        fontSize: fontSize.sm,
        fontWeight: '700',
    },
    potLabel: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
        marginLeft: spacing.md,
    },
    potValue: {
        color: colors.dark.accent,
        fontSize: fontSize.sm,
        fontWeight: '700',
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
