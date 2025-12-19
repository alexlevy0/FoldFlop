/**
 * Index route - redirects based on auth state
 */

import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../src/providers/AuthProvider';
import { colors } from '../src/styles/theme';

export default function Index() {
    const { isLoading, isAuthenticated } = useAuth();

    if (isLoading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={colors.dark.primary} />
            </View>
        );
    }

    if (isAuthenticated) {
        return <Redirect href="/(main)/lobby" />;
    }

    return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.dark.background,
    },
});
