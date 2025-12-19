// Metro config for pnpm monorepo
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Get the monorepo root
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages from
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Force Metro to resolve symlinks (critical for pnpm)
config.resolver.unstable_enableSymlinks = true;

// 4. Disable package exports resolution (fixes pnpm issues)
config.resolver.unstable_enablePackageExports = false;

// 5. Extra modules to include in resolution
config.resolver.extraNodeModules = {
    '@foldflop/poker-engine': path.resolve(monorepoRoot, 'packages/poker-engine'),
    '@foldflop/ai-engine': path.resolve(monorepoRoot, 'packages/ai-engine'),
    '@foldflop/shared': path.resolve(monorepoRoot, 'packages/shared'),
};

module.exports = config;
