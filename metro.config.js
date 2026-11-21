const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
// Keep Metro out of the Electron shell (its node_modules contain a second React etc.).
const escape = (p) => p.replace(/[/\\]/g, '[/\\\\]').replace(/\./g, '\\.');
config.resolver.blockList = [new RegExp(`^${escape(path.join(__dirname, 'desktop'))}[/\\\\].*`)];
module.exports = config;
