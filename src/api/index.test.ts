import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import app from './index'

describe('Hono API', () => {
    it('should return welcome message', async () => {
        const res = await app.request('/api/hello', {}, env)
        expect(res.status).toBe(200)

        const data = await res.json() as any
        expect(data.message).toBe('Welcome to rave.arca.de.com')
        expect(data.status).toBe('RAVEtastic')
    })

    it('should return empty archive by default', async () => {
        // This hits the DB, ensuring compatibility with vitest-pool-workers
        const res = await app.request('/api/archive', {}, env)
        expect(res.status).toBe(200)

        const data = await res.json() as any
        expect(Array.isArray(data)).toBe(true)
    })

    it('should return 404 for unknown route', async () => {
        const res = await app.request('/api/non-existent', {}, env)
        expect(res.status).toBe(404)
    })
})
