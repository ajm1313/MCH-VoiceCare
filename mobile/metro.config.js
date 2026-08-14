const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const config = {
  transformer: {
    minifierConfig: {
      mangle: true,
      compress: {
        warnings: false,
      },
      format: {
        ascii_only: true,
      },
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
