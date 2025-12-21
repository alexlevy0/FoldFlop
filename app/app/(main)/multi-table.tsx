/**
 * Multi-Table Dashboard Screen
 * Displays up to 6 poker tables in a responsive grid layout
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert,
    Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmbeddedTableView } from '../../src/components/Table/EmbeddedTableView';
import { useMultiTable, MAX_TABLES } from '../../src/providers/MultiTableProvider';
import { useAuth } from '../../src/providers/AuthProvider';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isDesktop = SCREEN_WIDTH > 768;
const GRID_COLS = isDesktop ? 3 : 2;

export default function MultiTableScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const {
        activeTables,
        focusedTableId,
        canJoinMore,
        addTable,
        removeTable,
        updateTable,
        setFocusedTable,
        tablesWithTurn,
    } = useMultiTable();

    const [showJoinModal, setShowJoinModal] = useState(false);
    const [availableTables, setAvailableTables] = useState<any[]>([]);

    // Fetch available tables
    const fetchTables = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('tables')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (!error && data) {
                // Filter out tables already joined
                const joinedIds = activeTables.map(t => t.id);
                setAvailableTables(data.filter((t: any) => !joinedIds.includes(t.id)));
            }
        } catch (err) {
            console.error('[MultiTable] Error fetching tables:', err);
        }
    }, [activeTables]);

    // Auto-load all tables the user is already seated at on mount
    useEffect(() => {
        const loadExistingTables = async () => {
            if (!user?.id) return;

            try {
                // Get all tables where user is seated
                const { data: myTables, error } = await supabase
                    .from('table_players')
                    .select('table_id')
                    .eq('user_id', user.id);

                if (!error && myTables) {
                    console.log('[MultiTable] Found existing tables:', myTables);
                    // Add each table to multi-table state
                    myTables.forEach((t: any) => {
                        addTable(t.table_id);
                    });
                }
            } catch (err) {
                console.error('[MultiTable] Error loading existing tables:', err);
            }
        };

        loadExistingTables();
    }, [user?.id]); // Only run on mount or user change

    useEffect(() => {
        if (showJoinModal) {
            fetchTables();
        }
    }, [showJoinModal, fetchTables]);

    const handleJoinTable = useCallback(async (tableId: string, tableInfo?: any) => {
        if (!canJoinMore) {
            Alert.alert('Limit Reached', `Maximum ${MAX_TABLES} tables allowed`);
            return;
        }

        try {
            // Query table_players directly for accurate seat data
            const { data: tablePlayers, error: playersError } = await supabase
                .from('table_players')
                .select('seat, user_id')
                .eq('table_id', tableId);

            console.log('[MultiTable] table_players data:', tablePlayers, playersError);

            // Check if user is already at this table
            const isAlreadySeated = tablePlayers?.some((p: any) => p.user_id === user?.id);
            if (isAlreadySeated) {
                Alert.alert('Already Seated', 'You are already at this table');
                addTable(tableId); // Still add to local state
                setShowJoinModal(false);
                return;
            }

            // Find first available seat (0-5)
            const occupiedSeats = new Set((tablePlayers || []).map((p: any) => p.seat));
            console.log('[MultiTable] Occupied seats:', [...occupiedSeats]);

            let seatIndex = -1;
            for (let i = 0; i < 6; i++) {
                if (!occupiedSeats.has(i)) {
                    seatIndex = i;
                    break;
                }
            }
            console.log('[MultiTable] Selected seat:', seatIndex);

            if (seatIndex === -1) {
                Alert.alert('Table Full', 'No seats available at this table');
                return;
            }

            // Get buy-in amount (100 big blinds default)
            const bigBlind = tableInfo?.big_blind || 10;
            const buyIn = bigBlind * 100;

            // Join the table via API
            const { error } = await supabase.functions.invoke('join-table', {
                body: { tableId, seatIndex, buyIn },
            });

            if (error) {
                Alert.alert('Error', 'Failed to join table');
                return;
            }

            addTable(tableId);
            setShowJoinModal(false);
        } catch (err) {
            console.error('[MultiTable] Join error:', err);
            Alert.alert('Error', 'Failed to join table');
        }
    }, [canJoinMore, addTable]);

    const handleLeaveTable = useCallback(async (tableId: string) => {
        try {
            await supabase.functions.invoke('leave-table', {
                body: { tableId },
            });
            removeTable(tableId);
        } catch (err) {
            console.error('[MultiTable] Leave error:', err);
        }
    }, [removeTable]);

    const handleTableUpdate = useCallback((tableId: string, data: any) => {
        updateTable(tableId, data);
    }, [updateTable]);

    const handleTableAction = useCallback((tableId: string, action: string, amount?: number) => {
        // Actions are handled inside TableInstance
    }, []);

    const openFullTable = useCallback((tableId: string) => {
        // Navigate to full table view
        router.push(`/table/${tableId}`);
    }, [router]);

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: `Multi-Table (${activeTables.length}/${MAX_TABLES})`,
                    headerRight: () => (
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => setShowJoinModal(true)}
                            disabled={!canJoinMore}
                        >
                            <Text style={[styles.addButtonText, !canJoinMore && styles.disabled]}>
                                + Join
                            </Text>
                        </TouchableOpacity>
                    ),
                }}
            />

            {/* Turn Banner */}
            {tablesWithTurn.length > 0 && (
                <View style={styles.turnBanner}>
                    <Text style={styles.turnBannerText}>
                        🔔 Your turn at {tablesWithTurn.length} table(s)!
                    </Text>
                </View>
            )}

            {/* Empty State */}
            {activeTables.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No Active Tables</Text>
                    <Text style={styles.emptySubtitle}>
                        Join up to {MAX_TABLES} tables to play simultaneously
                    </Text>
                    <TouchableOpacity
                        style={styles.joinButton}
                        onPress={() => setShowJoinModal(true)}
                    >
                        <Text style={styles.joinButtonText}>Join Table</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                /* Grid of Tables */
                <ScrollView
                    contentContainerStyle={styles.grid}
                    showsVerticalScrollIndicator={false}
                >
                    {activeTables.map((table) => (
                        <View key={table.id} style={styles.tableWrapper}>
                            <EmbeddedTableView
                                tableId={table.id}
                                isFocused={focusedTableId === table.id}
                                onPress={() => setFocusedTable(table.id)}
                                onLeave={() => handleLeaveTable(table.id)}
                            />
                        </View>
                    ))}
                </ScrollView>
            )}

            {/* Join Table Modal */}
            <Modal
                visible={showJoinModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowJoinModal(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Join a Table</Text>

                        <ScrollView style={styles.tableList}>
                            {availableTables.map((table) => (
                                <TouchableOpacity
                                    key={table.id}
                                    style={styles.tableItem}
                                    onPress={() => handleJoinTable(table.id)}
                                >
                                    <Text style={styles.tableItemName}>
                                        {table.name || `Table ${table.id.slice(0, 6)}`}
                                    </Text>
                                    <Text style={styles.tableItemInfo}>
                                        {table.small_blind}/{table.big_blind} • 6 max
                                    </Text>
                                </TouchableOpacity>
                            ))}
                            {availableTables.length === 0 && (
                                <Text style={styles.noTables}>No tables available</Text>
                            )}
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={() => setShowJoinModal(false)}
                        >
                            <Text style={styles.closeBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    addButton: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    addButtonText: {
        color: colors.dark.primary,
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    disabled: {
        color: colors.dark.textSecondary,
    },
    turnBanner: {
        backgroundColor: colors.dark.success,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
    },
    turnBannerText: {
        color: '#fff',
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    emptyTitle: {
        color: colors.dark.text,
        fontSize: fontSize.xl,
        fontWeight: '700',
        marginBottom: spacing.sm,
    },
    emptySubtitle: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.base,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    joinButton: {
        backgroundColor: colors.dark.primary,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.lg,
    },
    joinButtonText: {
        color: '#fff',
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: spacing.sm,
        gap: spacing.sm,
    },
    tableWrapper: {
        marginBottom: spacing.sm,
    },
    loadingTable: {
        width: (SCREEN_WIDTH - (GRID_COLS + 1) * spacing.sm) / GRID_COLS,
        height: ((SCREEN_WIDTH - (GRID_COLS + 1) * spacing.sm) / GRID_COLS) * 0.75,
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
    },
    tableActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
        gap: spacing.xs,
    },
    expandBtn: {
        flex: 1,
        backgroundColor: colors.dark.primaryHover,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
        alignItems: 'center',
    },
    expandBtnText: {
        color: colors.dark.text,
        fontSize: fontSize.xs,
        fontWeight: '500',
    },
    leaveBtn: {
        flex: 1,
        backgroundColor: colors.dark.error,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
        alignItems: 'center',
    },
    leaveBtnText: {
        color: '#fff',
        fontSize: fontSize.xs,
        fontWeight: '500',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        maxHeight: '70%',
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
    },
    modalTitle: {
        color: colors.dark.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
        marginBottom: spacing.md,
    },
    tableList: {
        maxHeight: 300,
    },
    tableItem: {
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.dark.border,
    },
    tableItemName: {
        color: colors.dark.text,
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    tableItemInfo: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
        marginTop: 2,
    },
    noTables: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.base,
        textAlign: 'center',
        paddingVertical: spacing.lg,
    },
    closeBtn: {
        marginTop: spacing.md,
        paddingVertical: spacing.md,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.dark.border,
    },
    closeBtnText: {
        color: colors.dark.primary,
        fontSize: fontSize.base,
        fontWeight: '600',
    },
});
