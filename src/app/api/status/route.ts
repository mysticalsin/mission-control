import { NextRequest, NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import { getDashboardData, getSystemStatus } from './status-helpers'
import { getGatewayStatus, getAvailableModels } from './gateway-helpers'
import { performHealthCheck, getCapabilities } from './health-helpers'

// Docker/Kubernetes health probes must reach this without auth/cookies.
// All other actions are protected via apiGuard below.
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.searchParams.get('action') === 'health') {
    const health = await performHealthCheck()
    return NextResponse.json(health)
  }

  return apiGuard({ role: 'viewer', rateLimit: 'read' }, async (req, auth) => {
    try {
      const action = req.nextUrl.searchParams.get('action') || 'overview'

      if (action === 'overview') {
        const status = await getSystemStatus(auth.user.workspace_id ?? 1)
        return NextResponse.json(status)
      }

      if (action === 'dashboard') {
        const data = await getDashboardData(auth.user.workspace_id ?? 1)
        return NextResponse.json(data)
      }

      if (action === 'gateway') {
        const gatewayStatus = await getGatewayStatus()
        return NextResponse.json(gatewayStatus)
      }

      if (action === 'models') {
        const models = await getAvailableModels()
        return NextResponse.json({ models })
      }

      if (action === 'capabilities') {
        const capabilities = await getCapabilities(req)
        return NextResponse.json(capabilities)
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    } catch (error) {
      logger.error({ err: error }, 'Status API error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })(request)
}
