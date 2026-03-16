'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/client-logger'
import type { Note } from './types'

const log = createClientLogger('LifeNotes')

// ── Helpers ─────────────────────────────────────────────────────────────

function parseTags(tagsJson: string): readonly string[] {
  try {
    const parsed = JSON.parse(tagsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Create/Edit Form ────────────────────────────────────────────────────

function NoteForm({
  initial,
  onSubmit,
  onCancel,
}: {
  readonly initial?: Note
  readonly onSubmit: (data: Record<string, unknown>) => Promise<void>
  readonly onCancel: () => void
}): React.ReactElement {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [tagsInput, setTagsInput] = useState(
    initial ? parseTags(initial.tags_json).join(', ') : '',
  )

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!title.trim()) return

    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    if (initial) {
      await onSubmit({
        entity: 'note',
        id: initial.id,
        title: title.trim(),
        content: content.trim(),
        tags,
      })
    } else {
      await onSubmit({
        action: 'create_note',
        title: title.trim(),
        content: content.trim(),
        tags,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        {initial ? 'Edit Note' : 'New Note'}
      </h3>
      <input
        type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Title" required maxLength={200}
        className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      <textarea
        value={content} onChange={e => setContent(e.target.value)}
        placeholder="Write your note..." maxLength={10000} rows={5}
        className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground resize-none"
      />
      <input
        type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
        placeholder="Tags (comma-separated)" maxLength={500}
        className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim()}>
          {initial ? 'Save' : 'Create'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── Props ───────────────────────────────────────────────────────────────

interface NotesTabProps {
  readonly notes: readonly Note[]
  readonly onAction: (
    method: string,
    body: Record<string, unknown>,
  ) => Promise<void>
}

// ── Main Component ──────────────────────────────────────────────────────

export function NotesTab({
  notes,
  onAction,
}: NotesTabProps): React.ReactElement {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)

  // Collect all unique tags across notes
  const allTags = Array.from(
    new Set(notes.flatMap(n => parseTags(n.tags_json))),
  ).sort()

  function filterNotes(): readonly Note[] {
    let filtered = notes

    if (search.trim()) {
      const query = search.toLowerCase()
      filtered = filtered.filter(
        n =>
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query),
      )
    }

    if (tagFilter) {
      filtered = filtered.filter(n =>
        parseTags(n.tags_json).includes(tagFilter),
      )
    }

    return filtered
  }

  async function handleDelete(id: number): Promise<void> {
    await onAction('DELETE', { entity: 'note', id })
  }

  async function handleEdit(data: Record<string, unknown>): Promise<void> {
    await onAction('PATCH', data)
    setEditingNote(null)
  }

  const filtered = filterNotes()

  return (
    <div className="space-y-4">
      {/* Search + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search notes..." maxLength={200}
          className="flex-1 min-w-[200px] bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button size="sm" variant="outline" onClick={() => { setShowForm(v => !v); setEditingNote(null) }}>
          {showForm ? 'Cancel' : '+ New Note'}
        </Button>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setTagFilter(null)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              tagFilter === null ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                tagFilter === tag ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && !editingNote && (
        <NoteForm
          onSubmit={async (data) => { await onAction('POST', data); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editingNote && (
        <NoteForm
          initial={editingNote}
          onSubmit={handleEdit}
          onCancel={() => setEditingNote(null)}
        />
      )}

      {/* Notes list */}
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">{search || tagFilter ? 'No notes match your filters' : 'No notes yet'}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.map(note => {
            const tags = parseTags(note.tags_json)
            return (
              <div key={note.id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium text-foreground">{note.title}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {note.content || 'No content'}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                          {tag}
                        </span>
                      ))}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(note.updated_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="xs" variant="ghost" onClick={() => { setEditingNote(note); setShowForm(false) }}>
                      Edit
                    </Button>
                    <Button size="xs" variant="ghost" className="text-red-400" onClick={() => handleDelete(note.id)}>
                      Del
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
