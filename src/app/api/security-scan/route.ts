import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import { runSecurityScan } from '@/lib/security-scan'

export const GET = apiGuard({ role: 'admin', rateLimit: 'read' }, async (_request, _auth) => {
  try {
    return NextResponse.json(runSecurityScan())
  } catch (error) {
    logger.error({ err: error }, 'Security scan error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
