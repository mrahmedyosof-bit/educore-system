import next from '@next/eslint-plugin-next';

export default [
  {
    ignores: ['node_modules/', '.next/', 'out/'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@next/next': next,
    },
    extends: [
      'plugin:@next/next/recommended',
      'plugin:@next/next/core-web-vitals',
    ],
  },
];