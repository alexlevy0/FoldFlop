import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity } from 'react-native';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../styles/theme';
import { Card as CardComponent } from './Card';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Card {
    rank: string;
    suit: string;
}

interface Winner {
    playerId: string;
    playerName: string;
    amount: number;
    hand?: {
        rank: string;
        cards: string[]; // e.g. ["Ah", "Ks", ...]
        description: string;
    } | null;
}

interface ShowdownOverlayProps {
    winners: Winner[];
    communityCards: string[];
    onComplete: () => void;
    isVisible: boolean;
}

export function ShowdownOverlay({ winners, communityCards, onComplete, isVisible }: ShowdownOverlayProps) {
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        if (isVisible) {
            // Animate In
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    useNativeDriver: true,
                })
            ]).start();

            // Auto-dismiss after 10 seconds
            const timer = setTimeout(() => {
                handleDismiss();
            }, 10000);

            return () => clearTimeout(timer);
        } else {
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.8);
        }
    }, [isVisible]);

    const handleDismiss = () => {
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) onComplete();
        });
    };

    if (!isVisible) return null;

    const mainWinner = winners[0]; // Focus on primary winner for now

    // Parse hand description if available, otherwise generic
    const winningHandText = mainWinner.hand?.description || "Winner!";

    return (
        <View style={styles.overlayContainer} pointerEvents="box-none">
            {/* Dark Backdrop */}
            <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />

            {/* Main Content */}
            <Animated.View style={[
                styles.contentContainer,
                {
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }],
                    marginTop: insets.top + 40
                }
            ]}>

                {/* Winner Title */}
                <View style={styles.headerContainer}>
                    <Text style={styles.winnerText}>🏆 {mainWinner.playerName}</Text>
                    <Text style={styles.amountText}>+ {mainWinner.amount.toLocaleString()}</Text>
                </View>

                {/* Hand Description */}
                <View style={styles.handResultContainer}>
                    <Text style={styles.handRankText}>{winningHandText}</Text>
                </View>

                {/* Winning Cards (if available) */}
                {/* We map the raw strings to components */}
                {mainWinner.hand?.cards && (
                    <View style={styles.cardsContainer}>
                        {mainWinner.hand.cards.map((card, i) => (
                            <CardComponent key={i} card={card} size="md" />
                        ))}
                    </View>
                )}

                {/* Dismiss Button (for impatient users) */}
                <TouchableOpacity onPress={handleDismiss} style={styles.dismissButton}>
                    <Text style={styles.dismissText}>Next Hand ›</Text>
                </TouchableOpacity>

            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2000, // Top of everything
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    contentContainer: {
        width: SCREEN_WIDTH * 0.9,
        backgroundColor: colors.dark.surfaceElevated,
        borderRadius: borderRadius.xl,
        padding: spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.dark.accent,
        ...shadows.lg,
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    winnerText: {
        color: colors.dark.accent,
        fontSize: 32,
        fontWeight: '800',
        textShadowColor: 'rgba(255, 215, 0, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    amountText: {
        color: colors.dark.text,
        fontSize: 24,
        fontWeight: '700',
        marginTop: spacing.xs,
    },
    handResultContainer: {
        marginBottom: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: borderRadius.full,
    },
    handRankText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.lg,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    cardsContainer: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.sm,
        marginBottom: spacing.xl,
    },
    dismissButton: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xl,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        borderRadius: borderRadius.full,
    },
    dismissText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: fontSize.sm,
    },
});
