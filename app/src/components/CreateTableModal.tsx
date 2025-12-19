/**
 * Create Table Modal
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ScrollView,
    Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/styles/theme';
import { TABLE_LEVELS } from '@foldflop/shared';

interface CreateTableModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function CreateTableModal({ visible, onClose }: CreateTableModalProps) {
    const [name, setName] = useState('');
    const [selectedLevel, setSelectedLevel] = useState(0);
    const [isPrivate, setIsPrivate] = useState(false);
    const [maxPlayers, setMaxPlayers] = useState(6);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        if (!name.trim()) {
            setError('Please enter a table name');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const level = TABLE_LEVELS[selectedLevel];

            const { data, error: createError } = await supabase
                .from('tables')
                .insert({
                    name: name.trim(),
                    blinds_sb: level.sb,
                    blinds_bb: level.bb,
                    max_players: maxPlayers,
                    min_buy_in: level.minBuyIn,
                    max_buy_in: level.maxBuyIn,
                    is_private: isPrivate,
                    invite_code: isPrivate ? generateInviteCode() : null,
                })
                .select()
                .single();

            if (createError) throw createError;

            onClose();
            router.push(`/table/${data.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create table');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color={colors.dark.text} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Create Table</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.content}>
                    {/* Error */}
                    {error ? (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    {/* Table Name */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Table Name</Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="My Poker Table"
                            placeholderTextColor={colors.dark.textMuted}
                            maxLength={30}
                        />
                    </View>

                    {/* Blinds Selection */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Blinds</Text>
                        <View style={styles.levelGrid}>
                            {TABLE_LEVELS.map((level, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.levelButton,
                                        selectedLevel === index && styles.levelButtonActive,
                                    ]}
                                    onPress={() => setSelectedLevel(index)}
                                >
                                    <Text style={[
                                        styles.levelText,
                                        selectedLevel === index && styles.levelTextActive,
                                    ]}>
                                        {level.sb}/{level.bb}
                                    </Text>
                                    <Text style={styles.levelLabel}>{level.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Max Players */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Max Players</Text>
                        <View style={styles.playerOptions}>
                            {[2, 6, 9].map(count => (
                                <TouchableOpacity
                                    key={count}
                                    style={[
                                        styles.playerButton,
                                        maxPlayers === count && styles.playerButtonActive,
                                    ]}
                                    onPress={() => setMaxPlayers(count)}
                                >
                                    <Text style={[
                                        styles.playerText,
                                        maxPlayers === count && styles.playerTextActive,
                                    ]}>
                                        {count}
                                    </Text>
                                    <Text style={styles.playerLabel}>
                                        {count === 2 ? 'Heads Up' : count === 6 ? '6-Max' : 'Full Ring'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Private Toggle */}
                    <View style={styles.toggleField}>
                        <View>
                            <Text style={styles.label}>Private Table</Text>
                            <Text style={styles.toggleDescription}>
                                Only players with invite code can join
                            </Text>
                        </View>
                        <Switch
                            value={isPrivate}
                            onValueChange={setIsPrivate}
                            trackColor={{ false: colors.dark.surfaceElevated, true: colors.dark.primary + '80' }}
                            thumbColor={isPrivate ? colors.dark.primary : colors.dark.textMuted}
                        />
                    </View>

                    {/* Summary */}
                    <View style={styles.summary}>
                        <Text style={styles.summaryTitle}>Table Summary</Text>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Blinds:</Text>
                            <Text style={styles.summaryValue}>
                                {TABLE_LEVELS[selectedLevel].sb}/{TABLE_LEVELS[selectedLevel].bb}
                            </Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Buy-in:</Text>
                            <Text style={styles.summaryValue}>
                                {TABLE_LEVELS[selectedLevel].minBuyIn * TABLE_LEVELS[selectedLevel].bb} - {TABLE_LEVELS[selectedLevel].maxBuyIn * TABLE_LEVELS[selectedLevel].bb}
                            </Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Format:</Text>
                            <Text style={styles.summaryValue}>
                                {maxPlayers === 2 ? 'Heads Up' : maxPlayers === 6 ? '6-Max' : '9-Max'}
                            </Text>
                        </View>
                    </View>
                </ScrollView>

                {/* Create Button */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.createButton, isLoading && styles.createButtonDisabled]}
                        onPress={handleCreate}
                        disabled={isLoading}
                    >
                        <Text style={styles.createButtonText}>
                            {isLoading ? 'Creating...' : 'Create Table'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

function generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.dark.border,
        backgroundColor: colors.dark.surface,
    },
    closeButton: {
        padding: spacing.sm,
    },
    title: {
        fontSize: fontSize.lg,
        fontWeight: '600',
        color: colors.dark.text,
    },
    content: {
        flex: 1,
        padding: spacing.lg,
    },
    errorContainer: {
        backgroundColor: colors.dark.error + '20',
        padding: spacing.md,
        borderRadius: borderRadius.md,
        marginBottom: spacing.md,
    },
    errorText: {
        color: colors.dark.error,
        fontSize: fontSize.sm,
        textAlign: 'center',
    },
    field: {
        marginBottom: spacing.lg,
    },
    label: {
        fontSize: fontSize.sm,
        fontWeight: '600',
        color: colors.dark.textSecondary,
        marginBottom: spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: colors.dark.surface,
        borderWidth: 1,
        borderColor: colors.dark.border,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        fontSize: fontSize.base,
        color: colors.dark.text,
    },
    levelGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    levelButton: {
        flex: 1,
        minWidth: '30%',
        backgroundColor: colors.dark.surface,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 2,
        borderColor: colors.dark.border,
        alignItems: 'center',
    },
    levelButtonActive: {
        borderColor: colors.dark.primary,
        backgroundColor: colors.dark.primary + '20',
    },
    levelText: {
        fontSize: fontSize.lg,
        fontWeight: '700',
        color: colors.dark.text,
    },
    levelTextActive: {
        color: colors.dark.primary,
    },
    levelLabel: {
        fontSize: fontSize.xs,
        color: colors.dark.textMuted,
        marginTop: 2,
    },
    playerOptions: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    playerButton: {
        flex: 1,
        backgroundColor: colors.dark.surface,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 2,
        borderColor: colors.dark.border,
        alignItems: 'center',
    },
    playerButtonActive: {
        borderColor: colors.dark.primary,
        backgroundColor: colors.dark.primary + '20',
    },
    playerText: {
        fontSize: fontSize.xl,
        fontWeight: '700',
        color: colors.dark.text,
    },
    playerTextActive: {
        color: colors.dark.primary,
    },
    playerLabel: {
        fontSize: fontSize.xs,
        color: colors.dark.textMuted,
        marginTop: 2,
    },
    toggleField: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.dark.surface,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        marginBottom: spacing.lg,
    },
    toggleDescription: {
        fontSize: fontSize.xs,
        color: colors.dark.textMuted,
        marginTop: 2,
    },
    summary: {
        backgroundColor: colors.dark.surface,
        padding: spacing.lg,
        borderRadius: borderRadius.lg,
        gap: spacing.sm,
    },
    summaryTitle: {
        fontSize: fontSize.base,
        fontWeight: '600',
        color: colors.dark.text,
        marginBottom: spacing.sm,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryLabel: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
    },
    summaryValue: {
        color: colors.dark.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    footer: {
        padding: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.dark.border,
        backgroundColor: colors.dark.surface,
    },
    createButton: {
        backgroundColor: colors.dark.primary,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    createButtonDisabled: {
        opacity: 0.6,
    },
    createButtonText: {
        color: '#fff',
        fontSize: fontSize.base,
        fontWeight: '600',
    },
});
