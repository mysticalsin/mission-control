import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getHermesMemory } from '@/lib/hermes-memory'

/**
 * GET /api/hermes/memory — Returns Hermes memory file contents
 * Read-only bridge: MC reads from ~/.hermes/memories/
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (_request, _auth) => {
  const result = getHermesMemory()
  return NextResponse.json(result)
})
