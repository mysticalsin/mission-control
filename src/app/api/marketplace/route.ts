import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'

// ---------------------------------------------------------------------------
// Lazy table creation -- idempotent, runs once per process
// ---------------------------------------------------------------------------

let tablesEnsured = false

function ensureTables(): void {
  if (tablesEnsured) return
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_plugins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      category TEXT NOT NULL DEFAULT 'automation',
      icon_url TEXT DEFAULT '',
      install_count INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available',
      config_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS marketplace_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      agent_count INTEGER NOT NULL DEFAULT 1,
      config_json TEXT DEFAULT '{}',
      preview_json TEXT DEFAULT '{}',
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS marketplace_community (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'workflow',
      config_json TEXT DEFAULT '{}',
      likes INTEGER NOT NULL DEFAULT 0,
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Seed data -- inserted when tables are empty on first GET
// ---------------------------------------------------------------------------

function seedIfEmpty(): void {
  const db = getDatabase()
  const count = db.prepare(
    'SELECT COUNT(*) as count FROM marketplace_plugins',
  ).get() as { count: number }

  if (count.count > 0) return

  seedPlugins(db)
  seedTemplates(db)
  seedCommunity(db)
}

function seedPlugins(db: ReturnType<typeof getDatabase>): void {
  const plugins = [
    { name: 'Auto-Scheduler', description: 'Automatically schedule tasks based on agent workload and priorities.', author: 'Mantu Labs', version: '2.1.0', category: 'automation', install_count: 1240, rating: 4.7 },
    { name: 'Analytics Dashboard', description: 'Advanced analytics with custom dashboards, charts, and export capabilities.', author: 'DataViz Co', version: '3.0.1', category: 'analytics', install_count: 890, rating: 4.5 },
    { name: 'Slack Integration', description: 'Bi-directional Slack integration for notifications and agent commands.', author: 'Mantu Labs', version: '1.4.2', category: 'integration', install_count: 2100, rating: 4.8 },
    { name: 'Threat Monitor', description: 'Real-time security threat detection and automated incident response.', author: 'SecureAI Inc', version: '1.2.0', category: 'security', install_count: 670, rating: 4.6 },
    { name: 'Custom Themes', description: 'Customizable UI themes with dark/light variants and brand color support.', author: 'UIKit Studio', version: '1.0.3', category: 'ui', install_count: 430, rating: 4.2 },
    { name: 'Webhook Relay', description: 'Forward and transform webhook events between external services and agents.', author: 'Mantu Labs', version: '2.0.0', category: 'integration', install_count: 560, rating: 4.4 },
  ]

  const stmt = db.prepare(
    'INSERT INTO marketplace_plugins (name, description, author, version, category, install_count, rating) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const p of plugins) {
    stmt.run(p.name, p.description, p.author, p.version, p.category, p.install_count, p.rating)
  }
}

function seedTemplates(db: ReturnType<typeof getDatabase>): void {
  const templates = [
    { name: 'Customer Support Bot', description: 'Pre-configured support agent with FAQ handling, ticket routing, and escalation workflows.', category: 'support', agent_count: 3, downloads: 340 },
    { name: 'Code Reviewer', description: 'Automated code review pipeline with linting, security scanning, and quality scoring.', category: 'engineering', agent_count: 4, downloads: 520 },
    { name: 'Data Analyst', description: 'Data ingestion, transformation, and reporting agent team with visualization support.', category: 'analytics', agent_count: 2, downloads: 280 },
    { name: 'DevOps Pipeline', description: 'CI/CD automation with deployment agents, health monitoring, and rollback capabilities.', category: 'engineering', agent_count: 5, downloads: 410 },
  ]

  const stmt = db.prepare(
    'INSERT INTO marketplace_templates (name, description, category, agent_count, downloads) VALUES (?, ?, ?, ?, ?)',
  )
  for (const t of templates) {
    stmt.run(t.name, t.description, t.category, t.agent_count, t.downloads)
  }
}

function seedCommunity(db: ReturnType<typeof getDatabase>): void {
  const items = [
    { name: 'Sprint Retro Automator', description: 'Automated sprint retrospective collection and summary generation.', author: 'agile_tony', type: 'workflow', likes: 89, downloads: 210 },
    { name: 'Multi-Repo Sync', description: 'Synchronize agent configurations across multiple Git repositories.', author: 'devops_sara', type: 'automation', likes: 124, downloads: 340 },
    { name: 'Agent Health Dashboard', description: 'Custom health monitoring dashboard with alerting and trend analysis.', author: 'ops_marcus', type: 'configuration', likes: 67, downloads: 150 },
    { name: 'Knowledge Base Builder', description: 'Automatically build and maintain agent knowledge bases from documentation.', author: 'ai_emma', type: 'workflow', likes: 156, downloads: 420 },
  ]

  const stmt = db.prepare(
    'INSERT INTO marketplace_community (name, description, author, type, likes, downloads) VALUES (?, ?, ?, ?, ?, ?)',
  )
  for (const c of items) {
    stmt.run(c.name, c.description, c.author, c.type, c.likes, c.downloads)
  }
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const installPluginSchema = z.object({
  action: z.literal('install_plugin'),
  pluginId: z.number().int().positive(),
})

const useTemplateSchema = z.object({
  action: z.literal('use_template'),
  templateId: z.number().int().positive(),
})

const importCommunitySchema = z.object({
  action: z.literal('import_community'),
  itemId: z.number().int().positive(),
})

const postBodySchema = z.discriminatedUnion('action', [
  installPluginSchema,
  useTemplateSchema,
  importCommunitySchema,
])

const deleteBodySchema = z.object({
  pluginId: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// GET /api/marketplace?tab=plugins|templates|community&category=&q=
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'plugins'

  try {
    ensureTables()
    seedIfEmpty()
    const db = getDatabase()

    if (tab === 'plugins') return handleGetPlugins(db, searchParams)
    if (tab === 'templates') return handleGetTemplates(db, searchParams)
    if (tab === 'community') return handleGetCommunity(db, searchParams)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Marketplace GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetPlugins(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const category = params.get('category')
  const search = params.get('q')

  let query = 'SELECT id, name, description, author, version, category, icon_url, install_count, rating, status, created_at, updated_at FROM marketplace_plugins WHERE 1=1'
  const queryParams: unknown[] = []

  if (category) {
    query += ' AND category = ?'
    queryParams.push(category)
  }
  if (search) {
    query += ' AND (name LIKE ? OR description LIKE ? OR author LIKE ?)'
    const like = `%${search}%`
    queryParams.push(like, like, like)
  }

  query += ' ORDER BY install_count DESC LIMIT 100'
  const plugins = db.prepare(query).all(...queryParams)
  return NextResponse.json({ plugins })
}

function handleGetTemplates(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const category = params.get('category')
  const search = params.get('q')

  let query = 'SELECT id, name, description, category, agent_count, downloads, created_at FROM marketplace_templates WHERE 1=1'
  const queryParams: unknown[] = []

  if (category) {
    query += ' AND category = ?'
    queryParams.push(category)
  }
  if (search) {
    query += ' AND (name LIKE ? OR description LIKE ?)'
    const like = `%${search}%`
    queryParams.push(like, like)
  }

  query += ' ORDER BY downloads DESC LIMIT 100'
  const templates = db.prepare(query).all(...queryParams)
  return NextResponse.json({ templates })
}

function handleGetCommunity(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const search = params.get('q')

  let query = 'SELECT id, name, description, author, type, likes, downloads, created_at FROM marketplace_community WHERE 1=1'
  const queryParams: unknown[] = []

  if (search) {
    query += ' AND (name LIKE ? OR description LIKE ? OR author LIKE ?)'
    const like = `%${search}%`
    queryParams.push(like, like, like)
  }

  query += ' ORDER BY likes DESC LIMIT 100'
  const items = db.prepare(query).all(...queryParams)
  return NextResponse.json({ items })
}

// ---------------------------------------------------------------------------
// POST /api/marketplace
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, postBodySchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    return dispatchPostAction(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Marketplace POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'install_plugin': {
      const plugin = db.prepare(
        'SELECT id, name, status FROM marketplace_plugins WHERE id = ?',
      ).get(data.pluginId) as { id: number; name: string; status: string } | undefined

      if (!plugin) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
      if (plugin.status === 'installed') {
        return NextResponse.json({ error: 'Plugin already installed' }, { status: 409 })
      }

      db.prepare(
        'UPDATE marketplace_plugins SET status = ?, install_count = install_count + 1, updated_at = ? WHERE id = ?',
      ).run('installed', now, data.pluginId)

      return NextResponse.json({ ok: true, message: `${plugin.name} installed` }, { status: 201 })
    }
    case 'use_template': {
      const template = db.prepare(
        'SELECT id, name FROM marketplace_templates WHERE id = ?',
      ).get(data.templateId) as { id: number; name: string } | undefined

      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      db.prepare(
        'UPDATE marketplace_templates SET downloads = downloads + 1 WHERE id = ?',
      ).run(data.templateId)

      return NextResponse.json({ ok: true, message: `${template.name} deployed` }, { status: 201 })
    }
    case 'import_community': {
      const item = db.prepare(
        'SELECT id, name FROM marketplace_community WHERE id = ?',
      ).get(data.itemId) as { id: number; name: string } | undefined

      if (!item) {
        return NextResponse.json({ error: 'Community item not found' }, { status: 404 })
      }

      db.prepare(
        'UPDATE marketplace_community SET downloads = downloads + 1 WHERE id = ?',
      ).run(data.itemId)

      return NextResponse.json({ ok: true, message: `${item.name} imported` }, { status: 201 })
    }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/marketplace
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, deleteBodySchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    const plugin = db.prepare(
      'SELECT id, name, status FROM marketplace_plugins WHERE id = ?',
    ).get(validated.data.pluginId) as { id: number; name: string; status: string } | undefined

    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }
    if (plugin.status !== 'installed') {
      return NextResponse.json({ error: 'Plugin is not installed' }, { status: 409 })
    }

    db.prepare(
      'UPDATE marketplace_plugins SET status = ?, updated_at = ? WHERE id = ?',
    ).run('available', now, validated.data.pluginId)

    return NextResponse.json({ ok: true, message: `${plugin.name} uninstalled` })
  } catch (error) {
    logger.error({ err: error }, 'Marketplace DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
