'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('KnowledgeRag')

// ── Types ──────────────────────────────────────────────────────────────────

interface KnowledgeItem {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly source_type: string
  readonly author: string
  readonly tags: readonly string[]
  readonly created_at?: string
  readonly chunk_count?: number
}

interface SearchResult {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly score: number
  readonly source_url?: string
  readonly metadata?: Record<string, unknown>
}

interface SearchResponse {
  readonly success: boolean
  readonly results: readonly SearchResult[]
  readonly count: number
}

interface ItemsResponse {
  readonly success: boolean
  readonly items: readonly KnowledgeItem[]
  readonly count: number
}

interface IngestResponse {
  readonly success: boolean
  readonly id?: string
  readonly error?: string
}

type RagTab = 'documents' | 'search' | 'ingest'

const TAB_CONFIG: readonly { readonly key: RagTab; readonly label: string }[] = [
  { key: 'documents', label: 'Documents' },
  { key: 'search', label: 'Search / Query' },
  { key: 'ingest', label: 'Ingestion Pipeline' },
]

// ── API helpers ────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function apiPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Documents Tab ──────────────────────────────────────────────────────────

function DocumentsTab({ items, isLoading }: {
  readonly items: readonly KnowledgeItem[]
  readonly isLoading: boolean
}): React.ReactElement {
  if (isLoading) return <Loader variant="panel" label="Loading documents..." />

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <p className="text-sm">No documents ingested yet.</p>
        <p className="text-xs mt-1">Switch to the Ingestion Pipeline tab to add content.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
      <p className="text-xs text-zinc-500 mb-2">{items.length} document(s) in knowledge base</p>
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-zinc-100 truncate">
                {item.title || 'Untitled'}
              </h4>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{item.url}</p>
            </div>
            <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
              {item.source_type}
            </span>
          </div>
          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] text-blue-300">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {item.chunk_count !== undefined && (
            <p className="text-[10px] text-zinc-500 mt-1">{item.chunk_count} chunks</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Search Tab ─────────────────────────────────────────────────────────────

