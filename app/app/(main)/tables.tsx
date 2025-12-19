/**
 * Tables Screen - Multi-table manager
 */

import React from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '../../src/providers/GameProvider';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/styles/theme';

export default function TablesScreen() {
    const { state, setActiveTable } = useGame();
    const tables = Array.from(state.tables.entries());

    const handleTablePress = (tableId: string) => {
        setActiveTable(tableId);
        router.push(`/table/${tableId}`);
    };

    const renderTable = ({ item }: { item: [string, any] }) => {
        const [tableId, tableState] = item;
        const isMyTurn = tableState.isMyTurn;

        return (
            <TouchableOpacity
                style={[styles.tableCard, isMyTurn && styles.tableCardActive]}
                onPress={() => handleTablePress(tableId)}
            >
                <View style={styles.tableHeader}>
                    <Text style={styles.tableName}>{tableState.table?.name ?? 'Table'}</Text>
                    {isMyTurn && (
                        <View style={styles.turnIndicator}>
                            <Text style={styles.turnText}>Your Turn!</Text>
                        </View>
                    )}
                </View>

                <View style={styles.tableInfo}>
                    <Text style={styles.infoText}>
                        Phase: {tableState.game?.phase ?? 'waiting'}
                    </Text>
                    <Text style={styles.infoText}>
                        Pot: {tableState.game?.pot?.toLocaleString() ?? 0}
                    </Text>
                </View>

                {tableState.myCards?.length === 2 && (
                    <View style={styles.cardsRow}>
                        <Text style={styles.cardText}>{tableState.myCards[0]}</Text>
                        <Text style={styles.cardText}>{tableState.myCards[1]}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {tables.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="layers-outline" size={64} color={colors.dark.textMuted} />
                    <Text style={styles.emptyTitle}>No Active Tables</Text>
                    <Text style={styles.emptyText}>
                        Join a table from the Lobby to start playing
                    </Text>
                    <TouchableOpacity
                        style={styles.lobbyButton}
                        onPress={() => router.push('/(main)/lobby')}
                    >
                        <Text style={styles.lobbyButtonText}>Go to Lobby</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={tables}
                    renderItem={renderTable}
                    keyExtractor={item => item[0]}
                    contentContainerStyle={styles.listContent}
                    numColumns={2}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    listContent: {
        padding: spacing.md,
        gap: spacing.md,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    emptyTitle: {
        fontSize: fontSize.xl,
        fontWeight: '600',
        color: colors.dark.text,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    emptyText: {
        fontSize: fontSize.base,
        color: colors.dark.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    lobbyButton: {
        backgroundColor: colors.dark.primary,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
    },
    lobbyButtonText: {
        color: '#fff',
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    tableCard: {
        flex: 1,
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        margin: spacing.xs,
        borderWidth: 2,
        borderColor: colors.dark.border,
        ...shadows.sm,
    },
    tableCardActive: {
        borderColor: colors.dark.primary,
        backgroundColor: colors.dark.primary + '10',
    },
    tableHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    tableName: {
        fontSize: fontSize.sm,
        fontWeight: '600',
        color: colors.dark.text,
    },
    turnIndicator: {
        backgroundColor: colors.dark.primary,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
    },
    turnText: {
        fontSize: fontSize.xs,
        fontWeight: '600',
        color: '#fff',
    },
    tableInfo: {
        gap: spacing.xs,
        marginBottom: spacing.sm,
    },
    infoText: {
        fontSize: fontSize.xs,
        color: colors.dark.textSecondary,
    },
    cardsRow: {
        flexDirection: 'row',
        gap: spacing.xs,
    },
    cardText: {
        backgroundColor: colors.dark.cardWhite,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
        fontSize: fontSize.sm,
        fontWeight: '600',
        color: '#000',
    },
});
