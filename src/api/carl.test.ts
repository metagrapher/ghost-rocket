
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { app } from './index'
import { applyD1Migrations, env } from 'cloudflare:test'

describe('Carl API', () => {
    beforeAll(async () => {
        // Manually setup table to avoid migration loader issues in isolation
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS carl_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                batch_size INTEGER DEFAULT 50,
                frequency_hours INTEGER DEFAULT 24,
                enabled BOOLEAN DEFAULT TRUE,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `).run()

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS parties (
                id TEXT PRIMARY KEY,
                title TEXT,
                series TEXT,
                url TEXT,
                discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                enriched_at DATETIME,
                location_name TEXT,
                latitude REAL,
                longitude REAL,
                party_date DATE
            );
        `).run()

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS scrape_status (
                party_id TEXT PRIMARY KEY,
                last_scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                images_found INTEGER DEFAULT 0,
                images_saved INTEGER DEFAULT 0,
                status TEXT
            );
        `).run()

        await env.DB.prepare('INSERT OR IGNORE INTO carl_settings (id, batch_size, frequency_hours, enabled) VALUES (1, 50, 24, 1)').run()
    })

    it('GET /api/carl/status returns default config', async () => {
        const res = await app.request('/api/carl/status', {}, env)
        expect(res.status).toBe(200)
        const data = await res.json() as any
        expect(data.config).toBeDefined()
        expect(data.config.batch_size).toBe(50)
        expect(data.config.enabled).toBe(1)
        expect(data.isEating).toBeDefined()
    })

    it('POST /api/carl/config updates settings', async () => {
        const updateRes = await app.request('/api/carl/config', {
            method: 'POST',
            body: JSON.stringify({ batch_size: 100, enabled: false })
        }, env)
        expect(updateRes.status).toBe(200)

        // Verify update
        const res = await app.request('/api/carl/status', {}, env)
        const data = await res.json() as any
        expect(data.config.batch_size).toBe(100)
        expect(data.config.enabled).toBe(0)
    })
})
