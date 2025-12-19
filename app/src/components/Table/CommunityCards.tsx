/**
 * Community Cards Component
 * Displays the board cards (flop, turn, river)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card as CardComponent } from './Card';
import { colors, spacing, borderRadius, shadows } from '../../styles/theme';

interface CommunityCardsProps {
    cards: string[];
    phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

export function CommunityCards({ cards, phase }: CommunityCardsProps) {
    // Determine how many cards to show based on phase
    const cardsToShow = phase === 'preflop' ? 0 : cards.length;

    // Show placeholders for cards not yet dealt
    const placeholders = phase === 'preflop' ? 0 :
        phase === 'flop' ? Math.max(0, 3 - cardsToShow) :
            phase === 'turn' ? Math.max(0, 4 - cardsToShow) :
                Math.max(0, 5 - cardsToShow);

    return (
        <View style={styles.container}>
            {/* Dealt cards */}
            {cards.slice(0, cardsToShow).map((card, index) => (
                <CardComponent key={index} card={card} size="md" />
            ))}

            {/* Placeholder cards */}
            {Array.from({ length: placeholders }).map((_, index) => (
                <View key={`placeholder-${index}`} style={styles.placeholder} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: colors.dark.tableGreen + '40',
        borderRadius: borderRadius.lg,
        ...shadows.sm,
    },
    placeholder: {
        width: 52,
        height: 72,
        backgroundColor: colors.dark.tableGreenLight + '30',
        borderRadius: borderRadius.sm,
        borderWidth: 1,
        borderColor: colors.dark.tableBorder + '50',
        borderStyle: 'dashed',
    },
});
