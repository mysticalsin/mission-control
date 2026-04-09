import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import { getDocsTree, listDocsRoots } from '@/lib/docs-knowledge'

export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (_request, _auth) => {
  try {
    const tree = await getDocsTree()
    return NextResponse.json({ roots: listDocsRoots(), tree })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/docs/tree error')
    return NextResponse.json({ error: 'Failed to load docs tree' }, { status: 500 })
  }
})
