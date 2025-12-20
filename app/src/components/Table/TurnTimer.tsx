/**
 * Turn Timer Component
 * Countdown timer with progress bar
 */


import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ViewStyle } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../../styles/theme';

interface TurnTimerProps {
    totalTime: number; // In milliseconds
    startTime: number; // Timestamp when turn started
    onTimeout?: () => void;
    isActive: boolean;
    style?: ViewStyle;
}

export function TurnTimer({ totalTime, startTime, onTimeout, isActive, style }: TurnTimerProps) {
    // Safety check for invalid inputs to prevent NaNs
    const safeTotalTime = Math.max(1000, totalTime || 30000);
    const safeStartTime = startTime || Date.now();

    const [remaining, setRemaining] = useState(safeTotalTime);
    const progressAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!isActive) {
            setRemaining(safeTotalTime);
            progressAnim.setValue(1);
            return;
        }

        const endTime = safeStartTime + safeTotalTime;

        const updateTimer = () => {
            const now = Date.now();
            const timeLeft = Math.max(0, endTime - now);
            setRemaining(timeLeft);
            return timeLeft;
        };

        // Initial update
        updateTimer();

        const interval = setInterval(() => {
            const timeLeft = updateTimer();
            if (timeLeft <= 0) {
                clearInterval(interval);
                onTimeout?.();
            }
        }, 100);

        // Animate progress bar
        // We re-calculate initial value based on current remaining time to avoid jump
        const now = Date.now();
        const initialProgress = Math.max(0, Math.min(1, (endTime - now) / safeTotalTime));
        progressAnim.setValue(initialProgress);

        Animated.timing(progressAnim, {
            toValue: 0,
            duration: Math.max(0, endTime - now),
            useNativeDriver: false, // width animation doesn't support native driver
        }).start();

        return () => {
            clearInterval(interval);
            progressAnim.stopAnimation();
        };
    }, [isActive, safeStartTime, safeTotalTime, onTimeout]); // Removed progressAnim from deps to avoid re-renders

    const seconds = Math.ceil(remaining / 1000);
    const progress = Math.min(1, Math.max(0, remaining / safeTotalTime));

    // Color changes based on time remaining
    const getColor = () => {
        if (progress > 0.5) return colors.dark.success;
        if (progress > 0.25) return colors.dark.warning;
        return colors.dark.error;
    };

    if (!isActive) return null;

    return (
        <View style={[styles.container, style]}>
            {/* Timer text (Left) */}
            <Text style={[styles.timerText, { color: getColor() }]}>
                {seconds}s
            </Text>

            {/* Progress bar (Right) */}
            <View style={styles.progressContainer}>
                <Animated.View
                    style={[
                        styles.progressBar,
                        {
                            width: progressAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                            }),
                            backgroundColor: getColor(),
                        },
                    ]}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row', // Horizontal layout
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.md,
        width: '100%',
    },
    timerText: {
        fontSize: fontSize.base, // Slightly smaller text for inline
        fontWeight: '700',
        width: 40, // Fixed width for alignment
        textAlign: 'right',
    },
    progressContainer: {
        flex: 1, // Take remaining width
        height: 6, // Slightly thicker
        backgroundColor: colors.dark.surfaceElevated,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 3,
    },
});
