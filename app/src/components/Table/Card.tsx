/**
 * Card Component - Displays a playing card
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, borderRadius, shadows } from '../../styles/theme';

interface CardProps {
    card: string | { rank: string; suit: string }; // e.g., "Ah" or {rank: "A", suit: "h"}
    faceDown?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

const RANK_DISPLAY: Record<string, string> = {
    'A': 'A',
    'K': 'K',
    'Q': 'Q',
    'J': 'J',
    'T': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2',
};

const SUIT_SYMBOLS: Record<string, string> = {
    'h': '♥',
    'd': '♦',
    'c': '♣',
    's': '♠',
};

const SUIT_COLORS: Record<string, string> = {
    'h': colors.dark.hearts,
    'd': colors.dark.diamonds,
    'c': colors.dark.clubs,
    's': colors.dark.spades,
};

const SIZES = {
    sm: { width: 36, height: 50, rankSize: 14, suitSize: 12 },
    md: { width: 52, height: 72, rankSize: 18, suitSize: 16 },
    lg: { width: 72, height: 100, rankSize: 24, suitSize: 20 },
};

export function Card({ card, faceDown = false, size = 'md' }: CardProps) {
    const dimensions = SIZES[size];

    // Handle 'back' card (loading state placeholder)
    if (card === 'back') {
        return (
            <View style={[styles.card, styles.faceDown, { width: dimensions.width, height: dimensions.height }]}>
                <View style={styles.cardBack}>
                    <Text style={styles.cardBackText}>🃏</Text>
                </View>
            </View>
        );
    }

    // Handle undefined or invalid card
    // Safely check for length if string, or properties if object
    const isValid = typeof card === 'string' ? card.length >= 2 : (card && 'rank' in card && 'suit' in card);

    if (!isValid) {
        return (
            <View style={[styles.card, styles.faceDown, { width: dimensions.width, height: dimensions.height }]}>
                <View style={styles.cardBack}>
                    <Text style={styles.cardBackText}>🃏</Text>
                </View>
            </View>
        );
    }

    if (faceDown) {
        return (
            <View style={[styles.card, styles.faceDown, { width: dimensions.width, height: dimensions.height }]}>
                <View style={styles.cardBack}>
                    <Text style={styles.cardBackText}>🃏</Text>
                </View>
            </View>
        );
    }

    let rank: string;
    let suit: string;

    if (typeof card === 'string') {
        rank = card[0];
        suit = card[1];
    } else {
        rank = card.rank;
        suit = card.suit;
    }

    const suitColor = SUIT_COLORS[suit] || '#000';

    return (
        <View style={[styles.card, { width: dimensions.width, height: dimensions.height }]}>
            <View style={styles.cardContent}>
                <Text style={[styles.rank, { fontSize: dimensions.rankSize, color: suitColor }]}>
                    {RANK_DISPLAY[rank] || rank}
                </Text>
                <Text style={[styles.suit, { fontSize: dimensions.suitSize, color: suitColor }]}>
                    {SUIT_SYMBOLS[suit] || suit}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.dark.cardWhite,
        borderRadius: borderRadius.sm,
        ...shadows.md,
    },
    faceDown: {
        backgroundColor: '#1a365d',
        borderWidth: 2,
        borderColor: '#2a4a7a',
    },
    cardBack: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e3a5f',
        margin: 2,
        borderRadius: borderRadius.sm - 2,
    },
    cardBackText: {
        fontSize: 20,
        opacity: 0.5,
    },
    cardContent: {
        flex: 1,
        padding: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rank: {
        fontWeight: '700',
        marginBottom: -4,
    },
    suit: {
        fontWeight: '400',
    },
});
