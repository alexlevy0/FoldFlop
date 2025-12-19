/**
 * AI Copilot Toggle Component
 * Toggle for Full Auto mode with AI suggestion display
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../styles/theme';

interface AICopilotToggleProps {
    isFullAuto: boolean;
    onToggle: (enabled: boolean) => void;
    currentSuggestion?: {
        action: string;
        amount?: number;
        confidence: number;
        reason: string;
    } | null;
}

export function AICopilotToggle({ isFullAuto, onToggle, currentSuggestion }: AICopilotToggleProps) {
    return (
        <View style={styles.container}>
            {/* AI Badge */}
            <View style={styles.header}>
                <View style={styles.aiIcon}>
                    <Ionicons name="flash" size={16} color={colors.dark.accent} />
                </View>
                <Text style={styles.title}>AI Copilot</Text>
            </View>

            {/* Current suggestion */}
            {currentSuggestion && (
                <View style={styles.suggestionContainer}>
                    <Text style={styles.suggestionAction}>
                        {currentSuggestion.action.toUpperCase()}
                        {currentSuggestion.amount ? ` ${currentSuggestion.amount.toLocaleString()}` : ''}
                    </Text>
                    <View style={styles.confidenceBar}>
                        <View
                            style={[
                                styles.confidenceFill,
                                { width: `${currentSuggestion.confidence * 100}%` }
                            ]}
                        />
                    </View>
                    <Text style={styles.reason} numberOfLines={2}>
                        {currentSuggestion.reason}
                    </Text>
                </View>
            )}

            {/* Full Auto Toggle */}
            <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                    <Ionicons
                        name={isFullAuto ? 'rocket' : 'rocket-outline'}
                        size={20}
                        color={isFullAuto ? colors.dark.accent : colors.dark.textMuted}
                    />
                    <Text style={[styles.toggleLabel, isFullAuto && styles.toggleLabelActive]}>
                        Full Auto
                    </Text>
                </View>
                <Switch
                    value={isFullAuto}
                    onValueChange={onToggle}
                    trackColor={{
                        false: colors.dark.surfaceElevated,
                        true: colors.dark.primary + '80'
                    }}
                    thumbColor={isFullAuto ? colors.dark.accent : colors.dark.textMuted}
                />
            </View>

            {isFullAuto && (
                <Text style={styles.warning}>
                    AI will play automatically for you
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.dark.surface,
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.dark.border,
        gap: spacing.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    aiIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.dark.accent + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: colors.dark.text,
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    suggestionContainer: {
        backgroundColor: colors.dark.surfaceElevated,
        padding: spacing.sm,
        borderRadius: borderRadius.md,
        gap: spacing.xs,
    },
    suggestionAction: {
        color: colors.dark.primary,
        fontSize: fontSize.lg,
        fontWeight: '700',
    },
    confidenceBar: {
        height: 4,
        backgroundColor: colors.dark.border,
        borderRadius: 2,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        backgroundColor: colors.dark.success,
        borderRadius: 2,
    },
    reason: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.dark.border,
    },
    toggleInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    toggleLabel: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
        fontWeight: '500',
    },
    toggleLabelActive: {
        color: colors.dark.accent,
    },
    warning: {
        color: colors.dark.warning,
        fontSize: fontSize.xs,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});
