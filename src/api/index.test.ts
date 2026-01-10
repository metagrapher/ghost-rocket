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

    it('should support deep linking via opaque public_id', async () => {
        const db = (env as any).DB
        const photoKey = 'cubik041604/test.jpg'
        const partyId = 'cubik041604'
        const publicId = 'opaque-id-123'

        // 1. Seed R2
        await (env as any).BUCKET.put(photoKey, 'fake-image-content')

        // 2. Seed DB with public_id
        await db.prepare('INSERT OR IGNORE INTO photos (image_key, party_id, caption, public_id) VALUES (?, ?, ?, ?)')
            .bind(photoKey, partyId, 'Test Caption', publicId)
            .run()

        // 3. Test Deep Linking using public_id
        const res = await app.request(`/api/quiz?photoId=${publicId}`, {}, env)
        expect(res.status).toBe(200)

        const data = await res.json() as any

        // Expect response to use the opaque ID
        expect(data.photoId).toBe(publicId)
        expect(data.imageUrl).toContain(encodeURIComponent(publicId))
        expect(data.correctId).toBe(partyId)

        // 4. Test Image Resolution
        // Decode the imageUrl path to handle potential double-encoding or path extraction
        const imagePath = data.imageUrl
        const imgRes = await app.request(imagePath, {}, env)
        expect(imgRes.status).toBe(200)
        await imgRes.text() // Consume body to close R2 stream
    })
})
