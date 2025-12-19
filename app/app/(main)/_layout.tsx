/**
 * Main app layout with tabs
 */

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/styles/theme';

export default function MainLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarStyle: {
                    backgroundColor: colors.dark.surface,
                    borderTopColor: colors.dark.border,
                },
                tabBarActiveTintColor: colors.dark.primary,
                tabBarInactiveTintColor: colors.dark.textMuted,
                headerStyle: {
                    backgroundColor: colors.dark.surface,
                },
                headerTintColor: colors.dark.text,
            }}
        >
            <Tabs.Screen
                name="lobby"
                options={{
                    title: 'Lobby',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="grid-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="tables"
                options={{
                    title: 'My Tables',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="layers-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="person-outline" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
