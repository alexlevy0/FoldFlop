/**
 * Turn Timer Component
 * Countdown timer with progress bar
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../../styles/theme';

interface TurnTimerProps {
    totalTime: number; // In milliseconds
    startTime: number; // Timestamp when turn started
    onTimeout?: () => void;
    isActive: boolean;
}

export function TurnTimer({ totalTime, startTime, onTimeout, isActive }: TurnTimerProps) {
    const [remaining, setRemaining] = useState(totalTime);
    const progressAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!isActive) {
            setRemaining(totalTime);
            progressAnim.setValue(1);
            return;
        }

        const endTime = startTime + totalTime;

        const interval = setInterval(() => {
            const now = Date.now();
            const timeLeft = Math.max(0, endTime - now);
            setRemaining(timeLeft);

            if (timeLeft <= 0) {
                clearInterval(interval);
                onTimeout?.();
            }
        }, 100);

        // Animate progress bar
        Animated.timing(progressAnim, {
            toValue: 0,
            duration: totalTime,
            useNativeDriver: false,
        }).start();

        return () => clearInterval(interval);
    }, [isActive, startTime, totalTime, onTimeout, progressAnim]);

    const seconds = Math.ceil(remaining / 1000);
    const progress = remaining / totalTime;

    // Color changes based on time remaining
    const getColor = () => {
        if (progress > 0.5) return colors.dark.success;
        if (progress > 0.25) return colors.dark.warning;
        return colors.dark.error;
    };

    if (!isActive) return null;

    return (
        <View style={styles.container}>
            {/* Timer text */}
            <Text style={[styles.timerText, { color: getColor() }]}>
                {seconds}s
            </Text>

            {/* Progress bar */}
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
        alignItems: 'center',
        minWidth: 60,
    },
    timerText: {
        fontSize: fontSize.lg,
        fontWeight: '700',
        marginBottom: spacing.xs,
    },
    progressContainer: {
        width: '100%',
        height: 4,
        backgroundColor: colors.dark.surfaceElevated,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 2,
    },
});
