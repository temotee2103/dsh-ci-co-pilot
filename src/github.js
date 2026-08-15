// GitHub REST API client for dsh-ci-co-pilot.
// Built directly on fetch: zero runtime dependencies, honors AbortSignal,
// and works both inside the harness sandbox and in plain Node.
// https://docs.github.com/en/rest

const DEFAULT_API_BASE = 'https://api.github.com'
const DEFAULT_USER_AGENT = 'dsh-ci-co-pilot'

export class GitHubError extends Error {
  constructor(message, { method, path, status, body } = {}) {
    super(message)
    this.name = 'GitHubError'
    this.method = method
    this.path = path
    this.status = status
    this.body = body
  }
}

/** Pick a subset of keys from an object, skipping undefined values. */
export function pick(obj, keys) {
  const out = {}
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * Normalize a user-supplied repo to "owner/name".
 * Accepts "owner/name", a full https://github.com/owner/name URL, or undefined (falls back to the configured repo).
 */
export function resolveRepo(input, fallback = '') {
  const raw = (input ?? fallback ?? '').trim()
  let value = raw
  const urlMatch = raw.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?\/?$/)
  if (urlMatch) value = urlMatch[1]
  if (!value) {
    throw new GitHubError('A repo "owner/name" is required: pass `repo` to the tool or set `repo` in the plugin config.')
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new GitHubError(`Invalid repo "${value}": expected "owner/name".`)
  }
  return value
}

/** Trim a possibly huge text to the last `maxLines` lines, keeping a bounded character count per line. */
export function tailLines(text, maxLines, maxCharsPerLine = 500) {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const trimmed = lines.map((line) => (line.length > maxCharsPerLine ? `${line.slice(0, maxCharsPerLine)}…` : line))
  return trimmed.slice(-maxLines).join('\n')
}

export function daysSince(isoDate, now = new Date()) {
  if (!isoDate) return null
  const then = new Date(isoDate)
  if (Number.isNaN(then.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000))
}

export function dateOnly(isoDate) {
  if (!isoDate) return null
  const d = new Date(isoDate)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * Create a GitHub API client.
 * @param {{ token?: string, baseUrl?: string, userAgent?: string }} options
 */
export function createClient({ token, baseUrl = DEFAULT_API_BASE, userAgent = DEFAULT_USER_AGENT } = {}) {
  /**
   * Perform one REST request.
   * @returns {Promise<any>} parsed JSON, plain text, or null for 204.
   */
  async function request(method, path, { query, body, headers, signal } = {}) {
    const url = new URL(baseUrl + path)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    let response
    try {
      response = await fetch(url, {
        method,
        signal,
        headers: {
          accept: headers?.accept ?? 'application/vnd.github+json',
          'user-agent': userAgent,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      if (error instanceof GitHubError) throw error
      throw new GitHubError(`GitHub request failed: ${error.message}`, { method, path })
    }
    if (!response.ok) {
      let detail = ''
      try {
        detail = await response.text()
      } catch {
        /* keep empty detail */
      }
      throw new GitHubError(
        `GitHub API ${response.status} ${method} ${path}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
        { method, path, status: response.status, body: detail.slice(0, 2000) },
      )
    }
    if (response.status === 204) return null
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('json')) return response.json()
    return response.text()
  }

  /**
   * Collect pages of a list endpoint until a short page, total_count, or `limit` is reached.
   * Handles plain arrays, `items` (search) and `check_runs` responses.
   */
  async function collect(method, path, { query = {}, limit = 100, perPage = 100, signal } = {}) {
    const items = []
    let page = 1
    while (items.length < limit && page <= 50) {
      const wanted = Math.min(perPage, limit - items.length)
      const pageQuery = { ...query, per_page: wanted, page }
      const result = await request(method, path, { query: pageQuery, signal })
      const batch = Array.isArray(result) ? result : result.items ?? result.check_runs ?? []
      items.push(...batch)
      if (batch.length < wanted) break
      if (Number.isInteger(result?.total_count) && items.length >= result.total_count) break
      page += 1
    }
    return items.slice(0, limit)
  }

  return { request, collect, baseUrl }
}
