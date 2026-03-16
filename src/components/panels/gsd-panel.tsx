'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('GSD')

// ── Types ────────────────────────────────────────────────────────────────────

type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived'
type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'
type Priority = 'low' | 'medium' | 'high' | 'critical'
type Tab = 'projects' | 'board' | 'tasks'

export interface GsdProject {
  readonly id: number
  readonly name: string
  readonly description: string
  readonly status: ProjectStatus
  readonly priority: Priority
  readonly progress: number
  readonly due_date: string | null
  readonly task_count: number
  readonly done_count: number
  readonly phase_count: number
}

export interface GsdTask {
  readonly id: number
  readonly project_id: number
  readonly phase_id: number | null
  readonly title: string
  readonly description: string
  readonly status: TaskStatus
  readonly assignee: string
  readonly priority: Priority
  readonly due_date: string | null
}

// ── Shared constants ─────────────────────────────────────────────────────────

export const INPUT = 'px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const DIM = 'bg-secondary text-muted-foreground border-border'
const GREEN = 'bg-green-500/20 text-green-400 border-green-500/30'
const AMBER = 'bg-amber-500/20 text-amber-400 border-amber-500/30'
const BLUE = 'bg-blue-500/20 text-blue-400 border-blue-500/30'
const RED = 'bg-red-500/20 text-red-400 border-red-500/30'

const STATUS_BADGE: Record<ProjectStatus, string> = { active: GREEN, on_hold: AMBER, completed: BLUE, archived: DIM }
const TASK_BADGE: Record<TaskStatus, string> = { todo: DIM, in_progress: BLUE, review: 'bg-purple-500/20 text-purple-400 border-purple-500/30', done: GREEN, blocked: RED }
const PRIORITY_BADGE: Record<Priority, string> = { low: DIM, medium: BLUE, high: AMBER, critical: RED }

// ── Micro components ─────────────────────────────────────────────────────────

export const Badge = ({ label, cls }: { label: string; cls: string }): React.JSX.Element =>
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>

export const Empty = ({ msg }: { msg: string }): React.JSX.Element =>
  <div className="text-center py-12 text-muted-foreground text-sm">{msg}</div>

// ── Main component ───────────────────────────────────────────────────────────

export function GsdPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('projects')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<GsdProject[]>([])
  const [tasks, setTasks] = useState<GsdTask[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  const loadProjects = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/gsd?tab=projects')
    if (!res.ok) throw new Error('Failed to load projects')
    const data = await res.json()
    setProjects(data.projects ?? [])
  }, [])

  const loadTasks = useCallback(async (): Promise<void> => {
    const url = selectedProjectId
      ? `/api/gsd?tab=tasks&project_id=${selectedProjectId}`
      : '/api/gsd?tab=tasks'
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to load tasks')
    const data = await res.json()
    setTasks(data.tasks ?? [])
  }, [selectedProjectId])

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true); setError(null)
    try {
      if (tab === 'projects') await loadProjects()
      else await Promise.all([loadProjects(), loadTasks()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      log.error('GSD data load failed:', err)
    } finally { setIsLoading(false) }
  }, [tab, loadProjects, loadTasks])

  useEffect(() => { loadData() }, [loadData])

  const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'projects', label: 'Projects' }, { key: 'board', label: 'Board' }, { key: 'tasks', label: 'Tasks' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">GSD</h1>
            <p className="text-muted-foreground mt-1">Project management — Get Stuff Done</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={loadData} variant="outline" size="sm">Refresh</Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="text-center py-12">
          <div className="text-lg text-red-400 mb-2">Failed to load data</div>
          <div className="text-sm text-muted-foreground mb-4">{error}</div>
          <Button onClick={loadData} variant="outline" size="sm">Retry</Button>
        </div>
      ) : isLoading ? (
        <Loader variant="panel" label="Loading GSD data" />
      ) : tab === 'projects' ? (
        <ProjectsTab projects={projects} onRefresh={loadData} onSelectProject={setSelectedProjectId} />
      ) : tab === 'board' ? (
        <BoardTab tasks={tasks} projects={projects} onRefresh={loadData} selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} />
      ) : (
        <TasksTab tasks={tasks} projects={projects} onRefresh={loadData} selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} />
      )}
    </div>
  )
}

// ── Projects tab ─────────────────────────────────────────────────────────────

