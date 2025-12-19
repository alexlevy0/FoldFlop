/**
 * Profile Screen
 */

import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/providers/AuthProvider';
import { useChips } from '../../src/hooks/useChips';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/styles/theme';

export default function ProfileScreen() {
    const { user, signOut } = useAuth();
    const { balance, canClaimDailyBonus, claimDailyBonus, hasClaimedWelcomeBonus, claimWelcomeBonus } = useChips();

    const handleClaimDaily = async () => {
        await claimDailyBonus();
    };

    const handleClaimWelcome = async () => {
        await claimWelcomeBonus();
    };

    return (
        <ScrollView style={styles.container}>
            {/* Profile Header */}
            <View style={styles.header}>
                <View style={styles.avatarContainer}>
                    <Ionicons name="person" size={48} color={colors.dark.textMuted} />
                </View>
                <Text style={styles.username}>{user?.email?.split('@')[0] ?? 'Player'}</Text>
                <Text style={styles.email}>{user?.email}</Text>
            </View>

            {/* Balance Card */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Chip Balance</Text>
                <View style={styles.balanceRow}>
                    <Ionicons name="ellipse" size={24} color={colors.dark.accent} />
                    <Text style={styles.balanceAmount}>{balance.toLocaleString()}</Text>
                </View>
            </View>

            {/* Bonuses */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Bonuses</Text>

                {!hasClaimedWelcomeBonus && (
                    <TouchableOpacity style={styles.bonusItem} onPress={handleClaimWelcome}>
                        <View style={styles.bonusInfo}>
                            <Ionicons name="gift" size={24} color={colors.dark.primary} />
                            <View>
                                <Text style={styles.bonusTitle}>Welcome Bonus</Text>
                                <Text style={styles.bonusAmount}>+50,000 chips</Text>
                            </View>
                        </View>
                        <View style={styles.claimButton}>
                            <Text style={styles.claimButtonText}>Claim</Text>
                        </View>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[styles.bonusItem, !canClaimDailyBonus && styles.bonusItemDisabled]}
                    onPress={handleClaimDaily}
                    disabled={!canClaimDailyBonus}
                >
                    <View style={styles.bonusInfo}>
                        <Ionicons
                            name="calendar"
                            size={24}
                            color={canClaimDailyBonus ? colors.dark.primary : colors.dark.textMuted}
                        />
                        <View>
                            <Text style={[styles.bonusTitle, !canClaimDailyBonus && styles.textMuted]}>
                                Daily Bonus
                            </Text>
                            <Text style={[styles.bonusAmount, !canClaimDailyBonus && styles.textMuted]}>
                                {canClaimDailyBonus ? '+10,000 chips' : 'Come back tomorrow!'}
                            </Text>
                        </View>
                    </View>
                    {canClaimDailyBonus && (
                        <View style={styles.claimButton}>
                            <Text style={styles.claimButtonText}>Claim</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Shop Link */}
            <TouchableOpacity style={styles.card}>
                <View style={styles.menuItem}>
                    <Ionicons name="cart" size={24} color={colors.dark.accent} />
                    <Text style={styles.menuText}>Buy Chips</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.dark.textMuted} />
                </View>
            </TouchableOpacity>

            {/* Settings */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Settings</Text>

                <TouchableOpacity style={styles.menuItem}>
                    <Ionicons name="notifications-outline" size={24} color={colors.dark.textSecondary} />
                    <Text style={styles.menuText}>Notifications</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.dark.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                    <Ionicons name="volume-medium-outline" size={24} color={colors.dark.textSecondary} />
                    <Text style={styles.menuText}>Sound</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.dark.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                    <Ionicons name="moon-outline" size={24} color={colors.dark.textSecondary} />
                    <Text style={styles.menuText}>Theme</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.dark.textMuted} />
                </TouchableOpacity>
            </View>

            {/* Sign Out */}
            <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
                <Ionicons name="log-out-outline" size={20} color={colors.dark.error} />
                <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
                <Text style={styles.footerText}>FoldFlop v1.0.0</Text>
                <Text style={styles.footerText}>Virtual chips only - No real money</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    header: {
        alignItems: 'center',
        padding: spacing.xl,
        backgroundColor: colors.dark.surface,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.dark.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    username: {
        fontSize: fontSize.xl,
        fontWeight: '600',
        color: colors.dark.text,
        marginBottom: spacing.xs,
    },
    email: {
        fontSize: fontSize.sm,
        color: colors.dark.textSecondary,
    },
    card: {
        backgroundColor: colors.dark.surface,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        ...shadows.sm,
    },
    cardTitle: {
        fontSize: fontSize.sm,
        fontWeight: '600',
        color: colors.dark.textSecondary,
        marginBottom: spacing.md,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    balanceAmount: {
        fontSize: fontSize['3xl'],
        fontWeight: '700',
        color: colors.dark.accent,
    },
    bonusItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.dark.border,
    },
    bonusItemDisabled: {
        opacity: 0.5,
    },
    bonusInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    bonusTitle: {
        fontSize: fontSize.base,
        fontWeight: '500',
        color: colors.dark.text,
    },
    bonusAmount: {
        fontSize: fontSize.sm,
        color: colors.dark.primary,
    },
    textMuted: {
        color: colors.dark.textMuted,
    },
    claimButton: {
        backgroundColor: colors.dark.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
    },
    claimButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: fontSize.sm,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
        gap: spacing.md,
    },
    menuText: {
        flex: 1,
        fontSize: fontSize.base,
        color: colors.dark.text,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginHorizontal: spacing.md,
        marginTop: spacing.xl,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.dark.error,
    },
    signOutText: {
        color: colors.dark.error,
        fontSize: fontSize.base,
        fontWeight: '500',
    },
    footer: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
        gap: spacing.xs,
    },
    footerText: {
        fontSize: fontSize.xs,
        color: colors.dark.textMuted,
    },
});
