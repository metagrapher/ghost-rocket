import { Hono } from 'hono'

export const app = new Hono().basePath('/api')

app.get('/hello', (c) =>
    c.json(
        {
            message: 'Welcome to rave.arca.de.com'
            , status: 'RAVEtastic'
        })
)

app.get('/archive', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM parties ORDER BY discovered_at DESC').all()
    return c.json(results)
})

app.get('/image-proxy', async (c) => {
    const url = c.req.query('url')
    if (!url) return c.text('Missing URL', 400)

    try {
        const start = Date.now()
        const imageRes = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': new URL(url).origin
            }
        })

        if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageRes.status}`)

        const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
        const body = imageRes.body

        console.log(`🖼️ Proxied image in ${Date.now() - start}ms: ${url}`)

        return c.body(body as any, 200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600'
        })
    } catch (e) {
        console.error('Proxy Error:', e)
        return c.text('Failed to proxy image', 500)
    }
})

import { scrapeArchive } from './scraper'
import { discoverParties } from './discover'
import { enrichPartyWithAI } from './enrichment'

app.get('/admin/discover', async (c) => {
    const env = c.env
    try {
        const result = await discoverParties(env)
        return c.json({ status: 'Discovery Complete', ...result })
    } catch (e: any) {
        return c.json({ status: 'Discovery Failed', error: e.message }, 500)
    }
})

app.get('/admin/scrape', async (c) => {
    const env = c.env
    const targetId = c.req.query('id')

    let parties: any[] = []
    if (targetId) {
        const party = await env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(targetId).first()
        if (party) parties = [party]
    } else {
        // Pick 2 random parties that haven't been scraped recently or at all
        const { results } = await env.DB.prepare(`
            SELECT p.* FROM parties p
            LEFT JOIN scrape_status s ON p.id = s.party_id
            ORDER BY s.last_scraped_at ASC NULLS FIRST
            LIMIT 2
        `).all()
        parties = results
    }

    if (parties.length === 0) {
        return c.json({ status: 'No parties found to scrape' })
    }

    c.executionCtx.waitUntil((async () => {
        for (const party of parties) {
            await scrapeArchive(party, env)
            // Trigger enrichment after scrape
            await enrichPartyWithAI(party.id, env)
        }
    })())

    return c.json({ status: 'Scrape and Enrichment started in background', batch: parties.map((b: any) => b.id) })
})

app.get('/admin/enrich', async (c) => {
    const env = c.env
    const partyId = c.req.query('id')

    if (partyId) {
        const result = await enrichPartyWithAI(partyId, env)
        return c.json({ status: 'Enrichment Complete', id: partyId, result })
    }

    // Otherwise find a party that hasn't been enriched
    const party = await env.DB.prepare('SELECT id FROM parties WHERE enriched_at IS NULL LIMIT 1').first()
    if (!party) return c.json({ status: 'No parties need enrichment' })

    const result = await enrichPartyWithAI(party.id, env)
    return c.json({ status: 'Enrichment Complete', id: party.id, result })
})

app.get('/admin/scrape-status', async (c) => {
    const { results } = await c.env.DB.prepare(`
        SELECT p.id, p.title, p.series, p.location_name, p.latitude, p.longitude, p.party_date, p.enriched_at, s.last_scraped_at, s.images_found, s.images_saved, s.status
        FROM parties p
        LEFT JOIN scrape_status s ON p.id = s.party_id
        ORDER BY s.last_scraped_at DESC NULLS FIRST, p.id ASC
    `).all()
    return c.json(results)
})

app.post('/admin/party/update', async (c) => {
    const env = c.env
    const body = await c.req.json()
    const { id, title, series, location_name, latitude, longitude, party_date } = body

    await env.DB.prepare(`
        UPDATE parties 
        SET title = ?, series = ?, location_name = ?, latitude = ?, longitude = ?, party_date = ?
        WHERE id = ?
    `).bind(title, series, location_name, latitude, longitude, party_date, id).run()

    return c.json({ success: true })
})

app.get('/quiz', async (c) => {
    try {
        const bucket = c.env.BUCKET
        const db = c.env.DB
        const listed = await bucket.list()

        if (!listed.objects || listed.objects.length === 0) {
            return c.json({ error: 'Archive Empty' }, 404)
        }

        // Pick a random photo from the entire archive, retry if orphaned
        let key = ''
        let partyId = ''
        let correctArchive = null
        let attempts = 0
        const MAX_ATTEMPTS = 5

        while (attempts < MAX_ATTEMPTS) {
            const randomObj = listed.objects[Math.floor(Math.random() * listed.objects.length)]
            key = randomObj.key // e.g. "partyId/filename.jpg"
            partyId = key.split('/')[0]

            // Validate partyId against our metadata in DB
            correctArchive = await db.prepare('SELECT * FROM parties WHERE id = ?').bind(partyId).first() as any

            if (correctArchive) break

            console.warn(`⚠️ Orphaned Photo Found (Attempt ${attempts + 1}): ${key}`)
            attempts++
        }

        if (!correctArchive) {
            return c.json({ error: 'Archive Consistency Error: Too many orphaned photos found.', lastKey: key }, 500)
        }

        // Helper to format label with year
        const getYear = (p: any) => {
            if (p.party_date) return p.party_date.split('-')[0]
            const match = p.id.match(/(\d{2})(\d{2})(\d{2})$/)
            if (match) {
                const yy = match[3]
                return parseInt(yy) > 80 ? `19${yy}` : `20${yy}`
            }
            return ''
        }

        const formatLabel = (p: any) => {
            const base = p.title || p.series || 'Unknown Party'
            const year = getYear(p)
            return year ? `${base} (${year})` : base
        }

        // Generate options (Prioritize Title over Series, Add Year)
        const correctLabel = formatLabel(correctArchive)

        // Get distractors from DB (randomly pick 3 different titles)
        const { results: distractors } = await db.prepare(`
            SELECT id, title, series, party_date FROM parties 
            WHERE title != ? AND id != ?
            GROUP BY title
            ORDER BY RANDOM()
            LIMIT 3
        `).bind(correctArchive.title || correctArchive.series, correctArchive.id).all()

        const options = [...distractors.map((d: any) => ({
            id: d.id,
            label: formatLabel(d)
        })), { id: correctArchive.id, label: correctLabel }]
            .sort(() => 0.5 - Math.random())

        // Parse date from ID (e.g., cubik041604 -> 04/16/04)
        const dateMatch = correctArchive.id.match(/(\d{2})(\d{2})(\d{2})$/)
        let photoDate = { month: '01', day: '01', year: '00' }

        if (dateMatch) {
            photoDate = { month: dateMatch[1], day: dateMatch[2], year: dateMatch[3] }
        } else {
            const yearOnly = correctArchive.id.match(/(\d{2})$/)
            if (yearOnly) photoDate.year = yearOnly[1]
        }

        return c.json({
            imageUrl: `/api/img/${encodeURIComponent(key)}`,
            correctId: partyId,
            options,
            date: photoDate
        })

    } catch (e: any) {
        console.error('Quiz Error:', e)
        return c.json({ error: e.message || 'Failed to generate quiz' }, 500)
    }
})

// Social Tagging API
app.get('/tags/:key', async (c) => {
    const key = c.req.param('key')
    const { results } = await c.env.DB.prepare('SELECT * FROM tags WHERE image_key = ?').bind(key).all()
    return c.json(results)
})

app.post('/tags', async (c) => {
    try {
        const { image_key, x, y, w, h, name } = await c.req.json() as any

        // Moderation Logic
        const lowerName = (name || '').toLowerCase()
        const blacklist = ['fuck', 'shit', 'cunt', 'nigger', 'faggot', 'asshole'] // Basic list

        // Specific Exception for "Bitch Beth"
        if (lowerName.includes('bitch') && lowerName !== 'bitch beth') {
            return c.json({ error: 'Moderation: Name rejected.' }, 400)
        }

        if (blacklist.some(word => lowerName.includes(word))) {
            return c.json({ error: 'Moderation: Name rejected.' }, 400)
        }

        await c.env.DB.prepare(
            'INSERT INTO tags (image_key, x, y, w, h, name) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(image_key, x, y, w, h, name).run()

        return c.json({ success: true })
    } catch (e: any) {
        return c.text(`Error fetching archive: ${e.message}`, 500)
    }
})

app.get('/img/*', async (c) => {
    try {
        const url = new URL(c.req.url)
        const key = url.pathname.replace('/api/img/', '')
        const decodedKey = decodeURIComponent(key)

        console.log(`🖼️ Fetching Image: ${decodedKey}`)
        const object = await c.env.BUCKET.get(decodedKey)

        if (!object) {
            console.warn(`❌ Image Not Found: ${decodedKey}`)
            return c.text('Not found', 404)
        }

        const headers = new Headers()
        if (object.httpMetadata?.contentType) {
            headers.set('content-type', object.httpMetadata.contentType)
        }
        if (object.httpMetadata?.contentLanguage) {
            headers.set('content-language', object.httpMetadata.contentLanguage)
        }
        if (object.httpMetadata?.contentEncoding) {
            headers.set('content-encoding', object.httpMetadata.contentEncoding)
        }
        if (object.httpMetadata?.contentDisposition) {
            headers.set('content-disposition', object.httpMetadata.contentDisposition)
        }
        if (object.httpMetadata?.cacheControl) {
            headers.set('cache-control', object.httpMetadata.cacheControl)
        }

        headers.set('etag', object.httpEtag)

        return new Response(object.body, {
            headers
        })
    } catch (e: any) {
        console.error('Image Fetch Error:', e)
        return c.text(`Image Error: ${e.message}`, 500)
    }
})

export default app
