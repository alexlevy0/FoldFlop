/**
 * Mini Poker Table Component
 * Compact version for multi-table grid display
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Card } from './Card';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Calculate mini table size based on grid (3 columns on desktop, 2 on mobile)
const isDesktop = SCREEN_WIDTH > 768;
const GRID_COLS = isDesktop ? 3 : 2;
const TABLE_GAP = spacing.sm;
const MINI_TABLE_WIDTH = (SCREEN_WIDTH - (GRID_COLS + 1) * TABLE_GAP) / GRID_COLS;
const MINI_TABLE_HEIGHT = MINI_TABLE_WIDTH * 0.75;

export interface MiniTablePlayer {
    id: string;
    username: string;
    stack: number;
    isCurrentPlayer: boolean;
    isFolded: boolean;
}

export interface MiniPokerTableProps {
    tableId: string;
    tableName?: string;
    players: MiniTablePlayer[];
    communityCards: string[];
    myCards: string[];
    phase: string;
    pot: number;
    isMyTurn: boolean;
    isFocused?: boolean;
    onPress?: () => void;
    onAction?: (action: string, amount?: number) => void;
}

export function MiniPokerTable({
    tableId,
    tableName = 'Table',
    players,
    communityCards,
    myCards,
    phase,
    pot,
    isMyTurn,
    isFocused = false,
    onPress,
    onAction,
}: MiniPokerTableProps) {
    const activePlayers = players.filter(p => !p.isFolded).length;
    const currentPlayer = players.find(p => p.isCurrentPlayer);

    return (
        <TouchableOpacity
            style={[
                styles.container,
                isFocused && styles.focused,
                isMyTurn && styles.myTurn,
            ]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.tableName} numberOfLines={1}>
                    {tableName}
                </Text>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>
                        {phase === 'waiting' ? 'Waiting' : phase.toUpperCase()}
                    </Text>
                </View>
            </View>

            {/* Table Area */}
            <View style={styles.tableArea}>
                {/* Pot */}
                {pot > 0 && (
                    <Text style={styles.potText}>Pot: {pot.toLocaleString()}</Text>
                )}

                {/* Community Cards - Mini */}
                <View style={styles.communityCards}>
                    {communityCards.slice(0, 5).map((card, i) => (
                        <View key={i} style={styles.miniCard}>
                            <Text style={styles.miniCardText}>{card}</Text>
                        </View>
                    ))}
                    {phase === 'preflop' && (
                        <Text style={styles.preflopText}>Preflop</Text>
                    )}
                </View>

                {/* My Cards */}
                {myCards.length > 0 && (
                    <View style={styles.myCards}>
                        {myCards.map((card, i) => (
                            <View key={i} style={styles.holeCard}>
                                <Text style={styles.holeCardText}>{card}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            {/* Footer Info */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    {activePlayers} players • {currentPlayer?.username || 'Waiting'}
                </Text>
            </View>

            {/* Turn Indicator */}
            {isMyTurn && (
                <View style={styles.turnBanner}>
                    <Text style={styles.turnText}>YOUR TURN</Text>
                </View>
            )}

            {/* Quick Actions when it's my turn */}
            {isMyTurn && onAction && (
                <View style={styles.quickActions}>
                    <TouchableOpacity
                        style={[styles.quickBtn, styles.foldBtn]}
                        onPress={() => onAction('fold')}
                    >
                        <Text style={styles.quickBtnText}>F</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.quickBtn, styles.checkBtn]}
                        onPress={() => onAction('check')}
                    >
                        <Text style={styles.quickBtnText}>C</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.quickBtn, styles.raiseBtn]}
                        onPress={() => onAction('raise')}
                    >
                        <Text style={styles.quickBtnText}>R</Text>
                    </TouchableOpacity>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        width: MINI_TABLE_WIDTH,
        height: MINI_TABLE_HEIGHT,
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: colors.dark.border,
        ...shadows.md,
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
    statusBadge: {
        backgroundColor: colors.dark.primaryHover,
        paddingHorizontal: spacing.xs,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
    },
    statusText: {
        color: colors.dark.text,
        fontSize: fontSize.xs,
        fontWeight: '500',
    },
    tableArea: {
        flex: 1,
        backgroundColor: colors.dark.tableGreen,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xs,
    },
    potText: {
        color: colors.dark.accent,
        fontSize: fontSize.sm,
        fontWeight: '700',
        marginBottom: spacing.xs,
    },
    communityCards: {
        flexDirection: 'row',
        gap: 2,
        marginBottom: spacing.xs,
    },
    miniCard: {
        width: 22,
        height: 30,
        backgroundColor: colors.dark.surface,
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.dark.border,
    },
    miniCardText: {
        color: colors.dark.text,
        fontSize: 9,
        fontWeight: '600',
    },
    preflopText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
    },
    myCards: {
        flexDirection: 'row',
        gap: 4,
    },
    holeCard: {
        width: 28,
        height: 38,
        backgroundColor: colors.dark.surface,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.dark.primary,
    },
    holeCardText: {
        color: colors.dark.text,
        fontSize: 10,
        fontWeight: '700',
    },
    footer: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        backgroundColor: colors.dark.background,
    },
    footerText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
    },
    turnBanner: {
        position: 'absolute',
        top: '40%',
        left: 0,
        right: 0,
        backgroundColor: 'rgba(34, 197, 94, 0.9)',
        paddingVertical: spacing.xs,
        alignItems: 'center',
    },
    turnText: {
        color: '#fff',
        fontSize: fontSize.sm,
        fontWeight: '700',
    },
    quickActions: {
        position: 'absolute',
        bottom: 30,
        right: spacing.xs,
        flexDirection: 'row',
        gap: 4,
    },
    quickBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    foldBtn: {
        backgroundColor: colors.dark.error,
    },
    checkBtn: {
        backgroundColor: colors.dark.warning,
    },
    raiseBtn: {
        backgroundColor: colors.dark.success,
    },
    quickBtnText: {
        color: '#fff',
        fontSize: fontSize.xs,
        fontWeight: '700',
    },
});
