import { NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'
import { ALL_ULTRON_AGENTS } from '@/lib/ultron-agents'
import { logger } from '@/lib/logger'

/**
 * POST /api/ultron/seed
 * Seeds the Ultron 9-department C-Suite agent hierarchy into the database.
 * Requires admin authentication.
 */
export async function POST(request: Request) {
  const user = getUserFromRequest(request)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDatabase()
  const workspaceId = user.workspace_id || 1
  const now = Math.floor(Date.now() / 1000)

  let seeded = 0
  let skipped = 0

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO agents (name, role, status, config, soul_content, workspace_id, created_at, updated_at)
    VALUES (?, ?, 'idle', ?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    for (const agent of ALL_ULTRON_AGENTS) {
      const config = JSON.stringify({
        id: agent.id,
        department: agent.department,
        tier: agent.tier,
        color: agent.color,
        avatar: agent.avatar,
        model: agent.model,
        tokenBudget: agent.tokenBudget,
        parentId: agent.parentId,
      })

      const result = insertStmt.run(
        agent.name,
        agent.role,
        config,
        agent.description,
        workspaceId,
        now,
        now
      )

      if (result.changes > 0) {
        seeded++
      } else {
        skipped++
      }
    }
  })

  try {
    transaction()

    db_helpers.logActivity(
      'ultron_seed',
      'system',
      0,
      user.username,
      `Seeded ${seeded} Ultron agents (${skipped} already existed)`,
      { seeded, skipped, total: ALL_ULTRON_AGENTS.length },
      workspaceId
    )

    logger.info({ seeded, skipped }, 'Ultron agent hierarchy seeded')

    return NextResponse.json({
      success: true,
      seeded,
      skipped,
      total: ALL_ULTRON_AGENTS.length,
    })
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed Ultron agents')
    return NextResponse.json(
      { error: 'Failed to seed agents' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ultron/seed
 * Returns the current seeding status - how many agents are in DB vs expected.
 */
export async function GET(request: Request) {
  const user = getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDatabase()
  const workspaceId = user.workspace_id || 1

  const agentNames = ALL_ULTRON_AGENTS.map(a => a.name)
  const placeholders = agentNames.map(() => '?').join(',')
  const existingCount = (db.prepare(
    `SELECT COUNT(*) as count FROM agents WHERE name IN (${placeholders}) AND workspace_id = ?`
  ).get(...agentNames, workspaceId) as { count: number }).count

  return NextResponse.json({
    expected: ALL_ULTRON_AGENTS.length,
    existing: existingCount,
    missing: ALL_ULTRON_AGENTS.length - existingCount,
    fullySeeded: existingCount === ALL_ULTRON_AGENTS.length,
  })
}
