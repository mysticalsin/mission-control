import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import {
  searchRegistry,
  installFromRegistry,
  checkSkillSecurity,
  type RegistrySource,
} from '@/lib/skill-registry'

const VALID_SOURCES: RegistrySource[] = ['clawhub', 'skills-sh', 'awesome-openclaw']
const VALID_TARGETS = ['user-agents', 'user-codex', 'project-agents', 'project-codex', 'openclaw', 'workspace']

/**
 * GET /api/skills/registry?source=clawhub&q=terraform
 * Proxied search — server-side only, rate-limited.
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'mutation' }, async (request, _auth) => {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source') as RegistrySource
  const query = searchParams.get('q') || ''

  if (!source || !VALID_SOURCES.includes(source)) {
    return NextResponse.json({ error: `Invalid source. Use: ${VALID_SOURCES.join(', ')}` }, { status: 400 })
  }
  if (!query.trim()) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
  }

  const result = await searchRegistry(source, query.trim())
  return NextResponse.json(result)
})

/**
 * POST /api/skills/registry — Install skill from external registry.
 * Admin-only. Downloads, validates, security-scans, and writes to disk.
 */
export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (request, _auth) => {
  const body = await request.json().catch(() => ({}))
  const { source, slug, targetRoot } = body as {
    source?: RegistrySource
    slug?: string
    targetRoot?: string
  }

  if (!source || !VALID_SOURCES.includes(source)) {
    return NextResponse.json({ error: `Invalid source. Use: ${VALID_SOURCES.join(', ')}` }, { status: 400 })
  }
  if (!slug || typeof slug !== 'string' || slug.length > 200) {
    return NextResponse.json({ error: 'Valid slug is required' }, { status: 400 })
  }
  if (!targetRoot || !VALID_TARGETS.includes(targetRoot)) {
    return NextResponse.json({ error: `Invalid targetRoot. Use: ${VALID_TARGETS.join(', ')}` }, { status: 400 })
  }

  const result = await installFromRegistry({ source, slug, targetRoot })

  if (!result.ok) {
    return NextResponse.json(result, { status: 422 })
  }

  return NextResponse.json(result)
})

/**
 * PUT /api/skills/registry — Security-check content without installing.
 * Useful for preview/audit before install.
 */
export const PUT = apiGuard({ role: 'viewer', rateLimit: 'mutation' }, async (request, _auth) => {
  const body = await request.json().catch(() => ({}))
  const content = typeof body?.content === 'string' ? body.content : ''

  if (!content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const report = checkSkillSecurity(content)
  return NextResponse.json({ security: report })
})

export const dynamic = 'force-dynamic'
