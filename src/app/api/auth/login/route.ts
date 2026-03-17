import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateUser, createSession } from '@/lib/auth'
import { logAuditEvent } from '@/lib/db'
import { getMcSessionCookieName, getMcSessionCookieOptions, isRequestSecure } from '@/lib/session-cookie'
import { loginLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

/** Zod schema for login request body — validates and sanitizes auth input */
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(128, 'Username too long').trim(),
  password: z.string().min(1, 'Password is required').max(256, 'Password too long'),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rateCheck = loginLimiter(request)
    if (rateCheck) return rateCheck

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const { username, password } = parsed.data

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || undefined

    const user = authenticateUser(username, password)
    if (!user) {
      logAuditEvent({ action: 'login_failed', actor: username, ip_address: ipAddress, user_agent: userAgent })
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const { token, expiresAt } = createSession(user.id, ipAddress, userAgent, user.workspace_id)

    logAuditEvent({ action: 'login', actor: user.username, actor_id: user.id, ip_address: ipAddress, user_agent: userAgent })

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        provider: user.provider || 'local',
        email: user.email || null,
        avatar_url: user.avatar_url || null,
        workspace_id: user.workspace_id ?? 1,
        tenant_id: user.tenant_id ?? 1,
      },
    })

    const isSecureRequest = isRequestSecure(request)
    const cookieName = getMcSessionCookieName(isSecureRequest)

    response.cookies.set(cookieName, token, {
      ...getMcSessionCookieOptions({ maxAgeSeconds: expiresAt - Math.floor(Date.now() / 1000), isSecureRequest }),
    })

    return response
  } catch (error) {
    logger.error({ err: error }, 'Login error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
