import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import { readDocsContent } from '@/lib/docs-knowledge'

export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, _auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const path = (searchParams.get('path') || '').trim()

    if (!path) {
      return NextResponse.json({ error: 'Path required' }, { status: 400 })
    }

    try {
      const doc = await readDocsContent(path)
      return NextResponse.json(doc)
    } catch (error) {
      const message = (error as Error).message || ''
      if (message.includes('Path not allowed')) {
        return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
      }
      if (message.includes('not configured')) {
        return NextResponse.json({ error: 'Docs directory not configured' }, { status: 500 })
      }
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  } catch (error) {
    logger.error({ err: error }, 'GET /api/docs/content error')
    return NextResponse.json({ error: 'Failed to load doc content' }, { status: 500 })
  }
})
