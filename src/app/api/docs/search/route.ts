import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import { searchDocs } from '@/lib/docs-knowledge'

export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, _auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    const results = await searchDocs(query, limit)
    return NextResponse.json({ query, results, count: results.length })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/docs/search error')
    return NextResponse.json({ error: 'Failed to search docs' }, { status: 500 })
  }
})
