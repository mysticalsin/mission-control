import { NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { APP_VERSION } from '@/lib/version'

const UPDATE_TIMEOUT = 5 * 60 * 1000 // 5 minutes
const MAX_BUFFER = 10 * 1024 * 1024 // 10 MB

const EXEC_OPTS = {
  timeout: UPDATE_TIMEOUT,
  maxBuffer: MAX_BUFFER,
  encoding: 'utf-8' as const,
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { ...EXEC_OPTS, cwd }).trim()
}

function pnpm(args: string[], cwd: string): string {
  return execFileSync('pnpm', args, { ...EXEC_OPTS, cwd }).trim()
}

// Resolve a version target to a concrete git ref (tag, branch, or SHA)
function resolveRef(
  target: string,
  cwd: string
): { ref: string; kind: 'tag' | 'branch' | 'sha' } {
  const tag = target.startsWith('v') ? target : `v${target}`

  // Try tag first (e.g. v2.0.0)
  try {
    git(['rev-parse', '--verify', `refs/tags/${tag}`], cwd)
    return { ref: tag, kind: 'tag' }
  } catch {
    // Tag not found — fall through
  }

  // Try branch (e.g. "main", "release/2.0.0")
  try {
    git(['rev-parse', '--verify', `refs/remotes/origin/${target}`], cwd)
    return { ref: `origin/${target}`, kind: 'branch' }
  } catch {
    // Branch not found — fall through
  }

  // Try raw SHA or short SHA
  try {
    const resolved = git(['rev-parse', '--verify', target], cwd)
    return { ref: resolved, kind: 'sha' }
  } catch {
    // Nothing matched
  }

  throw new Error(
    `Could not resolve "${target}" — no matching tag (${tag}), branch, or commit found in remote`
  )
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireRole(request, 'admin')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const user = auth.user!
  const cwd = process.cwd()
  const steps: { step: string; output: string }[] = []

  try {
    const body = await request.json().catch(() => ({}))
    const targetVersion: string | undefined = body.targetVersion
    if (!targetVersion) {
      return NextResponse.json(
        { error: 'Missing targetVersion in request body' },
        { status: 400 }
      )
    }

    // 1. Check for uncommitted changes
    const status = git(['status', '--porcelain'], cwd)
    if (status) {
      return NextResponse.json(
        {
          error:
            'Working tree has uncommitted changes. Please commit or stash them before updating.',
          dirty: true,
          files: status.split('\n').slice(0, 20),
        },
        { status: 409 }
      )
    }

    // 2. Fetch tags and branches from origin
    const fetchOut = git(['fetch', 'origin', '--tags', '--force'], cwd)
    steps.push({ step: 'git fetch', output: fetchOut || 'OK' })

    // 3. Resolve version to a concrete ref (tag → branch → SHA)
    let resolved: { ref: string; kind: string }
    try {
      resolved = resolveRef(targetVersion, cwd)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown resolution error'
      return NextResponse.json({ error: message }, { status: 404 })
    }
    steps.push({
      step: 'resolve ref',
      output: `${resolved.kind}: ${resolved.ref}`,
    })

    // 4. Checkout the resolved ref
    const checkoutOut = git(['checkout', resolved.ref], cwd)
    steps.push({
      step: `git checkout ${resolved.ref}`,
      output: checkoutOut,
    })

    // 5. Install dependencies
    const installOut = pnpm(['install', '--frozen-lockfile'], cwd)
    steps.push({ step: 'pnpm install', output: installOut })

    // 6. Build
    const buildOut = pnpm(['build'], cwd)
    steps.push({ step: 'pnpm build', output: buildOut })

    // 7. Read new version from package.json
    const newPkg = JSON.parse(
      readFileSync(join(cwd, 'package.json'), 'utf-8')
    )
    const newVersion: string = newPkg.version ?? targetVersion

    // 8. Log to audit_log
    try {
      const db = getDatabase()
      db.prepare(
        'INSERT INTO audit_log (action, actor, detail) VALUES (?, ?, ?)'
      ).run(
        'system.update',
        user.username,
        JSON.stringify({
          previousVersion: APP_VERSION,
          newVersion,
          resolvedRef: resolved.ref,
          resolvedKind: resolved.kind,
        })
      )
    } catch {
      // Non-critical — don't fail the update if audit logging fails
    }

    return NextResponse.json({
      success: true,
      previousVersion: APP_VERSION,
      newVersion,
      ref: resolved.ref,
      refKind: resolved.kind,
      steps,
      restartRequired: true,
    })
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'Unknown error during update'

    return NextResponse.json(
      {
        error: 'Update failed',
        detail: message,
        steps,
      },
      { status: 500 }
    )
  }
}
