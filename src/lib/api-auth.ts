import { NextRequest, NextResponse } from 'next/server'
import { requireRole, User } from '@/lib/auth'

/**
 * Authenticated request context passed to route handlers.
 * Readonly to enforce immutability — handlers should never mutate auth state.
 */
export interface AuthContext {
  readonly user: Readonly<User>
  readonly request: NextRequest
}

/** Route params shape for dynamic Next.js routes (e.g. /api/agents/[id]) */
export interface RouteParams<T extends Record<string, string> = Record<string, string>> {
  readonly params: Promise<T>
}

/** Handler that receives an authenticated context */
type AuthenticatedHandler = (
  context: AuthContext
) => Promise<NextResponse>

/** Handler for dynamic routes that also receives route params */
type AuthenticatedParamsHandler<T extends Record<string, string>> = (
  context: AuthContext,
  routeParams: RouteParams<T>
) => Promise<NextResponse>

/**
 * Wraps a Next.js route handler with role-based authentication.
 *
 * Eliminates repeated auth boilerplate:
 *   const auth = requireRole(request, 'viewer');
 *   if ('error' in auth) return NextResponse.json(...)
 *
 * Usage (static route):
 *   export const GET = withAuth('viewer', async ({ user, request }) => { ... })
 *
 * Usage (dynamic route with params):
 *   export const GET = withAuthParams<{ id: string }>('viewer', async ({ user, request }, { params }) => { ... })
 */
export function withAuth(
  minRole: User['role'],
  handler: AuthenticatedHandler
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const auth = requireRole(request, minRole)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    return handler({ user: auth.user, request })
  }
}

/**
 * Same as withAuth but forwards Next.js dynamic route params to the handler.
 * Use for routes like /api/agents/[id]/heartbeat.
 */
export function withAuthParams<T extends Record<string, string>>(
  minRole: User['role'],
  handler: AuthenticatedParamsHandler<T>
): (request: NextRequest, routeParams: RouteParams<T>) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    routeParams: RouteParams<T>
  ): Promise<NextResponse> => {
    const auth = requireRole(request, minRole)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    return handler({ user: auth.user, request }, routeParams)
  }
}
