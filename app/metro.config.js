// Metro konfigurace pro monorepo: appka je samostatný Expo projekt, ale
// potřebuje vidět balíčky @dietapp/* z ../packages. Řeší se přes watchFolders
// (Metro smí číst soubory mimo app/) a extraNodeModules (mapování názvu
// balíčku na jeho složku; Metro pak vezme jeho `main`, tedy dist/index.js).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.resolve(repoRoot, 'packages')];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  '@dietapp/nutrition-calc': path.resolve(repoRoot, 'packages/nutrition-calc'),
  '@dietapp/gamification-rules': path.resolve(repoRoot, 'packages/gamification-rules'),
  '@dietapp/diary': path.resolve(repoRoot, 'packages/diary'),
  '@dietapp/off-import': path.resolve(repoRoot, 'packages/off-import'),
  '@dietapp/analyze-photo': path.resolve(repoRoot, 'packages/analyze-photo'),
};

module.exports = config;
