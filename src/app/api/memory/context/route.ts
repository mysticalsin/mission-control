import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { apiGuard } from '@/lib/api-guard'
import { generateContextPayload } from '@/lib/memory-utils'
import { logger } from '@/lib/logger'

const MEMORY_PATH = config.memoryDir

/**
 * Context injection endpoint — generates a payload for agent session start.
 * Returns workspace tree, recent files, health summary, and maintenance signals.
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, _auth) => {
  if (!MEMORY_PATH) {
    return NextResponse.json({ error: 'Memory directory not configured' }, { status: 500 })
  }

  try {
    const payload = await generateContextPayload(MEMORY_PATH)
    return NextResponse.json(payload)
  } catch (err) {
    logger.error({ err }, 'Memory context API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
