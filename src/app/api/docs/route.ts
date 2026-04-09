import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { apiGuard } from '@/lib/api-guard'

let cachedSpec: string | null = null

export const GET = apiGuard({ role: 'viewer', rateLimit: 'none' }, async () => {
  if (!cachedSpec) {
    const specPath = join(process.cwd(), 'openapi.json')
    cachedSpec = readFileSync(specPath, 'utf-8')
  }

  return new NextResponse(cachedSpec, {
    headers: {
      'Content-Type': 'application/json',
      // Private: authenticated users only — never cache in shared proxies
      'Cache-Control': 'private, max-age=3600',
    },
  })
})
