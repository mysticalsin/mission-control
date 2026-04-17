import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getDatabase } from '@/lib/db'

/**
 * DELETE /api/exec-replay/bookmarks/[id]
 * Delete a bookmark by id (operator only). Scoped to the caller's workspace.
 */
export const DELETE = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  const workspaceId = auth.user.workspace_id ?? 1
  const id = new URL(request.url).pathname.split('/').at(-1) ?? ''
  const bookmarkId = parseInt(id, 10)

  if (Number.isNaN(bookmarkId)) {
    return NextResponse.json({ error: 'Invalid bookmark id' }, { status: 400 })
  }

  const db = getDatabase()

  // Verify the bookmark belongs to this workspace before deleting
  const existing = db.prepare(
    'SELECT id FROM replay_bookmarks WHERE id = ? AND workspace_id = ?'
  ).get(bookmarkId, workspaceId)

  if (!existing) {
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  }

  db.prepare('DELETE FROM replay_bookmarks WHERE id = ? AND workspace_id = ?')
    .run(bookmarkId, workspaceId)

  return NextResponse.json({ success: true })
})
