/**
 * Design tokens and theme
 */

export const colors = {
    // Dark theme (default)
    dark: {
        background: '#0D1117',
        surface: '#161B22',
        surfaceElevated: '#1C2128',
        border: '#30363D',
        text: '#F0F6FC',
        textSecondary: '#8B949E',
        textMuted: '#6E7681',

        // Brand colors
        primary: '#22C55E', // Green poker
        primaryHover: '#16A34A',
        accent: '#F59E0B', // Gold for chips
        accentHover: '#D97706',

        // Semantic colors
        error: '#F85149',
        warning: '#D29922',
        success: '#3FB950',
        info: '#58A6FF',

        // Card colors
        cardWhite: '#FAFAF9',
        cardBlack: '#1C1917',
        hearts: '#DC2626',
        diamonds: '#2563EB',
        clubs: '#16A34A',
        spades: '#1C1917',

        // Table
        tableGreen: '#1B5E20',
        tableGreenLight: '#2E7D32',
        tableBorder: '#388E3C',
    },

    // Light theme
    light: {
        background: '#FFFFFF',
        surface: '#F6F8FA',
        surfaceElevated: '#FFFFFF',
        border: '#D0D7DE',
        text: '#1F2328',
        textSecondary: '#656D76',
        textMuted: '#8C959F',

        primary: '#22C55E',
        primaryHover: '#16A34A',
        accent: '#F59E0B',
        accentHover: '#D97706',

        error: '#CF222E',
        warning: '#BF8700',
        success: '#1A7F37',
        info: '#0969DA',

        cardWhite: '#FAFAF9',
        cardBlack: '#1C1917',
        hearts: '#DC2626',
        diamonds: '#2563EB',
        clubs: '#16A34A',
        spades: '#1C1917',

        tableGreen: '#1B5E20',
        tableGreenLight: '#2E7D32',
        tableBorder: '#388E3C',
    },
} as const;

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
} as const;

export const fontSize = {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
} as const;

export const fontWeight = {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
} as const;

export const borderRadius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
} as const;

export const shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 15,
        elevation: 5,
    },
} as const;

// Breakpoints for responsive design
export const breakpoints = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
} as const;

export type Theme = 'dark' | 'light';
export type Colors = typeof colors.dark;