function ProjectsTab({
  projects, onRefresh, onSelectProject,
}: {
  projects: GsdProject[]
  onRefresh: () => void
  onSelectProject: (id: number | null) => void
}): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', priority: 'medium' as Priority, due_date: '' })

  const handleCreate = async (): Promise<void> => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/gsd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_project', name: form.name, description: form.description, priority: form.priority, due_date: form.due_date || undefined }),
      })
      if (!res.ok) throw new Error('Failed to create project')
      setForm({ name: '', description: '', priority: 'medium', due_date: '' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create project failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Project'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Project</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <select className={INPUT} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Priority })}>
              {(['low', 'medium', 'high', 'critical'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className={INPUT} type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            <textarea className={`${INPUT} col-span-2 resize-none`} rows={2} placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Create Project'}</Button>
        </div>
      )}
      {projects.length === 0 ? <Empty msg="No projects yet — create one to get started" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id}
              className="rounded-lg border border-border bg-card p-4 space-y-3 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => onSelectProject(p.id)}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground leading-snug">{p.name}</span>
                <Badge label={p.status.replace('_', ' ')} cls={STATUS_BADGE[p.status]} />
              </div>
              {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={p.priority} cls={PRIORITY_BADGE[p.priority]} />
                {p.due_date && <span className="text-xs text-muted-foreground">Due {p.due_date}</span>}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{p.done_count}/{p.task_count} tasks done</span>
                  <span>{p.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Board tab ────────────────────────────────────────────────────────────────

const BOARD_COLUMNS: ReadonlyArray<{ key: TaskStatus; label: string }> = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
  { key: 'blocked', label: 'Blocked' },
]

function BoardTab({
  tasks, projects, onRefresh, selectedProjectId, onSelectProject,
}: {
  tasks: GsdTask[]
  projects: GsdProject[]
  onRefresh: () => void
  selectedProjectId: number | null
  onSelectProject: (id: number | null) => void
}): React.JSX.Element {
  const moveTask = async (taskId: number, status: TaskStatus): Promise<void> => {
    try {
      const res = await fetch('/api/gsd', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'task', id: taskId, status }) })
      if (!res.ok) throw new Error('Failed to move task')
      onRefresh()
    } catch (err) { log.error('Move task failed:', err) }
  }
  const filtered = selectedProjectId ? tasks.filter(t => t.project_id === selectedProjectId) : tasks
  const projectName = (id: number): string => projects.find(p => p.id === id)?.name ?? `Project ${id}`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select className={`${INPUT} max-w-xs`} value={selectedProjectId ?? ''} onChange={e => onSelectProject(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? <Empty msg="No tasks — add some from the Tasks tab" /> : (
        <div className="grid grid-cols-5 gap-3 min-w-0">
          {BOARD_COLUMNS.map(col => {
            const colTasks = filtered.filter(t => t.status === col.key)
            return (
              <div key={col.key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Badge label={col.label} cls={TASK_BADGE[col.key]} />
                  <span className="text-xs text-muted-foreground ml-auto">{colTasks.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {colTasks.map(t => (
                    <div key={t.id} className="rounded-md border border-border bg-card p-3 space-y-2 text-sm">
                      <div className="font-medium text-foreground leading-snug line-clamp-2">{t.title}</div>
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground truncate max-w-[80px]">{projectName(t.project_id)}</span>
                        <Badge label={t.priority} cls={PRIORITY_BADGE[t.priority]} />
                      </div>
                      {t.assignee && <div className="text-xs text-muted-foreground truncate">{t.assignee}</div>}
                      <div className="flex gap-1 flex-wrap">
                        {BOARD_COLUMNS.filter(c => c.key !== col.key).map(c => (
                          <button key={c.key} onClick={() => moveTask(t.id, c.key)}
                            className="text-xs text-muted-foreground hover:text-primary transition-colors px-1">
                            → {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tasks tab ────────────────────────────────────────────────────────────────

function TasksTab({
  tasks, projects, onRefresh, selectedProjectId, onSelectProject,
}: {
  tasks: GsdTask[]
  projects: GsdProject[]
  onRefresh: () => void
  selectedProjectId: number | null
  onSelectProject: (id: number | null) => void
}): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [form, setForm] = useState({ project_id: selectedProjectId ? String(selectedProjectId) : '', title: '', assignee: '', priority: 'medium' as Priority })

  const filtered = tasks.filter(t => {
    if (selectedProjectId && t.project_id !== selectedProjectId) return false
    if (statusFilter && t.status !== statusFilter) return false
    return true
  })

  const handleCreate = async (): Promise<void> => {
    if (!form.title.trim() || !form.project_id) return
    setBusy(true)
    try {
      const res = await fetch('/api/gsd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_task', project_id: Number(form.project_id), title: form.title, assignee: form.assignee, priority: form.priority }),
      })
      if (!res.ok) throw new Error('Failed to create task')
      setForm({ project_id: form.project_id, title: '', assignee: '', priority: 'medium' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create task failed:', err) } finally { setBusy(false) }
  }

  const projectName = (id: number): string => projects.find(p => p.id === id)?.name ?? `Project ${id}`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select className={`${INPUT} max-w-[200px]`} value={selectedProjectId ?? ''} onChange={e => onSelectProject(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={`${INPUT} max-w-[160px]`} value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskStatus | '')}>
          <option value="">All statuses</option>
          {(['todo', 'in_progress', 'review', 'done', 'blocked'] as TaskStatus[]).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <Button size="sm" onClick={() => setShowForm(v => !v)} className="ml-auto">{showForm ? 'Cancel' : '+ Add Task'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Task</div>
          <div className="grid grid-cols-2 gap-3">
            <select className={INPUT} value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
              <option value="">Select project *</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={INPUT} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Priority })}>
              {(['low', 'medium', 'high', 'critical'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className={`${INPUT} col-span-2`} placeholder="Task title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <input className={INPUT} placeholder="Assignee" value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.title.trim() || !form.project_id}>{busy ? 'Saving…' : 'Create Task'}</Button>
        </div>
      )}
      {filtered.length === 0 ? <Empty msg="No tasks found" /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>{['Title', 'Project', 'Status', 'Priority', 'Assignee'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(t => (
                <tr key={t.id} className="bg-card hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground max-w-[240px] truncate">{t.title}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{projectName(t.project_id)}</td>
                  <td className="px-4 py-2"><Badge label={t.status.replace('_', ' ')} cls={TASK_BADGE[t.status]} /></td>
                  <td className="px-4 py-2"><Badge label={t.priority} cls={PRIORITY_BADGE[t.priority]} /></td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{t.assignee || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
