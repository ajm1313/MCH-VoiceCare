module.exports = {
  preset: 'react-native',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!react-native|@react-native|react-native-nitro-sqlite|react-native-svg|@react-navigation|@tanstack|zustand|uuid)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
