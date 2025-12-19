/**
 * Pot Display Component
 * Shows main pot and side pots
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../styles/theme';

interface PotDisplayProps {
    mainPot: number;
    sidePots?: Array<{
        amount: number;
        eligibleCount: number;
    }>;
}

export function PotDisplay({ mainPot, sidePots = [] }: PotDisplayProps) {
    const totalPot = mainPot + sidePots.reduce((sum, p) => sum + p.amount, 0);

    return (
        <View style={styles.container}>
            {/* Main pot */}
            <View style={styles.potItem}>
                <View style={styles.chipStack}>
                    <View style={[styles.chip, styles.chip1]} />
                    <View style={[styles.chip, styles.chip2]} />
                    <View style={[styles.chip, styles.chip3]} />
                </View>
                <Text style={styles.potLabel}>POT</Text>
                <Text style={styles.potAmount}>{totalPot.toLocaleString()}</Text>
            </View>

            {/* Side pots */}
            {sidePots.map((pot, index) => (
                <View key={index} style={styles.sidePotItem}>
                    <Text style={styles.sidePotLabel}>Side Pot {index + 1}</Text>
                    <Text style={styles.sidePotAmount}>{pot.amount.toLocaleString()}</Text>
                    <Text style={styles.sidePotEligible}>({pot.eligibleCount} players)</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: spacing.sm,
    },
    potItem: {
        alignItems: 'center',
        backgroundColor: colors.dark.surface + 'CC',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.lg,
        ...shadows.md,
    },
    chipStack: {
        position: 'relative',
        width: 40,
        height: 30,
        marginBottom: spacing.xs,
    },
    chip: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#DAA520',
    },
    chip1: {
        left: 0,
        bottom: 0,
        backgroundColor: '#FFD700',
    },
    chip2: {
        left: 8,
        bottom: 4,
        backgroundColor: '#FFC107',
    },
    chip3: {
        left: 16,
        bottom: 8,
        backgroundColor: '#FF9800',
    },
    potLabel: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
        fontWeight: '600',
        letterSpacing: 1,
    },
    potAmount: {
        color: colors.dark.accent,
        fontSize: fontSize['2xl'],
        fontWeight: '700',
    },
    sidePotItem: {
        alignItems: 'center',
        backgroundColor: colors.dark.surfaceElevated,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
    },
    sidePotLabel: {
        color: colors.dark.textMuted,
        fontSize: fontSize.xs,
    },
    sidePotAmount: {
        color: colors.dark.text,
        fontSize: fontSize.lg,
        fontWeight: '600',
    },
    sidePotEligible: {
        color: colors.dark.textMuted,
        fontSize: 10,
    },
});
