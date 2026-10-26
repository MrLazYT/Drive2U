const development = process.env.APP_VARIANT === 'development';
export default {
  expo: {
    name: 'Drive2U', slug: 'drive2u', version: '1.0.0', orientation: 'portrait',
    scheme: 'drive2u', userInterfaceStyle: 'light',
    android: { package: development ? 'com.drive2u.demo' : 'com.drive2u.app' },
    plugins: ['expo-secure-store', ['expo-location', { locationWhenInUsePermission: 'Drive2U використовує місцеперебування лише для вибору точки подачі.' }], ['expo-build-properties', { android: { usesCleartextTraffic: development } }]],
    extra: { development },
  },
};
