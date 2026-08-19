import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient, daysSince, dateOnly, resolveRepo, tailLines } from '../src/github.js'

describe('resolveRepo', () => {
  it('accepts owner/name', () => {
    expect(resolveRepo('owner/repo')).toBe('owner/repo')
  })
  it('accepts a full URL', () => {
    expect(resolveRepo('https://github.com/owner/repo.git')).toBe('owner/repo')
  })
  it('falls back to the configured repo', () => {
    expect(resolveRepo(undefined, 'cfg/repo')).toBe('cfg/repo')
  })
  it('rejects a missing repo', () => {
    expect(() => resolveRepo(undefined, '')).toThrow(/owner\/name/)
  })
  it('rejects malformed repos', () => {
    expect(() => resolveRepo('nope')).toThrow(/Invalid repo/)
  })
})

describe('tailLines', () => {
  it('keeps only the last N lines', () => {
    expect(tailLines('a\nb\nc\nd\ne', 2)).toBe('d\ne')
  })
  it('truncates overlong lines', () => {
    const text = 'x'.repeat(600)
    expect(tailLines(text, 1).length).toBeLessThanOrEqual(501)
  })
  it('handles empty input', () => {
    expect(tailLines('', 5)).toBe('')
  })
})

describe('daysSince', () => {
  it('computes whole days', () => {
    expect(daysSince('2026-08-01T00:00:00Z', new Date('2026-08-16T00:00:00Z'))).toBe(15)
  })
  it('returns null for invalid input', () => {
    expect(daysSince(null)).toBeNull()
    expect(daysSince('not-a-date')).toBeNull()
  })
})

describe('dateOnly', () => {
  it('returns YYYY-MM-DD', () => {
    expect(dateOnly('2026-08-16T10:30:00Z')).toBe('2026-08-16')
  })
  it('returns null for invalid input', () => {
    expect(dateOnly('nope')).toBeNull()
  })
})

describe('createClient.request', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockFetch(response) {
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  function jsonResponse(status, body) {
    return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body }
  }

  it('returns parsed JSON and sends the auth header when a token is set', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true }))
    const client = createClient({ token: 't0ken' })
    await expect(client.request('GET', '/repos/a/b')).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.headers.authorization).toBe('Bearer t0ken')
    expect(init.headers['user-agent']).toBe('dsh-ci-co-pilot')
    expect(String(url)).toContain('api.github.com/repos/a/b')
  })

  it('throws GitHubError with status on non-ok responses', async () => {
    mockFetch({ ok: false, status: 404, headers: { get: () => 'application/json' }, text: async () => 'Not Found' })
    const client = createClient()
    await expect(client.request('GET', '/repos/a/b')).rejects.toMatchObject({ name: 'GitHubError', status: 404 })
  })

  it('returns null on 204', async () => {
    mockFetch({ ok: true, status: 204, headers: { get: () => '' } })
    const client = createClient()
    await expect(client.request('DELETE', '/repos/a/b')).resolves.toBeNull()
  })

  it('returns text for non-JSON content types', async () => {
    mockFetch({ ok: true, status: 200, headers: { get: () => 'text/plain' }, text: async () => 'hello' })
    const client = createClient()
    await expect(client.request('GET', '/x')).resolves.toBe('hello')
  })

  it('serializes query parameters', async () => {
    const fetchMock = mockFetch(jsonResponse(200, []))
    const client = createClient()
    await client.request('GET', '/repos/a/b/issues', { query: { state: 'open', per_page: 10 } })
    const url = fetchMock.mock.calls[0][0]
    expect(url.searchParams.get('state')).toBe('open')
    expect(url.searchParams.get('per_page')).toBe('10')
  })

  it('posts a JSON body for mutations', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { id: 7 }))
    const client = createClient({ token: 't' })
    await client.request('POST', '/repos/a/b/issues/1/comments', { body: { body: 'hi' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ body: 'hi' })
    expect(init.headers['content-type']).toBe('application/json')
    expect(String(url)).toContain('/repos/a/b/issues/1/comments')
  })

  it('honors a custom accept header', async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, headers: { get: () => 'text/plain' }, text: async () => 'diff' })
    const client = createClient()
    await client.request('GET', '/repos/a/b/pulls/1', { headers: { accept: 'application/vnd.github.v3.diff' } })
    expect(fetchMock.mock.calls[0][1].headers.accept).toBe('application/vnd.github.v3.diff')
  })

  it('honors AbortSignal', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'))
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient()
    await expect(client.request('GET', '/x', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'GitHubError' })
  })
})

describe('createClient.request rate-limit retry', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockFetchSequence(...responses) {
    const fetchMock = vi.fn()
    for (const response of responses) fetchMock.mockResolvedValueOnce(response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  function rateLimitedResponse(status, headers) {
    return {
      ok: false,
      status,
      headers: { get: (name) => headers[name] ?? null },
      text: async () => 'rate limited',
    }
  }

  it('retries a 403 rate-limit using x-ratelimit-reset, then succeeds', async () => {
    const fetchMock = mockFetchSequence(
      rateLimitedResponse(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1' }),
      { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) },
    )
    const client = createClient({ token: 't' })
    await expect(client.request('GET', '/repos/a/b')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a 429 using Retry-After', async () => {
    const fetchMock = mockFetchSequence(
      rateLimitedResponse(429, { 'retry-after': '0' }),
      { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) },
    )
    const client = createClient()
    await expect(client.request('GET', '/x')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after exhausting retries and surfaces the status', async () => {
    const fetchMock = mockFetchSequence(
      rateLimitedResponse(429, { 'retry-after': '0' }),
      rateLimitedResponse(429, { 'retry-after': '0' }),
    )
    const client = createClient({ maxRetries: 1 })
    await expect(client.request('GET', '/x')).rejects.toMatchObject({ name: 'GitHubError', status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a plain 403 (permission denied)', async () => {
    const fetchMock = mockFetchSequence(rateLimitedResponse(403, {}))
    const client = createClient({ maxRetries: 3 })
    await expect(client.request('GET', '/x')).rejects.toMatchObject({ name: 'GitHubError', status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts cleanly while waiting to retry', async () => {
    const fetchMock = mockFetchSequence(rateLimitedResponse(429, { 'retry-after': '60' }))
    const client = createClient({ maxRetries: 3 })
    await expect(
      client.request('GET', '/x', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'GitHubError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('createClient.collect', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('paginates until a short page', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      const page = Number(url.searchParams.get('page'))
      const per = Number(url.searchParams.get('per_page'))
      const items = page === 1 ? Array.from({ length: per }, (_, i) => ({ n: i })) : [{ n: 99 }]
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => items }
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient()
    const all = await client.collect('GET', '/repos/a/b/issues', { perPage: 10, limit: 100 })
    expect(all.length).toBe(11)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('respects the limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => Array.from({ length: 20 }, (_, i) => ({ n: i })),
    }))
    const client = createClient()
    const all = await client.collect('GET', '/repos/a/b/issues', { perPage: 20, limit: 5 })
    expect(all.length).toBe(5)
  })

  it('collects search-style responses with total_count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ total_count: 3, items: [{ n: 1 }, { n: 2 }, { n: 3 }] }),
    }))
    const client = createClient()
    const all = await client.collect('GET', '/search/issues', { perPage: 100, limit: 100 })
    expect(all).toHaveLength(3)
  })
})
