/**
 * Login Screen
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing, fontSize, borderRadius } from '../../src/styles/theme';

export default function LoginScreen() {
    const { signIn, signInWithGoogle, signInWithApple } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    async function handleLogin() {
        if (!email || !password) {
            setError('Please fill in all fields');
            return;
        }

        setIsLoading(true);
        setError('');

        const result = await signIn(email, password);

        if (result.error) {
            setError(result.error);
            setIsLoading(false);
        } else {
            router.replace('/(main)/lobby');
        }
    }

    async function handleGoogleLogin() {
        const result = await signInWithGoogle();
        if (result.error) {
            setError(result.error);
        }
    }

    async function handleAppleLogin() {
        const result = await signInWithApple();
        if (result.error) {
            setError(result.error);
        }
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={styles.content}>
                {/* Logo */}
                <View style={styles.logoContainer}>
                    <Text style={styles.logo}>🃏</Text>
                    <Text style={styles.title}>FoldFlop</Text>
                    <Text style={styles.subtitle}>AI-Powered Poker</Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    {error ? (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor={colors.dark.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor={colors.dark.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="password"
                    />

                    <TouchableOpacity
                        style={[styles.button, styles.primaryButton]}
                        onPress={handleLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Sign In</Text>
                        )}
                    </TouchableOpacity>

                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    <TouchableOpacity
                        style={[styles.button, styles.socialButton]}
                        onPress={handleGoogleLogin}
                    >
                        <Text style={styles.socialButtonText}>Continue with Google</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.socialButton]}
                        onPress={handleAppleLogin}
                    >
                        <Text style={styles.socialButtonText}>Continue with Apple</Text>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <Link href="/(auth)/signup" asChild>
                            <TouchableOpacity>
                                <Text style={styles.link}>Sign Up</Text>
                            </TouchableOpacity>
                        </Link>
                    </View>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: spacing.lg,
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: spacing.xxl,
    },
    logo: {
        fontSize: 64,
        marginBottom: spacing.sm,
    },
    title: {
        fontSize: fontSize['3xl'],
        fontWeight: '700',
        color: colors.dark.text,
        marginBottom: spacing.xs,
    },
    subtitle: {
        fontSize: fontSize.lg,
        color: colors.dark.textSecondary,
    },
    form: {
        gap: spacing.md,
    },
    errorContainer: {
        backgroundColor: colors.dark.error + '20',
        padding: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.dark.error,
    },
    errorText: {
        color: colors.dark.error,
        fontSize: fontSize.sm,
        textAlign: 'center',
    },
    input: {
        backgroundColor: colors.dark.surface,
        borderWidth: 1,
        borderColor: colors.dark.border,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        fontSize: fontSize.base,
        color: colors.dark.text,
    },
    button: {
        padding: spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
    },
    primaryButton: {
        backgroundColor: colors.dark.primary,
    },
    buttonText: {
        color: '#fff',
        fontSize: fontSize.base,
        fontWeight: '600',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: spacing.sm,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.dark.border,
    },
    dividerText: {
        color: colors.dark.textMuted,
        paddingHorizontal: spacing.md,
        fontSize: fontSize.sm,
    },
    socialButton: {
        backgroundColor: colors.dark.surface,
        borderWidth: 1,
        borderColor: colors.dark.border,
    },
    socialButtonText: {
        color: colors.dark.text,
        fontSize: fontSize.base,
        fontWeight: '500',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: spacing.lg,
    },
    footerText: {
        color: colors.dark.textSecondary,
        fontSize: fontSize.sm,
    },
    link: {
        color: colors.dark.primary,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
});
