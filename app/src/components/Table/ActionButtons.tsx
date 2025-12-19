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
        onAction('raise', maxRaise);
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

            {/* Action Buttons */}
            <View style={styles.buttons}>
                {/* Fold */}
                <TouchableOpacity
                    style={[
                        styles.button,
                        styles.foldButton,
                        isSuggested('fold') && styles.buttonSuggested,
                    ]}
                    onPress={handleFold}
                    disabled={disabled || !canFold}
                >
                    <Text style={styles.buttonText}>Fold</Text>
                </TouchableOpacity>

                {/* Check / Call */}
                {canCheck ? (
                    <TouchableOpacity
                        style={[
                            styles.button,
                            styles.checkButton,
                            isSuggested('check') && styles.buttonSuggested,
                        ]}
                        onPress={handleCheck}
                        disabled={disabled}
                    >
                        <Text style={styles.buttonText}>Check</Text>
                    </TouchableOpacity>
                ) : canCall ? (
                    <TouchableOpacity
                        style={[
                            styles.button,
                            styles.callButton,
                            isSuggested('call') && styles.buttonSuggested,
                        ]}
                        onPress={handleCall}
                        disabled={disabled}
                    >
                        <Text style={styles.buttonText}>Call</Text>
                        <Text style={styles.buttonAmount}>{callAmount.toLocaleString()}</Text>
                    </TouchableOpacity>
                ) : null}

                {/* Bet / Raise */}
                {(canBet || canRaise) && (
                    <TouchableOpacity
                        style={[
                            styles.button,
                            styles.raiseButton,
                            isSuggested('raise') && styles.buttonSuggested,
                            showSlider && styles.buttonActive,
                        ]}
                        onPress={handleBetOrRaise}
                        disabled={disabled}
                    >
                        <Text style={styles.buttonText}>
                            {showSlider ? 'Confirm' : canBet ? 'Bet' : 'Raise'}
                        </Text>
                        {showSlider && (
                            <Text style={styles.buttonAmount}>{raiseAmount.toLocaleString()}</Text>
                        )}
                    </TouchableOpacity>
                )}

                {/* All-In */}
                {(canBet || canRaise) && (
                    <TouchableOpacity
                        style={[styles.button, styles.allInButton]}
                        onPress={handleAllIn}
                        disabled={disabled}
                    >
                        <Text style={styles.buttonTextAllIn}>All-In</Text>
                    </TouchableOpacity>
                )}
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
});
