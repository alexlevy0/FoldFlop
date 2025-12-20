/**
 * Poker Table Component
 * Main table component with ellipse layout and all seats
 */

import React from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { PlayerSeat } from './PlayerSeat';
import { PotDisplay } from './PotDisplay';
import { CommunityCards } from './CommunityCards';
import { TurnTimer } from './TurnTimer';
import { colors, spacing, borderRadius, shadows, fontSize } from '../../styles/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TABLE_WIDTH = Math.min(SCREEN_WIDTH - 32, 800);
const TABLE_HEIGHT = TABLE_WIDTH * 0.6;

interface TablePlayer {
    id: string;
    username: string;
    stack: number;
    currentBet: number;
    isFolded: boolean;
    isAllIn: boolean;
    isDealer: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
    isCurrentPlayer: boolean;
    hasCards: boolean;
    cards?: string[];
    seatIndex?: number;
}

export interface PokerTableProps {
    players: (TablePlayer | null)[];
    communityCards: string[];
    phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'waiting';
    pot: number;
    sidePots?: Array<{ amount: number; eligibleCount: number }>;
    currentPlayerIndex: number;
    turnStartTime?: number | null;
    turnTimeout?: number;
    heroSeatIndex?: number;
    maxPlayers?: number;
    onSeatClick?: (seatIndex: number) => void;
    onTimeout?: () => void;
}

// Seat positions around the ellipse (for up to 9 players)
const SEAT_POSITIONS: Array<'top' | 'top-left' | 'top-right' | 'left' | 'right' | 'bottom' | 'bottom-left' | 'bottom-right'> = [
    'bottom',       // Seat 0 - Hero position
    'bottom-right', // Seat 1
    'right',        // Seat 2
    'top-right',    // Seat 3
    'top',          // Seat 4
    'top-left',     // Seat 5
    'left',         // Seat 6
    'bottom-left',  // Seat 7
];

export function PokerTable({
    players,
    communityCards,
    phase,
    pot,
    sidePots = [],
    currentPlayerIndex,
    turnStartTime,
    turnTimeout = 30000,
    heroSeatIndex = -1,
    maxPlayers = 6,
    onSeatClick,
    onTimeout,
}: PokerTableProps) {
    const gamePhase = phase === 'waiting' ? 'preflop' : phase;
    const isGameActive = phase !== 'waiting';

    // Create a map of seat index to player
    const playersBySeat = new Map<number, TablePlayer>();
    players.forEach(p => {
        if (p && p.seatIndex !== undefined) {
            playersBySeat.set(p.seatIndex, p);
        }
    });

    // Generate seats array based on maxPlayers
    const seats = Array.from({ length: Math.min(maxPlayers, SEAT_POSITIONS.length) }, (_, i) => i);

    return (
        <View style={styles.container}>
            {/* Table surface */}
            <View style={[styles.table, { width: TABLE_WIDTH, height: TABLE_HEIGHT }]}>
                {/* Table felt */}
                <View style={styles.felt}>
                    {/* Center content */}
                    <View style={styles.center}>
                        {/* Phase indicator when waiting */}
                        {phase === 'waiting' && (
                            <View style={styles.waitingIndicator}>
                                <Text style={styles.waitingText}>Waiting for players...</Text>
                                <Text style={styles.waitingSubtext}>
                                    {players.filter(p => p !== null).length} / {maxPlayers} seats
                                </Text>
                            </View>
                        )}

                        {/* Pot display */}
                        {pot > 0 && (
                            <PotDisplay mainPot={pot} sidePots={sidePots} />
                        )}

                        {/* Community cards */}
                        {isGameActive && phase !== 'preflop' && (
                            <CommunityCards cards={communityCards} phase={gamePhase} />
                        )}

                        {/* Timer for current player */}
                        {turnStartTime && currentPlayerIndex >= 0 && (
                            <TurnTimer
                                totalTime={turnTimeout}
                                startTime={turnStartTime}
                                isActive={isGameActive}
                                onTimeout={onTimeout}
                            />
                        )}
                    </View>
                </View>

                {/* Player seats - render ALL seats */}
                {seats.map((seatIndex) => {
                    const position = SEAT_POSITIONS[seatIndex];
                    const player = playersBySeat.get(seatIndex) || null;
                    const isHero = seatIndex === heroSeatIndex;

                    return (
                        <PlayerSeat
                            key={seatIndex}
                            player={player}
                            position={position}
                            seatIndex={seatIndex}
                            isHero={isHero}
                            cards={player?.cards} // Pass cards explicitly
                            onSeatClick={onSeatClick}
                        />
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
    },
    table: {
        position: 'relative',
    },
    felt: {
        flex: 1,
        borderRadius: TABLE_WIDTH / 3,
        backgroundColor: colors.dark.tableGreen,
        borderWidth: 12,
        borderColor: colors.dark.tableBorder,
        ...shadows.lg,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        padding: spacing.xl,
    },
    waitingIndicator: {
        alignItems: 'center',
        padding: spacing.md,
    },
    waitingText: {
        color: colors.dark.text,
        fontSize: fontSize.lg,
        fontWeight: '600',
    },
    waitingSubtext: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
        marginTop: spacing.xs,
    },
});

