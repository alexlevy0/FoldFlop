/**
 * Lobby Screen - Table list and quick join
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useChips } from '../../src/hooks/useChips';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/styles/theme';
import type { TableListItem } from '@foldflop/shared';

export default function LobbyScreen() {
    const { balance, canClaimDailyBonus, claimDailyBonus } = useChips();
    const [tables, setTables] = useState<TableListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'micro' | 'low' | 'mid' | 'high'>('all');

    const loadTables = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('tables')
                .select(`
          id,
          name,
          blinds_sb,
          blinds_bb,
          max_players,
          is_private,
          table_players(count)
        `)
                .eq('is_private', false)
                .order('blinds_bb', { ascending: true });

            if (error) throw error;

            const tableList: TableListItem[] = (data ?? []).map(t => ({
                id: t.id,
                name: t.name,
                smallBlind: t.blinds_sb,
                bigBlind: t.blinds_bb,
                maxPlayers: t.max_players,
                currentPlayers: (t.table_players as any)?.[0]?.count ?? 0,
                avgStack: 0,
                isPrivate: t.is_private,
                isWaiting: (t.table_players as any)?.[0]?.count < 2,
            }));

            setTables(tableList);
        } catch (err) {
            console.error('Failed to load tables:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadTables();

        // Auto-refresh every 10 seconds
        const interval = setInterval(loadTables, 10000);
        return () => clearInterval(interval);
    }, [loadTables]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        loadTables();
    }, [loadTables]);

    const handleClaimBonus = async () => {
        const result = await claimDailyBonus();
        if (result.success) {
            // Show success toast
        }
    };

    const filteredTables = tables.filter(t => {
        if (filter === 'all') return true;
        if (filter === 'micro') return t.bigBlind <= 100;
        if (filter === 'low') return t.bigBlind > 100 && t.bigBlind <= 500;
        if (filter === 'mid') return t.bigBlind > 500 && t.bigBlind <= 2000;
        if (filter === 'high') return t.bigBlind > 2000;
        return true;
    });

    const renderTable = ({ item }: { item: TableListItem }) => (
        <TouchableOpacity
            style={styles.tableCard}
            onPress={() => router.push(`/table/${item.id}`)}
        >
            <View style={styles.tableHeader}>
                <Text style={styles.tableName}>{item.name}</Text>
                {item.isWaiting && (
                    <View style={styles.waitingBadge}>
                        <Text style={styles.waitingText}>Waiting</Text>
                    </View>
                )}
            </View>

            <View style={styles.tableInfo}>
                <View style={styles.infoItem}>
                    <Ionicons name="cash-outline" size={16} color={colors.dark.accent} />
                    <Text style={styles.infoText}>
                        {item.smallBlind}/{item.bigBlind}
                    </Text>
                </View>

                <View style={styles.infoItem}>
                    <Ionicons name="people-outline" size={16} color={colors.dark.textSecondary} />
                    <Text style={styles.infoText}>
                        {item.currentPlayers}/{item.maxPlayers}
                    </Text>
                </View>
            </View>

            <View style={styles.joinButton}>
                <Text style={styles.joinButtonText}>
                    {item.currentPlayers < item.maxPlayers ? 'Join' : 'Watch'}
                </Text>
                <Ionicons name="arrow-forward" size={16} color={colors.dark.primary} />
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Balance Header */}
            <View style={styles.header}>
                <View style={styles.balanceContainer}>
                    <Text style={styles.balanceLabel}>Your Chips</Text>
                    <View style={styles.balanceRow}>
                        <Ionicons name="ellipse" size={20} color={colors.dark.accent} />
                        <Text style={styles.balanceAmount}>
                            {balance.toLocaleString()}
                        </Text>
                    </View>
                </View>

                {canClaimDailyBonus && (
                    <TouchableOpacity style={styles.bonusButton} onPress={handleClaimBonus}>
                        <Ionicons name="gift" size={20} color="#fff" />
                        <Text style={styles.bonusButtonText}>Claim Bonus</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Filters */}
            <View style={styles.filters}>
                {(['all', 'micro', 'low', 'mid', 'high'] as const).map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterButton, filter === f && styles.filterButtonActive]}
                        onPress={() => setFilter(f)}
                    >
                        <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Table List */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.dark.primary} />
                </View>
            ) : (
                <FlatList
                    data={filteredTables}
                    renderItem={renderTable}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={handleRefresh}
                            tintColor={colors.dark.primary}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="search" size={48} color={colors.dark.textMuted} />
                            <Text style={styles.emptyText}>No tables found</Text>
                        </View>
                    }
                />
            )}

            {/* Create Table FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => router.push('/create-table')}
            >
                <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.lg,
        backgroundColor: colors.dark.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.dark.border,
    },
    balanceContainer: {},
    balanceLabel: {
        fontSize: fontSize.sm,
        color: colors.dark.textSecondary,
        marginBottom: spacing.xs,
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    balanceAmount: {
        fontSize: fontSize['2xl'],
        fontWeight: '700',
        color: colors.dark.accent,
    },
    bonusButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.dark.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
    },
    bonusButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: fontSize.sm,
    },
    filters: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
    },
    filterButton: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        backgroundColor: colors.dark.surface,
    },
    filterButtonActive: {
        backgroundColor: colors.dark.primary,
    },
    filterText: {
        fontSize: fontSize.sm,
        color: colors.dark.textSecondary,
    },
    filterTextActive: {
        color: '#fff',
        fontWeight: '600',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: spacing.md,
        gap: spacing.md,
    },
    tableCard: {
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.dark.border,
        ...shadows.sm,
    },
    tableHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    tableName: {
        fontSize: fontSize.lg,
        fontWeight: '600',
        color: colors.dark.text,
    },
    waitingBadge: {
        backgroundColor: colors.dark.warning + '30',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
    },
    waitingText: {
        fontSize: fontSize.xs,
        color: colors.dark.warning,
        fontWeight: '600',
    },
    tableInfo: {
        flexDirection: 'row',
        gap: spacing.lg,
        marginBottom: spacing.md,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    infoText: {
        fontSize: fontSize.sm,
        color: colors.dark.textSecondary,
    },
    joinButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.dark.border,
    },
    joinButtonText: {
        fontSize: fontSize.base,
        fontWeight: '600',
        color: colors.dark.primary,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xxl,
    },
    emptyText: {
        fontSize: fontSize.base,
        color: colors.dark.textMuted,
        marginTop: spacing.md,
    },
    fab: {
        position: 'absolute',
        bottom: spacing.xl,
        right: spacing.xl,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.dark.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.lg,
    },
});
