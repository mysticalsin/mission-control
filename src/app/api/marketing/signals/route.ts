import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'

// ---------------------------------------------------------------------------
// Lazy table creation — reuses the same table as the parent marketing route
// ---------------------------------------------------------------------------

let tableEnsured = false

function ensureSignalsTable(): void {
  if (tableEnsured) return
  const db = getDatabase()
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 50,
      source_url TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  tableEnsured = true
}

// ---------------------------------------------------------------------------
// GET /api/marketing/signals
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const signalType = searchParams.get('type')
  const company = searchParams.get('company')
  const minConfidence = searchParams.get('min_confidence')
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

  try {
    ensureSignalsTable()
    const db = getDatabase()

    let query = 'SELECT id, signal_type, company, description, confidence, source_url, created_at FROM marketing_signals WHERE 1=1'
    const params: unknown[] = []

    if (signalType) {
      query += ' AND signal_type = ?'
      params.push(signalType)
    }
    if (company) {
      query += ' AND company LIKE ?'
      params.push(`%${company}%`)
    }
    if (minConfidence) {
      const parsed = Number(minConfidence)
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        query += ' AND confidence >= ?'
        params.push(parsed)
      }
    }

    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const signals = db.prepare(query).all(...params)

    // Aggregate signal type counts for the filter UI
    const typeCounts = db.prepare(
      'SELECT signal_type, COUNT(*) as count FROM marketing_signals GROUP BY signal_type ORDER BY count DESC',
    ).all() as Array<{ signal_type: string; count: number }>

    return NextResponse.json({ signals, typeCounts })
  } catch (error) {
    logger.error({ err: error }, 'Marketing signals GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
