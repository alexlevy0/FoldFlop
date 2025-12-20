/**
 * Action Buttons Component
 * Fold/Check/Call/Raise buttons with slider
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, spacing, fontSize, borderRadius } from '../../styles/theme';

interface ActionButtonsProps {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    canBet: boolean;
    canRaise: boolean;
    callAmount: number;
    minBet: number;
    maxBet: number;
    minRaise: number;
    maxRaise: number;
    pot: number;
    suggestedAction?: string;
    suggestedAmount?: number;
    onAction: (action: string, amount?: number) => void;
    disabled?: boolean;
}

export function ActionButtons({
    canFold,
    canCheck,
    canCall,
    canBet,
    canRaise,
    callAmount,
    minBet,
    maxBet,
    minRaise,
    maxRaise,
    pot,
    suggestedAction,
    suggestedAmount,
    onAction,
    disabled = false,
}: ActionButtonsProps) {
    const [raiseAmount, setRaiseAmount] = useState(minRaise);
    const [showSlider, setShowSlider] = useState(false);

    const handleFold = () => onAction('fold');
    const handleCheck = () => onAction('check');
    const handleCall = () => onAction('call');

    const handleBetOrRaise = () => {
        if (showSlider) {
            onAction(canBet ? 'bet' : 'raise', raiseAmount);
            setShowSlider(false);
        } else {
            setShowSlider(true);
        }
    };

    const handleQuickBet = (multiplier: number) => {
        const amount = Math.round(pot * multiplier);
        const finalAmount = Math.min(Math.max(amount, minRaise), maxRaise);
        setRaiseAmount(finalAmount);
    };

    const handleAllIn = () => {
        // Send 'all_in' instead of 'raise' to avoid minRaise validation issues for short stacks
        onAction('all_in', maxRaise);
        setShowSlider(false);
    };

    const isSuggested = (action: string) => suggestedAction === action;

    return (
        <View style={styles.container}>
            {/* AI Suggestion Banner */}
            {suggestedAction && (
                <View style={styles.suggestionBanner}>
                    <Text style={styles.suggestionText}>
                        AI suggests: {suggestedAction.toUpperCase()}
                        {suggestedAmount ? ` to ${suggestedAmount.toLocaleString()}` : ''}
                    </Text>
                </View>
            )}

            {/* Raise Slider */}
            {showSlider && (canBet || canRaise) && (
                <View style={styles.sliderContainer}>
                    <View style={styles.sliderHeader}>
                        <Text style={styles.sliderLabel}>
                            {canBet ? 'Bet' : 'Raise'}: {raiseAmount.toLocaleString()}
                        </Text>
                        <View style={styles.quickBets}>
                            <TouchableOpacity style={styles.quickBetButton} onPress={() => handleQuickBet(0.33)}>
                                <Text style={styles.quickBetText}>⅓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.quickBetButton} onPress={() => handleQuickBet(0.5)}>
                                <Text style={styles.quickBetText}>½</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.quickBetButton} onPress={() => handleQuickBet(0.75)}>
                                <Text style={styles.quickBetText}>¾</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.quickBetButton} onPress={() => handleQuickBet(1)}>
                                <Text style={styles.quickBetText}>Pot</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Slider
                        style={styles.slider}
                        minimumValue={minRaise}
                        maximumValue={maxRaise}
                        value={raiseAmount}
                        onValueChange={val => setRaiseAmount(Math.round(val))}
                        minimumTrackTintColor={colors.dark.primary}
                        maximumTrackTintColor={colors.dark.border}
                        thumbTintColor={colors.dark.primary}
                    />
                    <View style={styles.sliderLabels}>
                        <Text style={styles.sliderMinMax}>{minRaise.toLocaleString()}</Text>
                        <Text style={styles.sliderMinMax}>{maxRaise.toLocaleString()}</Text>
                    </View>
                </View>
            )}

            {/* Action Buttons - Always show all 4, disabled when not available */}
            <View style={styles.buttons}>
                {/* Fold */}
                <TouchableOpacity
                    style={[
                        styles.button,
                        styles.foldButton,
                        !canFold && styles.buttonDisabled,
                        isSuggested('fold') && canFold && styles.buttonSuggested,
                    ]}
                    onPress={handleFold}
                    disabled={disabled || !canFold}
                >
                    <Text style={[styles.buttonText, !canFold && styles.buttonTextDisabled]}>Fold</Text>
                </TouchableOpacity>

                {/* Check / Call - Always show one or the other */}
                <TouchableOpacity
                    style={[
                        styles.button,
                        canCheck ? styles.checkButton : styles.callButton,
                        !canCheck && !canCall && styles.buttonDisabled,
                        ((isSuggested('check') && canCheck) || (isSuggested('call') && canCall)) && styles.buttonSuggested,
                    ]}
                    onPress={canCheck ? handleCheck : handleCall}
                    disabled={disabled || (!canCheck && !canCall)}
                >
                    <Text style={[styles.buttonText, !canCheck && !canCall && styles.buttonTextDisabled]}>
                        {canCheck ? 'Check' : 'Call'}
                    </Text>
                    {canCall && callAmount > 0 && (
                        <Text style={[styles.buttonAmount, !canCall && styles.buttonTextDisabled]}>
                            {callAmount.toLocaleString()}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Bet / Raise */}
                <TouchableOpacity
                    style={[
                        styles.button,
                        styles.raiseButton,
                        !canBet && !canRaise && styles.buttonDisabled,
                        isSuggested('raise') && (canBet || canRaise) && styles.buttonSuggested,
                        showSlider && styles.buttonActive,
                    ]}
                    onPress={handleBetOrRaise}
                    disabled={disabled || (!canBet && !canRaise)}
                >
                    <Text style={[styles.buttonText, !canBet && !canRaise && styles.buttonTextDisabled]}>
                        {showSlider ? 'Confirm' : canBet ? 'Bet' : 'Raise'}
                    </Text>
                    {showSlider && (
                        <Text style={styles.buttonAmount}>{raiseAmount.toLocaleString()}</Text>
                    )}
                </TouchableOpacity>

                {/* All-In */}
                <TouchableOpacity
                    style={[
                        styles.button,
                        styles.allInButton,
                        !canBet && !canRaise && styles.buttonDisabled,
                    ]}
                    onPress={handleAllIn}
                    disabled={disabled || (!canBet && !canRaise)}
                >
                    <Text style={[styles.buttonTextAllIn, !canBet && !canRaise && styles.buttonTextDisabled]}>
                        All-In
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.lg,
    },
    suggestionBanner: {
        backgroundColor: colors.dark.primary + '20',
        borderWidth: 1,
        borderColor: colors.dark.primary,
        borderRadius: borderRadius.md,
        padding: spacing.sm,
        marginBottom: spacing.sm,
        alignItems: 'center',
    },
    suggestionText: {
        color: colors.dark.primary,
        fontWeight: '600',
        fontSize: fontSize.sm,
    },
    sliderContainer: {
        backgroundColor: colors.dark.surface,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    sliderLabel: {
        color: colors.dark.text,
        fontSize: fontSize.lg,
        fontWeight: '600',
    },
    quickBets: {
        flexDirection: 'row',
        gap: spacing.xs,
    },
    quickBetButton: {
        backgroundColor: colors.dark.surfaceElevated,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
    },
    quickBetText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
        fontWeight: '600',
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    sliderMinMax: {
        color: colors.dark.textMuted,
        fontSize: fontSize.xs,
    },
    buttons: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    button: {
        flex: 1,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 56,
    },
    buttonSuggested: {
        borderWidth: 2,
        borderColor: colors.dark.primary,
    },
    buttonActive: {
        backgroundColor: colors.dark.primary,
    },
    foldButton: {
        backgroundColor: colors.dark.error + '30',
    },
    checkButton: {
        backgroundColor: colors.dark.surfaceElevated,
    },
    callButton: {
        backgroundColor: colors.dark.success + '30',
    },
    raiseButton: {
        backgroundColor: colors.dark.primary + '30',
    },
    allInButton: {
        backgroundColor: colors.dark.accent,
        flex: 0.8,
    },
    buttonText: {
        color: colors.dark.text,
        fontWeight: '600',
        fontSize: fontSize.base,
    },
    buttonTextAllIn: {
        color: '#000',
        fontWeight: '700',
        fontSize: fontSize.sm,
    },
    buttonAmount: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.xs,
        marginTop: 2,
    },
    buttonDisabled: {
        backgroundColor: colors.dark.surface,
        opacity: 0.5,
    },
    buttonTextDisabled: {
        color: colors.dark.textMuted,
    },
});
