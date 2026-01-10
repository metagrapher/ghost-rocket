import { describe, it, expect, beforeAll, vi } from 'vitest'
import { env } from 'cloudflare:test'
import app from './index'

// Mock metrics to avoid ExecutionContext issues in tests
vi.mock('./metrics', () => ({
    trackRequest: vi.fn(),
    getStats: vi.fn(),
    getUsageStats: vi.fn()
}))

describe('QR Code Watermark API', () => {

    const photoKey = 'qr-test/photo.jpg'
    const partyId = 'qr-test-party'
    const publicId = 'test-public-id-qr'

    it('should return a nonce in the quiz response', async () => {
        const db = (env as any).DB

        // Seed Data
        await db.prepare('INSERT OR IGNORE INTO parties (id, title) VALUES (?, ?)').bind(partyId, 'QR Party').run()
        await db.prepare('DELETE FROM photos WHERE image_key = ?').bind(photoKey).run()
        await db.prepare('INSERT INTO photos (image_key, party_id, public_id) VALUES (?, ?, ?)')
            .bind(photoKey, partyId, publicId)
            .run()

        const res = await app.request(`/api/quiz?photoId=${publicId}`, {}, env)
        expect(res.status).toBe(200)

        const data = await res.json() as any
        expect(data.photoId).toBe(publicId)
        expect(data.nonce).toBeDefined()
        expect(typeof data.nonce).toBe('string')
        expect(data.qrInverted).toBeNull() // Default is null
    })

    it('should save qr preference with valid nonce', async () => {
        const db = (env as any).DB

        // Seed Data (Again for safety / isolation)
        await db.prepare('INSERT OR IGNORE INTO parties (id, title) VALUES (?, ?)').bind(partyId, 'QR Party').run()
        await db.prepare('DELETE FROM photos WHERE public_id = ?').bind(publicId).run()
        await db.prepare('INSERT INTO photos (image_key, party_id, public_id) VALUES (?, ?, ?)')
            .bind(photoKey, partyId, publicId)
            .run()

        // 1. Get Nonce
        const quizRes = await app.request(`/api/quiz?photoId=${publicId}`, {}, env)
        const quizData = await quizRes.json() as any
        const nonce = quizData.nonce

        // 2. Save Preference (Inverted = true)
        const saveRes = await app.request('/api/photos/qr-pref', {
            method: 'POST',
            body: JSON.stringify({
                publicId,
                inverted: true,
                nonce
            })
        }, env)

        expect(saveRes.status).toBe(200)
        const saveData = await saveRes.json() as any
        expect(saveData.success).toBe(true)

        // 3. Verify DB Update
        const photo = await db.prepare('SELECT qr_inverted FROM photos WHERE public_id = ?').bind(publicId).first()
        expect(photo.qr_inverted).toBe(1)

        // 4. Verify Quiz Response reflects change
        const quizRes2 = await app.request(`/api/quiz?photoId=${publicId}`, {}, env)
        const quizData2 = await quizRes2.json() as any
        expect(quizData2.qrInverted).toBe(true)
    })

    it('should reject save with invalid nonce', async () => {
        const db = (env as any).DB

        // Seed Data just in case
        await db.prepare('INSERT OR IGNORE INTO parties (id, title) VALUES (?, ?)').bind(partyId, 'QR Party').run()
        await db.prepare('DELETE FROM photos WHERE public_id = ?').bind(publicId).run()
        await db.prepare('INSERT INTO photos (image_key, party_id, public_id) VALUES (?, ?, ?)')
            .bind(photoKey, partyId, publicId)
            .run()

        const saveRes = await app.request('/api/photos/qr-pref', {
            method: 'POST',
            body: JSON.stringify({
                publicId,
                inverted: false,
                nonce: 'invalid-nonce'
            })
        }, env)

        expect(saveRes.status).toBe(403)
    })
})
