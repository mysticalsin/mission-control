import next from 'eslint-config-next'
import security from 'eslint-plugin-security'

const config = [
  ...next,
  {
    ignores: [
      '.data/**',
      'ops/**',
    ],
  },
  // Security rules — catch common Node.js/JS security anti-patterns
  {
    plugins: { security },
    rules: {
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-require': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      // These rules are too noisy for bracket access and RegExp patterns
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'warn',
    },
  },
  // The React 19/ESLint ecosystem is still settling. These rules are valuable,
  // but they currently trigger a lot of false positives in this codebase.
  // Keep them off until we do a dedicated refactor pass.
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]

export default config
