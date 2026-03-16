import path from 'node:path'

export type OpenClawDoctorLevel = 'healthy' | 'warning' | 'error'
export type OpenClawDoctorCategory = 'config' | 'state' | 'security' | 'general'

export interface OpenClawDoctorStatus {
  level: OpenClawDoctorLevel
  category: OpenClawDoctorCategory
  healthy: boolean
  summary: string
  issues: string[]
  canFix: boolean
  raw: string
}

function normalizeLine(line: string): string {
  return line
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/^[\s│┃║┆┊╎╏]+/, '')
    .trim()
}

function isSessionAgingLine(line: string): boolean {
  return /^agent:[\w:-]+ \(\d+[mh] ago\)$/i.test(line)
}

function isDecorativeLine(line: string): boolean {
  return /^[▄█▀░\s]+$/.test(line) || /openclaw doctor/i.test(line) || /🦞\s*openclaw\s*🦞/i.test(line)
}

function isStateDirectoryListLine(line: string): boolean {
  return /^(?:\$OPENCLAW_HOME(?:\/\.openclaw)?|~\/\.openclaw|\/\S+)$/.test(line)
}

// <!-- ADR: Filter non-actionable lines from issue extraction |
//   Context: openclaw doctor outputs informational status, fix suggestions, and
//     positive confirmations as bullet points — the parser was counting them as issues |
//   Decision: Classify these as informational so the banner only shows real problems |
//   Trade-offs: May over-filter if openclaw changes its output format, but reduces
//     false-positive warnings significantly -->
function isInformationalLine(line: string): boolean {
  // Positive confirmations — no action needed
  if (/^no\s+.+\s+(detected|found|warnings?|issues?|errors?)/i.test(line)) return true

  // Command/fix suggestions — not issues themselves
  if (/^(run:|verify:|configure\s+|to disable:)/i.test(line)) return true

  // Environment variable setup hints
  if (/^set\s+[A-Z_]+/i.test(line)) return true

  // Gateway status lines — informational, not fixable by doctor
  if (/^gateway\s+(not running|service not installed|target:)/i.test(line)) return true

  // "For local embeddings" / "For X:" suggestion lines
  if (/^for\s+\w+.*:/i.test(line)) return true

  // Config credential suggestions
  if (/^configure\s+credentials:/i.test(line)) return true

  return false
}

function normalizeFsPath(candidate: string): string {
  return path.resolve(candidate.trim())
}

function normalizeDisplayedPath(candidate: string, stateDir: string): string {
  const trimmed = candidate.trim()
  if (!trimmed) return trimmed
  if (trimmed === '~/.openclaw') return stateDir
  if (trimmed === '$OPENCLAW_HOME' || trimmed === '$OPENCLAW_HOME/.openclaw') return stateDir
  return trimmed
}

function stripForeignStateDirectoryWarning(rawOutput: string, stateDir?: string): string {
  if (!stateDir) return rawOutput

  const normalizedStateDir = normalizeFsPath(stateDir)
  const lines = rawOutput.split(/\r?\n/)
  const kept: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const normalized = normalizeLine(line)

    if (!/multiple state directories detected/i.test(normalized)) {
      kept.push(line)
      continue
    }

    const blockLines = [line]
    let cursor = index + 1
    while (cursor < lines.length) {
      const nextLine = lines[cursor] ?? ''
      const nextNormalized = normalizeLine(nextLine)
      if (!nextNormalized) {
        blockLines.push(nextLine)
        cursor += 1
        continue
      }
      if (/^(active state dir:|[-*]\s+(?:\/|~\/|\$OPENCLAW_HOME)|\|)/i.test(nextNormalized)) {
        blockLines.push(nextLine)
        cursor += 1
        continue
      }
      break
    }

    const listedDirs = blockLines
      .map(normalizeLine)
      .filter(entry => /^[-*]\s+/.test(entry))
      .map(entry => entry.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .map(entry => normalizeDisplayedPath(entry, normalizedStateDir))

    const foreignDirs = listedDirs.filter(entry => normalizeFsPath(entry) !== normalizedStateDir)
    const onlyForeignDirs = foreignDirs.length > 0

    if (!onlyForeignDirs) {
      kept.push(...blockLines)
    }

    index = cursor - 1
  }

  return kept.join('\n')
}

function detectCategory(raw: string, issues: string[]): OpenClawDoctorCategory {
  const haystack = `${raw}\n${issues.join('\n')}`.toLowerCase()

  if (/invalid config|config invalid|unrecognized key|invalid option/.test(haystack)) {
    return 'config'
  }

  if (/state integrity|orphan transcript|multiple state directories|session history/.test(haystack)) {
    return 'state'
  }

  if (/security audit|channel security|security /.test(haystack)) {
    return 'security'
  }

  return 'general'
}

export function parseOpenClawDoctorOutput(
  rawOutput: string,
  exitCode = 0,
  options: { stateDir?: string } = {}
): OpenClawDoctorStatus {
  const raw = stripForeignStateDirectoryWarning(rawOutput.trim(), options.stateDir).trim()
  const lines = raw
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  const issues = lines
    .filter(line => /^[-*]\s+/.test(line))
    .map(line => line.replace(/^[-*]\s+/, '').trim())
    .filter(line =>
      !isSessionAgingLine(line) &&
      !isStateDirectoryListLine(line) &&
      !isInformationalLine(line)
    )

  // <!-- ADR: Test warning keywords against filtered issues, not raw output |
  //   Context: Raw output contains "No channel security warnings detected" which
  //     falsely matched "warnings", and "Run openclaw doctor --fix" matched "fix" |
  //   Decision: Use issues text (post-filtering) for warning detection |
  //   Trade-offs: Slightly less sensitive, but eliminates false positives from
  //     positive confirmations and fix suggestions in raw output -->
  const issuesText = issues.join('\n')
  const mentionsWarnings = /\bwarning|warnings|problem|problems|invalid config\b/i.test(issuesText)
  const mentionsHealthy = /\bok\b|\bhealthy\b|\bno issues\b|\bvalid\b|\bdoctor complete\b|\bno\s+\w+.*detected\b/i.test(raw)

  let level: OpenClawDoctorLevel = 'healthy'
  // Match "error" only as a standalone word, not in "Errors: 0" stats lines
  if (exitCode !== 0 || /invalid config|\bfailed\b/i.test(raw) || /\berrors?\b(?!\s*:\s*0)/i.test(raw)) {
    level = 'error'
  } else if (issues.length > 0 || mentionsWarnings) {
    level = 'warning'
  } else if (!mentionsHealthy && lines.length > 0) {
    level = 'warning'
  }

  const category = detectCategory(raw, issues)

  const summary =
    level === 'healthy'
      ? 'OpenClaw doctor reports a healthy configuration.'
      : issues[0] ||
        lines.find(line =>
          !/^run:/i.test(line) &&
          !/^file:/i.test(line) &&
          !isSessionAgingLine(line) &&
          !isDecorativeLine(line)
        ) ||
        'OpenClaw doctor reported configuration issues.'

  const canFix = level !== 'healthy' || /openclaw doctor --fix/i.test(raw)

  return {
    level,
    category,
    healthy: level === 'healthy',
    summary,
    issues,
    canFix,
    raw,
  }
}
