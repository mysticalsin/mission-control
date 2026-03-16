import { NextResponse } from 'next/server'
import { existsSync } from 'node:fs'
import { APP_VERSION } from '@/lib/version'

// <!-- ADR: Use mysticalsin fork over builderz-labs original |
//   Context: Ultron is cloned from mysticalsin/mission-control, not builderz-labs |
//   Decision: Check releases from our actual fork; fall back to origin repo |
//   Trade-offs: We won't see builderz-labs releases, but avoids phantom updates -->
const GITHUB_OWNER = process.env.MC_GITHUB_OWNER ?? 'mysticalsin'
const GITHUB_REPO = process.env.MC_GITHUB_REPO ?? 'mission-control'
const GITHUB_RELEASES_URL =
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

/** Simple semver compare: returns 1 if a > b, -1 if a < b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    })

    // No releases published in our fork — not an error, just no update
    if (!res.ok) {
      return NextResponse.json(
        { updateAvailable: false, currentVersion: APP_VERSION },
        { headers: { 'Cache-Control': 'private, no-cache' } }
      )
    }

    const release = await res.json()
    const latestVersion = (release.tag_name ?? '').replace(/^v/, '')
    const updateAvailable = compareSemver(latestVersion, APP_VERSION) > 0

    const deploymentMode = existsSync('/.dockerenv') ? 'docker' : 'bare-metal'

    return NextResponse.json(
      {
        updateAvailable,
        currentVersion: APP_VERSION,
        latestVersion,
        releaseUrl: release.html_url ?? '',
        releaseNotes: release.body ?? '',
        deploymentMode,
      },
      { headers: { 'Cache-Control': 'private, no-cache' } }
    )
  } catch {
    // Network error — fail gracefully
    return NextResponse.json(
      { updateAvailable: false, currentVersion: APP_VERSION },
      { headers: { 'Cache-Control': 'private, no-cache' } }
    )
  }
}
