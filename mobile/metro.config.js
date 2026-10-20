// Shares pure logic (minutes schema types, transcript importers, markdown export)
// with the web app in ../src/lib via the @core/* alias in tsconfig.json.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../src/lib")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
