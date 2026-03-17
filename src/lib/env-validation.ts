import { z } from 'zod'

// Zod coerces PORT from string; .int().min(1).max(65535) ensures valid TCP range.
// Auth and API key are only required in production — dev environments often
// run without real credentials, so we warn instead of blocking.
const envSchema = z.object({
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .pipe(z.number().int().min(1).max(65535).optional()),

  AUTH_USER: z.string().min(1, 'AUTH_USER must not be empty').optional(),
  AUTH_PASS: z
    .string()
    .min(12, 'AUTH_PASS must be at least 12 characters')
    .optional(),

  API_KEY: z
    .string()
    .min(1, 'API_KEY must not be empty')
    .optional(),

  MC_COORDINATOR_AGENT: z.string().optional(),
  NODE_ENV: z.string().optional(),
})

type EnvSchema = z.infer<typeof envSchema>

/** Fields that must be present when running in production. */
const PRODUCTION_REQUIRED: ReadonlyArray<keyof EnvSchema> = [
  'AUTH_USER',
  'AUTH_PASS',
  'API_KEY',
] as const

interface ValidationResult {
  readonly success: boolean
  readonly env: EnvSchema
  readonly warnings: readonly string[]
}

/**
 * Validate critical env vars at startup.
 *
 * In production, missing required vars cause a thrown error so the
 * process fails fast before accepting traffic. In development the
 * same issues are surfaced as warnings only — this avoids friction
 * during local iteration where auth is often disabled.
 */
export function validateEnv(): ValidationResult {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const messages = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    )
    const detail = messages.join('\n  - ')
    throw new Error(
      `Environment validation failed:\n  - ${detail}`,
    )
  }

  const isProduction = parsed.data.NODE_ENV === 'production'
  const warnings: string[] = []

  for (const key of PRODUCTION_REQUIRED) {
    if (!parsed.data[key]) {
      const message = `${key} is not set — required in production`
      if (isProduction) {
        throw new Error(
          `Environment validation failed: ${message}. ` +
            'Set this variable before starting the production server.',
        )
      }
      warnings.push(message)
    }
  }

  return { success: true, env: parsed.data, warnings } as const
}
