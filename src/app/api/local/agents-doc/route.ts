import { NextResponse } from 'next/server'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { apiGuard } from '@/lib/api-guard'

async function findFirstReadable(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await access(p, constants.R_OK)
      return p
    } catch {
      // Try next candidate
    }
  }
  return null
}

export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (_request, _auth) => {
  const cwd = process.cwd()
  const home = homedir()
  const candidates = [
    join(cwd, 'AGENTS.md'),
    join(cwd, 'agents.md'),
    join(home, '.codex', 'AGENTS.md'),
    join(home, '.agents', 'AGENTS.md'),
    join(home, '.config', 'codex', 'AGENTS.md'),
  ]

  const found = await findFirstReadable(candidates)
  if (!found) {
    return NextResponse.json({
      found: false,
      path: null,
      content: null,
      candidates,
    })
  }

  const content = await readFile(found, 'utf8')
  return NextResponse.json({
    found: true,
    path: found,
    content,
    candidates,
  })
})

export const dynamic = 'force-dynamic'
