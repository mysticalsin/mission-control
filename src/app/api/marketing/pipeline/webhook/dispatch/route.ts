import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { dispatchPresentationWebhooks } from '@/app/api/marketing/pipeline/webhook/route'

/**
 * POST /api/marketing/pipeline/webhook/dispatch
 * Triggers webhook delivery for a completed pipeline job.
 * Called by the frontend when a job reaches 'completed' status.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { job_id?: string; quality_score?: number; download_url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const jobId = (body.job_id ?? '').trim()
  const qualityScore = Number(body.quality_score ?? 0)
  const downloadUrl = (body.download_url ?? '').trim()

  if (!jobId) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  }

  // Fire-and-forget — dispatch webhooks asynchronously
  void dispatchPresentationWebhooks({
    id: jobId,
    quality_score: qualityScore,
    download_url: downloadUrl,
  })

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
