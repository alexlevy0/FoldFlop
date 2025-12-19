/**
 * Auth layout
 */

import { Stack } from 'expo-router';
import { colors } from '../../src/styles/theme';

export default function AuthLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: {
                    backgroundColor: colors.dark.background,
                },
            }}
        >
            <Stack.Screen name="login" />
            <Stack.Screen name="signup" />
        </Stack>
    );
}
