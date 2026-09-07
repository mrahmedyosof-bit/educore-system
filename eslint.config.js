const nextConfig = require('eslint-config-next');

module.exports = nextConfig.map(config => {
  if (config.name === 'next') {
    return {
      ...config,
      rules: {
        ...(config.rules || {}),
        '@next/next/no-html-link-for-pages': 'error',
        '@next/next/no-sync-scripts': 'error',
      },
    };
  }
  return config;
});