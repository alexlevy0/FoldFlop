/**
 * Create Table Screen
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Switch,
    SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../src/styles/theme';

const TABLE_LEVELS = [
    { name: 'Micro', sb: 1, bb: 2, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'Low', sb: 5, bb: 10, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'Medium', sb: 25, bb: 50, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'High', sb: 100, bb: 200, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'VIP', sb: 500, bb: 1000, minBuyIn: 20, maxBuyIn: 100 },
];

export default function CreateTableScreen() {
    const [name, setName] = useState('');
    const [selectedLevel, setSelectedLevel] = useState(1);
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
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                setError('You must be logged in to create a table');
                setIsLoading(false);
                return;
            }

            console.log('Creating table as user:', user.id);

            const level = TABLE_LEVELS[selectedLevel];

            const { data, error: createError } = await supabase
                .from('tables')
                .insert({
                    name: name.trim(),
                    blinds_sb: level.sb,
                    blinds_bb: level.bb,
                    max_players: maxPlayers,
                    min_buyin: level.minBuyIn,
                    max_buyin: level.maxBuyIn,
                    is_private: isPrivate,
                    invite_code: isPrivate ? generateInviteCode() : null,
                    created_by: user.id,
                })
                .select()
                .single();

            if (createError) {
                console.error('Create table error:', createError);
                throw createError;
            }

            router.replace(`/table/${data.id}`);
        } catch (err) {
            console.error('Error:', err);
            setError(err instanceof Error ? err.message : 'Failed to create table');
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'Create Table',
                    headerStyle: { backgroundColor: colors.dark.surface },
                    headerTintColor: colors.dark.text,
                }}
            />

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
                    <Text style={styles.label}>Format</Text>
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
                                <Ionicons
                                    name="people"
                                    size={24}
                                    color={maxPlayers === count ? colors.dark.primary : colors.dark.textMuted}
                                />
                                <Text style={[
                                    styles.playerText,
                                    maxPlayers === count && styles.playerTextActive,
                                ]}>
                                    {count === 2 ? 'Heads Up' : count === 6 ? '6-Max' : 'Full Ring'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Private Toggle */}
                <View style={styles.toggleField}>
                    <View style={styles.toggleInfo}>
                        <Ionicons
                            name={isPrivate ? 'lock-closed' : 'lock-open'}
                            size={24}
                            color={isPrivate ? colors.dark.primary : colors.dark.textMuted}
                        />
                        <View>
                            <Text style={styles.toggleLabel}>Private Table</Text>
                            <Text style={styles.toggleDescription}>
                                Only players with invite code can join
                            </Text>
                        </View>
                    </View>
                    <Switch
                        value={isPrivate}
                        onValueChange={setIsPrivate}
                        trackColor={{ false: colors.dark.surfaceElevated, true: colors.dark.primary + '80' }}
                        thumbColor={isPrivate ? colors.dark.primary : colors.dark.textMuted}
                    />
                </View>

                {/* Summary Card */}
                <View style={styles.summary}>
                    <View style={styles.summaryHeader}>
                        <Ionicons name="information-circle" size={20} color={colors.dark.primary} />
                        <Text style={styles.summaryTitle}>Table Summary</Text>
                    </View>
                    <View style={styles.summaryContent}>
                        <SummaryRow label="Blinds" value={`${TABLE_LEVELS[selectedLevel].sb}/${TABLE_LEVELS[selectedLevel].bb}`} />
                        <SummaryRow
                            label="Buy-in Range"
                            value={`${TABLE_LEVELS[selectedLevel].minBuyIn * TABLE_LEVELS[selectedLevel].bb} - ${TABLE_LEVELS[selectedLevel].maxBuyIn * TABLE_LEVELS[selectedLevel].bb}`}
                        />
                        <SummaryRow
                            label="Format"
                            value={maxPlayers === 2 ? 'Heads Up' : maxPlayers === 6 ? '6-Max' : '9-Max Full Ring'}
                        />
                        <SummaryRow label="Visibility" value={isPrivate ? 'Private' : 'Public'} />
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
                    <Ionicons name="add-circle" size={24} color="#fff" />
                    <Text style={styles.createButtonText}>
                        {isLoading ? 'Creating...' : 'Create Table'}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={styles.summaryValue}>{value}</Text>
        </View>
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
    content: {
        flex: 1,
        padding: spacing.lg,
    },
    errorContainer: {
        backgroundColor: colors.dark.error + '20',
        padding: spacing.md,
        borderRadius: borderRadius.md,
        marginBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    errorText: {
        color: colors.dark.error,
        fontSize: fontSize.sm,
        flex: 1,
    },
    field: {
        marginBottom: spacing.xl,
    },
    label: {
        fontSize: fontSize.sm,
        fontWeight: '600',
        color: colors.dark.textSecondary,
        marginBottom: spacing.md,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: colors.dark.surface,
        borderWidth: 1,
        borderColor: colors.dark.border,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        fontSize: fontSize.lg,
        color: colors.dark.text,
    },
    levelGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    levelButton: {
        backgroundColor: colors.dark.surface,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        borderWidth: 2,
        borderColor: colors.dark.border,
        alignItems: 'center',
        minWidth: 80,
    },
    levelButtonActive: {
        borderColor: colors.dark.primary,
        backgroundColor: colors.dark.primary + '15',
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
        marginTop: 4,
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
        gap: spacing.xs,
    },
    playerButtonActive: {
        borderColor: colors.dark.primary,
        backgroundColor: colors.dark.primary + '15',
    },
    playerText: {
        fontSize: fontSize.sm,
        fontWeight: '500',
        color: colors.dark.textSecondary,
        textAlign: 'center',
    },
    playerTextActive: {
        color: colors.dark.primary,
        fontWeight: '600',
    },
    toggleField: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.dark.surface,
        padding: spacing.lg,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.xl,
    },
    toggleInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    toggleLabel: {
        color: colors.dark.text,
        fontSize: fontSize.base,
        fontWeight: '500',
    },
    toggleDescription: {
        fontSize: fontSize.xs,
        color: colors.dark.textMuted,
        marginTop: 2,
    },
    summary: {
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: colors.dark.primary + '15',
    },
    summaryTitle: {
        fontSize: fontSize.base,
        fontWeight: '600',
        color: colors.dark.primary,
    },
    summaryContent: {
        padding: spacing.md,
        gap: spacing.sm,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.xs,
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.dark.primary,
        padding: spacing.md,
        borderRadius: borderRadius.md,
    },
    createButtonDisabled: {
        opacity: 0.6,
    },
    createButtonText: {
        color: '#fff',
        fontSize: fontSize.lg,
        fontWeight: '600',
    },
});
