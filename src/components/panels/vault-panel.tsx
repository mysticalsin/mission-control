'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('VaultPanel')

// ---------------------------------------------------------------------------
// Types — all readonly to enforce immutability
// ---------------------------------------------------------------------------

interface VaultKey {
  readonly id: number
  readonly provider: string
  readonly masked_key: string
  readonly encrypted: boolean
  readonly created_at: string | null
  readonly last_accessed: string | null
}

interface VaultStatus {
  readonly encryption_available: boolean
  readonly encryption_method: string
  readonly master_key_set: boolean
  readonly stored_keys: number
  readonly audit_entries: number
  readonly broken_keys: ReadonlyArray<{ readonly id: number; readonly provider: string }>
  readonly healthy: boolean
}

type TabId = 'keys' | 'add' | 'status'

const TABS: ReadonlyArray<{ readonly id: TabId; readonly label: string }> = [
  { id: 'keys', label: 'Keys List' },
  { id: 'add', label: 'Add Key' },
  { id: 'status', label: 'Vault Status' },
]

// ---------------------------------------------------------------------------
// Shared fetch helper with 10s timeout
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error((body as Record<string, string>).error ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

function extractMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

// Reusable error banner with retry
function ErrorBanner({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }): React.ReactElement {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>Retry</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KeysTab — lists stored keys with masked values
// ---------------------------------------------------------------------------

function KeysTab(): React.ReactElement {
  const [keys, setKeys] = useState<ReadonlyArray<VaultKey>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadKeys = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try { setKeys(await fetchJson<ReadonlyArray<VaultKey>>('/api/vault')) }
    catch (err) { const m = extractMessage(err, 'Failed to load keys'); log.error(m); setError(m) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadKeys() }, [loadKeys])

  const handleDelete = useCallback(async (id: number): Promise<void> => {
    if (!confirm('Permanently delete this key? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetchJson('/api/vault/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setKeys(prev => prev.filter(k => k.id !== id))
    } catch (err) { const m = extractMessage(err, 'Delete failed'); log.error(m); setError(m) }
    finally { setDeletingId(null) }
  }, [])

  if (loading) return <Loader variant="inline" />
  if (error) return <ErrorBanner message={error} onRetry={loadKeys} />
  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
        <p className="text-sm">No API keys stored in the vault yet.</p>
        <p className="text-xs">Switch to the &quot;Add Key&quot; tab to store your first key.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {keys.map(k => (
        <div key={k.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{k.provider}</p>
            <p className="font-mono text-xs text-muted-foreground">{k.masked_key}</p>
            {k.created_at && (
              <p className="mt-1 text-xs text-muted-foreground">Added {new Date(k.created_at).toLocaleDateString()}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {k.encrypted && <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">AES-256</span>}
            <Button variant="destructive" size="sm" disabled={deletingId === k.id} onClick={() => void handleDelete(k.id)}>
              {deletingId === k.id ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddKeyTab — form to store a new encrypted key
// ---------------------------------------------------------------------------

function AddKeyTab({ onAdded }: { readonly onAdded: () => void }): React.ReactElement {
  const [form, setForm] = useState({ provider: '', key: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = useCallback(async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!form.provider.trim() || !form.key.trim()) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const result = await fetchJson<{ readonly provider: string }>('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: form.provider.trim(), key: form.key.trim() }),
      })
      setSuccess(`Key stored for "${result.provider}" with AES-256 encryption.`)
      setForm({ provider: '', key: '' })
      onAdded()
    } catch (err) { const m = extractMessage(err, 'Failed to store key'); log.error(m); setError(m) }
    finally { setSaving(false) }
  }, [form, onAdded])

  return (
    <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="vault-provider" className="mb-1 block text-sm font-medium text-foreground">Provider</label>
        <input id="vault-provider" type="text" placeholder="e.g. openai, anthropic, google" value={form.provider}
          onChange={e => setForm(prev => ({ ...prev, provider: e.target.value }))} required maxLength={100}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <div>
        <label htmlFor="vault-key" className="mb-1 block text-sm font-medium text-foreground">API Key</label>
        <input id="vault-key" type="password" placeholder="sk-..." value={form.key}
          onChange={e => setForm(prev => ({ ...prev, key: e.target.value }))} required minLength={8}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        <p className="mt-1 text-xs text-muted-foreground">
          Keys are encrypted at rest using AES-256 (Fernet). Never stored in plaintext.
        </p>
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}
      <Button type="submit" disabled={saving || !form.provider.trim() || !form.key.trim()}>
        {saving ? 'Encrypting & Storing...' : 'Store Key'}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// StatusTab — vault health and encryption info
// ---------------------------------------------------------------------------

function StatusTab(): React.ReactElement {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)

  const loadStatus = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null)
    try { setStatus(await fetchJson<VaultStatus>('/api/vault/status')) }
    catch (err) { const m = extractMessage(err, 'Failed to load vault status'); log.error(m); setError(m) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const handleRotate = useCallback(async (): Promise<void> => {
    if (!confirm('Re-encrypt all keys with the current master key?')) return
    setRotating(true)
    try { await fetchJson('/api/vault/rotate', { method: 'POST' }); await loadStatus() }
    catch (err) { const m = extractMessage(err, 'Rotation failed'); log.error(m); setError(m) }
    finally { setRotating(false) }
  }, [loadStatus])

  if (loading) return <Loader variant="inline" />
  if (error) return <ErrorBanner message={error} onRetry={loadStatus} />
  if (!status) return <div className="py-12 text-center text-sm text-muted-foreground">No vault status available.</div>

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${status.healthy ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        <p className={`text-sm font-medium ${status.healthy ? 'text-emerald-400' : 'text-amber-400'}`}>
          {status.healthy ? 'Vault is healthy' : 'Vault has issues'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Encryption" value={status.encryption_method} />
        <StatCard label="Stored Keys" value={String(status.stored_keys)} />
        <StatCard label="Audit Entries" value={String(status.audit_entries)} />
        <StatCard label="Master Key" value={status.master_key_set ? 'Custom' : 'Machine-derived'} />
        <StatCard label="Encryption Active" value={status.encryption_available ? 'Yes' : 'No'} />
        <StatCard label="Broken Keys" value={String(status.broken_keys.length)} highlight={status.broken_keys.length > 0} />
      </div>
      {status.broken_keys.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="mb-2 text-sm font-medium text-destructive">Undecryptable keys (master key mismatch):</p>
          <ul className="space-y-1">
            {status.broken_keys.map(bk => (
              <li key={bk.id} className="text-xs text-destructive/80">ID {bk.id}: {bk.provider}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-sm font-medium text-foreground">Key Rotation</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Re-encrypts all stored keys with the current VAULT_MASTER_KEY. Use after changing the master key or migrating environments.
        </p>
        <Button variant="outline" size="sm" disabled={rotating || status.stored_keys === 0} onClick={() => void handleRotate()}>
          {rotating ? 'Rotating...' : 'Rotate Encryption Keys'}
        </Button>
      </div>
    </div>
  )
}

function StatCard({ label, value, highlight = false }: { readonly label: string; readonly value: string; readonly highlight?: boolean }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${highlight ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VaultPanel — main export, orchestrates tabs
// ---------------------------------------------------------------------------

export function VaultPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('keys')
  // Incrementing key forces KeysTab to remount and re-fetch after adding a key
  const [keysVersion, setKeysVersion] = useState(0)
  const handleKeyAdded = useCallback((): void => {
    setKeysVersion(v => v + 1)
    setActiveTab('keys')
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Vault</h2>
        <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">AES-256 Encrypted</span>
      </div>
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {TABS.map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'keys' && <KeysTab key={keysVersion} />}
        {activeTab === 'add' && <AddKeyTab onAdded={handleKeyAdded} />}
        {activeTab === 'status' && <StatusTab />}
      </div>
    </div>
  )
}
