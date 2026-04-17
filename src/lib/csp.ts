export function buildMissionControlCsp(input: { nonce: string; googleEnabled: boolean }): string {
  const { nonce, googleEnabled } = input
  // Dev mode requires relaxed directives: React needs eval() for stack traces,
  // and Next.js devtools inject <style> elements without nonces.
  const isDev = process.env.NODE_ENV !== 'production'

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' blob:${isDev ? " 'unsafe-eval'" : ''}${googleEnabled ? ' https://accounts.google.com' : ''}`,
    // Nonce restricts <style> tag injection to only those emitted by the server.
    // In production: nonce enforced — 'unsafe-inline' is absent intentionally.
    // In dev: nonce is dropped from style-src-elem so 'unsafe-inline' actually works
    // (per CSP spec, 'unsafe-inline' is silently ignored whenever a nonce is present).
    // This allows Next.js devtools to inject unnonce-able <style> elements without spamming errors.
    `style-src 'self' 'nonce-${nonce}'`,
    isDev ? `style-src-elem 'self' 'unsafe-inline'` : `style-src-elem 'self' 'nonce-${nonce}'`,
    // style-src-attr governs inline style="..." attributes on DOM elements.
    // Nonces cannot be applied to element attributes, so 'unsafe-inline' is required here.
    // JSX style={{}} props render as element attributes and are covered by this directive.
    `style-src-attr 'unsafe-inline'`,
    `connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:* https://cdn.jsdelivr.net`,
    `img-src 'self' data: blob:${googleEnabled ? ' https://*.googleusercontent.com https://lh3.googleusercontent.com' : ''}`,
    `font-src 'self' data:`,
    `frame-src 'self'${googleEnabled ? ' https://accounts.google.com' : ''}`,
    `worker-src 'self' blob:`,
  ].join('; ')
}

export function buildNonceRequestHeaders(input: {
  headers: Headers
  nonce: string
  googleEnabled: boolean
}): Headers {
  const requestHeaders = new Headers(input.headers)
  const csp = buildMissionControlCsp({ nonce: input.nonce, googleEnabled: input.googleEnabled })

  requestHeaders.set('x-nonce', input.nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  return requestHeaders
}
