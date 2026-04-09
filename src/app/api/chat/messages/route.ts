import { NextRequest, NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { handleGetMessages } from './get-handler'
import { handlePostMessage } from './post-handler'

/**
 * Thin router — delegates to dedicated handlers so each file stays focused.
 * GET  → get-handler.ts  (list/filter messages)
 * POST → post-handler.ts (create + optional gateway forward)
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, (request, auth) =>
  handleGetMessages(request, auth)
)

export const POST = apiGuard({ role: 'operator', rateLimit: 'mutation' }, (request, auth) =>
  handlePostMessage(request, auth)
)