function SearchTab(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const data = await apiPost<SearchResponse>('/api/knowledge-rag', { query: query.trim(), limit: 10 })
      setResults(data.results)
      setHasSearched(true)
      log.info(`RAG search returned ${data.count} results`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed'
      setSearchError(message)
      log.error(`RAG search error: ${message}`)
    } finally {
      setSearching(false)
    }
  }, [query])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="Ask a question or search the knowledge base..."
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
        />
        <Button onClick={handleSearch} disabled={searching || !query.trim()} size="sm">
          {searching ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {searchError && (
        <div className="rounded-md border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">
          {searchError}
        </div>
      )}

      {searching && <Loader variant="panel" label="Searching knowledge base..." />}

      {!searching && hasSearched && results.length === 0 && (
        <div className="py-8 text-center text-sm text-zinc-500">
          No results found. Try a different query.
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          <p className="text-xs text-zinc-500">{results.length} result(s)</p>
          {results.map((result, idx) => (
            <div key={result.id ?? idx} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-medium text-zinc-100">{result.title || 'Untitled'}</h4>
                <span className="text-[10px] text-zinc-400">
                  score: {(result.score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-zinc-300 whitespace-pre-wrap line-clamp-4">
                {result.content}
              </p>
              {result.source_url && (
                <p className="text-[10px] text-blue-400 mt-1.5 truncate">
                  Source: {result.source_url}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── File reading helpers ───────────────────────────────────────────────────

/** Text-based extensions that can be read directly via FileReader.readAsText */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.html', '.htm', '.xml',
  '.yml', '.yaml', '.log', '.rst', '.tex', '.rtf', '.tsv',
])

/** Max file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // Strip the data:...;base64, prefix
      const base64 = dataUrl.split(',')[1] ?? ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// ── Ingest Tab ─────────────────────────────────────────────────────────────

function IngestTab({ onIngested }: {
  readonly onIngested: () => void
}): React.ReactElement {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceType, setSourceType] = useState('url')
  const [tags, setTags] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setFeedback({ type: 'error', message: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` })
      return
    }
    setSelectedFile(file)
    setFeedback(null)
    // Auto-fill title from filename (without extension)
    const ext = getFileExtension(file.name)
    const baseName = ext ? file.name.slice(0, -ext.length) : file.name
    if (!title.trim()) setTitle(baseName)
    // Auto-switch source type to document
    setSourceType('document')
  }, [title])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const clearFile = useCallback(() => {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleIngest = useCallback(async () => {
    const hasFile = selectedFile !== null
    if (!url.trim() && !content.trim() && !hasFile) return
    setIngesting(true)
    setFeedback(null)
    try {
      let fileContent = content.trim()
      let fileName: string | undefined
      let fileData: string | undefined

      if (hasFile) {
        const ext = getFileExtension(selectedFile.name)
        fileName = selectedFile.name
        if (TEXT_EXTENSIONS.has(ext)) {
          // Read text-based files directly
          fileContent = await readFileAsText(selectedFile)
        } else {
          // Binary files (PDF, DOCX, etc.) — send as base64 for backend extraction
          fileData = await readFileAsBase64(selectedFile)
        }
      }

      const payload: Record<string, unknown> = {
        url: url.trim(),
        title: title.trim(),
        content: fileContent,
        source_type: sourceType,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }
      // Include file metadata for binary files so backend can extract text
      if (fileData) {
        payload.file_data = fileData
        payload.file_name = fileName
      }

      const data = await apiPost<IngestResponse>('/api/knowledge-rag/ingest', payload)
      if (data.success) {
        setFeedback({ type: 'success', message: `Ingested successfully (ID: ${data.id})` })
        setUrl('')
        setTitle('')
        setContent('')
        setTags('')
        clearFile()
        onIngested()
        log.info(`Ingested document: ${data.id}`)
      } else {
        setFeedback({ type: 'error', message: data.error ?? 'Ingestion failed' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ingestion failed'
      setFeedback({ type: 'error', message })
      log.error(`Ingestion error: ${message}`)
    } finally {
      setIngesting(false)
    }
  }, [url, title, content, sourceType, tags, selectedFile, clearFile, onIngested])

  const inputClass = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none'
  const canSubmit = url.trim() || content.trim() || selectedFile

  return (
    <div className="space-y-4">
      {/* File upload drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : selectedFile
              ? 'border-green-600 bg-green-900/10'
              : 'border-zinc-600 hover:border-zinc-500 bg-zinc-800/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".txt,.md,.csv,.json,.html,.htm,.xml,.yml,.yaml,.log,.rst,.tex,.rtf,.tsv,.pdf,.docx,.doc"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileSelect(file)
          }}
        />
        {selectedFile ? (
          <div className="space-y-1">
            <p className="text-sm text-green-300 font-medium">{selectedFile.name}</p>
            <p className="text-xs text-zinc-400">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearFile() }}
              className="text-xs text-red-400 hover:text-red-300 underline mt-1"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-zinc-300">
              Drop a file here or click to browse
            </p>
            <p className="text-[10px] text-zinc-500">
              TXT, MD, CSV, JSON, HTML, XML, YAML, PDF, DOCX — max 10 MB
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-zinc-700" />
        <span className="text-[10px] text-zinc-500 uppercase">or enter manually</span>
        <div className="flex-1 h-px bg-zinc-700" />
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">URL</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Content (for direct text ingestion)</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste content here..." rows={4} className={inputClass + ' resize-y'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Source Type</label>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={inputClass}>
              <option value="url">URL</option>
              <option value="document">Document</option>
              <option value="article">Article</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Tags (comma-separated)</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ai, research, docs" className={inputClass} />
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-md border p-3 text-sm ${
          feedback.type === 'success'
            ? 'border-green-800 bg-green-900/20 text-green-300'
            : 'border-red-800 bg-red-900/20 text-red-300'
        }`}>
          {feedback.message}
        </div>
      )}

      <Button onClick={handleIngest} disabled={ingesting || !canSubmit} size="sm" className="w-full">
        {ingesting ? 'Ingesting...' : selectedFile ? `Ingest "${selectedFile.name}"` : 'Ingest Document'}
      </Button>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export function KnowledgeRagPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<RagTab>('documents')
  const [items, setItems] = useState<readonly KnowledgeItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<ItemsResponse>('/api/knowledge-rag')
      setItems(data.items)
      log.info(`Loaded ${data.count} knowledge items`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load documents'
      setError(message)
      log.error(`Load error: ${message}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  if (error && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <Button onClick={loadDocuments} size="sm" variant="outline">Retry</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-zinc-800/60 p-1">
        {TAB_CONFIG.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === key
                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'documents' && (
        <DocumentsTab items={items} isLoading={isLoading} />
      )}
      {activeTab === 'search' && <SearchTab />}
      {activeTab === 'ingest' && <IngestTab onIngested={loadDocuments} />}
    </div>
  )
}
