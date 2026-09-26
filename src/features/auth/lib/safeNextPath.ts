// Only same-origin paths may be used as a post-login redirect (API SPEC.md: /auth/callback).
// Rejects absolute URLs, protocol-relative "//evil.com", backslash tricks like "/\evil.com"
// and control characters.
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  if (next.includes('\\') || /[\u0000-\u001f]/.test(next)) return fallback
  return next
}
