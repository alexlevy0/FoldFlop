/**
 * Root layout with providers
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { AuthProvider } from '../src/providers/AuthProvider';
import { SocketProvider } from '../src/providers/SocketProvider';
import { GameProvider } from '../src/providers/GameProvider';
import { MultiTableProvider } from '../src/providers/MultiTableProvider';
import { colors } from '../src/styles/theme';

export default function RootLayout() {
    return (
        <AuthProvider>
            <SocketProvider>
                <GameProvider>
                    <MultiTableProvider>
                        <View style={styles.container}>
                            <StatusBar style="light" />
                            <Stack
                                screenOptions={{
                                    headerStyle: {
                                        backgroundColor: colors.dark.surface,
                                    },
                                    headerTintColor: colors.dark.text,
                                    headerTitleStyle: {
                                        fontWeight: '600',
                                    },
                                    contentStyle: {
                                        backgroundColor: colors.dark.background,
                                    },
                                }}
                            >
                                <Stack.Screen
                                    name="index"
                                    options={{ headerShown: false }}
                                />
                                <Stack.Screen
                                    name="(auth)"
                                    options={{ headerShown: false }}
                                />
                                <Stack.Screen
                                    name="(main)"
                                    options={{ headerShown: false }}
                                />
                            </Stack>
                        </View>
                    </MultiTableProvider>
                </GameProvider>
            </SocketProvider>
        </AuthProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.dark.background,
    },
});
