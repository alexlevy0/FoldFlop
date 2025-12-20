/**
 * Player Seat Component
 * Displays a player at the table with their cards, chips, and status
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card as CardComponent } from './Card';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../styles/theme';

interface PlayerSeatProps {
    player: {
        id: string;
        username: string;
        avatarUrl?: string;
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
    } | null;
    position: 'top' | 'top-left' | 'top-right' | 'left' | 'right' | 'bottom' | 'bottom-left' | 'bottom-right';
    isHero?: boolean;
    seatIndex: number;
    onSeatClick?: (seatIndex: number) => void;
}

export function PlayerSeat({ player, position, isHero = false, seatIndex, onSeatClick }: PlayerSeatProps) {
    if (!player) {
        // Empty seat - clickable
        return (
            <TouchableOpacity
                style={[styles.container, styles.emptySeat, getPositionStyle(position)]}
                onPress={() => onSeatClick?.(seatIndex)}
                activeOpacity={0.7}
            >
                <Text style={styles.emptySeatText}>Sit Here</Text>
                <Text style={styles.seatNumber}>Seat {seatIndex + 1}</Text>
            </TouchableOpacity>
        );
    }

    const isActive = player.isCurrentPlayer && !player.isFolded && !player.isAllIn;

    return (
        <View style={[
            styles.container,
            getPositionStyle(position),
            isActive && styles.activePlayer,
            player.isFolded && styles.foldedPlayer,
        ]}>
            {/* Dealer/Blind buttons */}
            <View style={styles.buttons}>
                {player.isDealer && (
                    <View style={[styles.button, styles.dealerButton]}>
                        <Text style={styles.buttonText}>D</Text>
                    </View>
                )}
                {player.isSmallBlind && (
                    <View style={[styles.button, styles.sbButton]}>
                        <Text style={styles.buttonText}>SB</Text>
                    </View>
                )}
                {player.isBigBlind && (
                    <View style={[styles.button, styles.bbButton]}>
                        <Text style={styles.buttonText}>BB</Text>
                    </View>
                )}
            </View>

            {/* Avatar */}
            <View style={[styles.avatar, isActive && styles.avatarActive]}>
                <Text style={styles.avatarText}>
                    {player.username.substring(0, 2).toUpperCase()}
                </Text>
            </View>

            {/* Username */}
            <Text style={styles.username} numberOfLines={1}>
                {player.username}
            </Text>

            {/* Stack */}
            <Text style={styles.stack}>
                {player.stack.toLocaleString()}
            </Text>

            {/* Cards */}
            {player.hasCards && (
                <View style={styles.cardsContainer}>
                    {isHero && player.cards ? (
                        // Show hero's cards
                        <>
                            <CardComponent card={player.cards[0]} size="sm" />
                            <CardComponent card={player.cards[1]} size="sm" />
                        </>
                    ) : player.cards ? (
                        // Showdown - show opponent's cards
                        <>
                            <CardComponent card={player.cards[0]} size="sm" />
                            <CardComponent card={player.cards[1]} size="sm" />
                        </>
                    ) : (
                        // Face down cards
                        <>
                            <CardComponent card="Xx" faceDown size="sm" />
                            <CardComponent card="Xx" faceDown size="sm" />
                        </>
                    )}
                </View>
            )}

            {/* Current bet */}
            {player.currentBet > 0 && (
                <View style={styles.betContainer}>
                    <View style={styles.chip} />
                    <Text style={styles.betAmount}>{player.currentBet.toLocaleString()}</Text>
                </View>
            )}

            {/* All-in badge */}
            {player.isAllIn && (
                <View style={styles.allInBadge}>
                    <Text style={styles.allInText}>ALL-IN</Text>
                </View>
            )}

            {/* Folded overlay */}
            {player.isFolded && (
                <View style={styles.foldedOverlay}>
                    <Text style={styles.foldedText}>FOLD</Text>
                </View>
            )}
        </View>
    );
}

function getPositionStyle(position: string) {
    const positions: Record<string, any> = {
        'top': { top: 10, left: '50%', transform: [{ translateX: -50 }] },
        'top-left': { top: '15%', left: '10%' },
        'top-right': { top: '15%', right: '10%' },
        'left': { top: '50%', left: 10, transform: [{ translateY: -50 }] },
        'right': { top: '50%', right: 10, transform: [{ translateY: -50 }] },
        'bottom-left': { bottom: '15%', left: '10%' },
        'bottom-right': { bottom: '15%', right: '10%' },
        'bottom': { bottom: 10, left: '50%', transform: [{ translateX: -50 }] },
    };
    return positions[position] || {};
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        alignItems: 'center',
        minWidth: 80,
        padding: spacing.sm,
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        borderWidth: 2,
        borderColor: colors.dark.border,
        ...shadows.md,
    },
    emptySeat: {
        backgroundColor: colors.dark.surfaceElevated,
        borderStyle: 'dashed',
        borderColor: colors.dark.primary,
        opacity: 0.9,
        padding: spacing.md,
    },
    emptySeatText: {
        color: colors.dark.primary,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    seatNumber: {
        color: colors.dark.textMuted,
        fontSize: fontSize.xs,
        marginTop: 2,
    },
    activePlayer: {
        borderColor: colors.dark.primary,
        backgroundColor: colors.dark.primary + '20',
    },
    foldedPlayer: {
        opacity: 0.5,
    },
    buttons: {
        position: 'absolute',
        top: -12,
        right: -12,
        flexDirection: 'row',
        gap: 4,
    },
    button: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dealerButton: {
        backgroundColor: '#FFD700',
    },
    sbButton: {
        backgroundColor: '#3B82F6',
    },
    bbButton: {
        backgroundColor: '#EF4444',
    },
    buttonText: {
        color: '#000',
        fontSize: 10,
        fontWeight: '700',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.dark.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xs,
    },
    avatarActive: {
        backgroundColor: colors.dark.primary,
    },
    avatarText: {
        color: colors.dark.text,
        fontSize: fontSize.lg,
        fontWeight: '600',
    },
    username: {
        color: colors.dark.text,
        fontSize: fontSize.xs,
        fontWeight: '500',
        maxWidth: 70,
    },
    stack: {
        color: colors.dark.accent,
        fontSize: fontSize.sm,
        fontWeight: '700',
    },
    cardsContainer: {
        flexDirection: 'row',
        gap: 4,
        marginTop: spacing.xs,
    },
    betContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: spacing.xs,
        backgroundColor: colors.dark.surfaceElevated,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
    },
    chip: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.dark.accent,
    },
    betAmount: {
        color: colors.dark.text,
        fontSize: fontSize.xs,
        fontWeight: '600',
    },
    allInBadge: {
        position: 'absolute',
        bottom: -10,
        backgroundColor: colors.dark.accent,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
    },
    allInText: {
        color: '#000',
        fontSize: 10,
        fontWeight: '700',
    },
    foldedOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: borderRadius.lg - 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    foldedText: {
        color: colors.dark.error,
        fontSize: fontSize.xs,
        fontWeight: '700',
    },
});
