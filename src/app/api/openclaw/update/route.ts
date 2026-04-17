import { getErrorMessage, type ProcessError } from '@/lib/types/sql'
import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { runOpenClaw } from '@/lib/command'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (_request, auth) => {
  // update runs for up to 5min
  let installedBefore: string | null = null

  try {
    const vResult = await runOpenClaw(['--version'], { timeoutMs: 3000 })
    const match = vResult.stdout.match(/(\d+\.\d+\.\d+)/)
    if (match) installedBefore = match[1]
  } catch {
    return NextResponse.json(
      { error: 'OpenClaw is not installed or not reachable' },
      { status: 400 }
    )
  }

  try {
    const result = await runOpenClaw(['update', '--channel', 'stable'], {
      timeoutMs: 5 * 60 * 1000,
    })

    // Read new version after update
    let installedAfter: string | null = null
    try {
      const vResult = await runOpenClaw(['--version'], { timeoutMs: 3000 })
      const match = vResult.stdout.match(/(\d+\.\d+\.\d+)/)
      if (match) installedAfter = match[1]
    } catch { /* keep null */ }

    // Audit log
    try {
      const db = getDatabase()
      db.prepare(
        'INSERT INTO audit_log (action, actor, detail) VALUES (?, ?, ?)'
      ).run(
        'openclaw.update',
        auth.user.username,
        JSON.stringify({ previousVersion: installedBefore, newVersion: installedAfter })
      )
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      previousVersion: installedBefore,
      newVersion: installedAfter,
      output: result.stdout,
    })
  } catch (err: unknown) {
    const detail =
      (err as ProcessError).stderr?.toString?.()?.trim() ||
      (err as ProcessError).stdout?.toString?.()?.trim() ||
      getErrorMessage(err) ||
      'Unknown error during OpenClaw update'

    logger.error({ err }, 'OpenClaw update failed')

    return NextResponse.json(
      { error: 'OpenClaw update failed', detail },
      { status: 500 }
    )
  }
})
