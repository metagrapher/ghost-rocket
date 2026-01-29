import { Hono } from 'hono'
import { trackRequest, getStats, getUsageStats } from './metrics'

export const app = new Hono().basePath('/api')

app.use('*', async (c, next) => {
    trackRequest(c)
    return next()
})

app.get('/hello', (c) => {
    return c.json({
        message: 'Welcome to rave.arca.de.com'
        , status: 'RAVEtastic'
    })
})

// Gun.js Relay Route
app.get('/gun', async (c) => {
    const upgradeHeader = c.req.header('Upgrade')
    const uniqueId = c.env.GUN_RELAY.idFromName('global-relay')
    const stub = c.env.GUN_RELAY.get(uniqueId)

    if (upgradeHeader === 'websocket') {
        return stub.fetch(c.req.raw)
    }

    // Proxy other requests (PUT/GET for Gun REST) if needed
    // For now, simple fallback
    return stub.fetch(c.req.raw)
})

// PostHog Proxy for "Server-Side" Tracking & Enrichment
app.all('/ingest/*', async (c) => {
    // URL rewrite: /api/ingest/e/ -> https://us.i.posthog.com/e/
    const url = new URL(c.req.url)
    const path = url.pathname.replace('/api/ingest', '')
    const targetUrl = new URL(path, 'https://us.i.posthog.com')

    // Copy query params
    url.searchParams.forEach((v, k) => targetUrl.searchParams.append(k, v))

    const headers = new Headers(c.req.header())
    headers.set('Host', 'us.i.posthog.com')

    // Important for PostHog to correct GeoIP
    const clientIp = c.req.header('CF-Connecting-IP')
    if (clientIp) {
        headers.set('X-Forwarded-For', clientIp)
    }

    try {
        const res = await fetch(targetUrl.toString(), {
            method: c.req.method,
            headers,
            body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
            redirect: 'follow'
        })

        return new Response(res.body, {
            status: res.status,
            headers: res.headers
        })
    } catch (e: any) {
        console.error('PostHog Proxy Error:', e)
        return c.json({ error: 'Proxy Failed' }, 502)
    }
})

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
import { runCarl, getCarlStatus } from './carl'

app.get('/admin/discover', async (c) => {
    const env = c.env
    try {
        const result = await discoverParties(env)
        return c.json({ status: 'Discovery Complete', ...result })
    } catch (e: any) {
        return c.json({ status: 'Discovery Failed', error: e.message }, 500)
    }
})

// === CARL THE SCRAPER API ===

app.get('/carl/status', async (c) => {
    try {
        const status = await getCarlStatus(c.env)
        return c.json(status)
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
    }
})

app.post('/carl/config', async (c) => {
    try {
        const { batch_size, enabled, frequency_hours } = await c.req.json() as any

        // Update DB (id=1 is the singleton row)
        await c.env.DB.prepare(`
            UPDATE carl_settings 
            SET batch_size = COALESCE(?, batch_size), 
                enabled = COALESCE(?, enabled), 
                frequency_hours = COALESCE(?, frequency_hours),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `).bind(batch_size, enabled, frequency_hours).run()

        return c.json({ success: true })
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
    }
})

// Internal endpoint to be hit by the cron trigger
app.get('/admin/cron-trigger', async (c) => {
    // In a real app, verify a secret header here!
    // const secret = c.req.header('X-Cron-Secret')
    // if (secret !== c.env.CRON_SECRET) return c.text('Unauthorized', 401)

    c.executionCtx.waitUntil((async () => {
        await runCarl(c.env)
    })())

    return c.json({ status: 'Triggered' })
})

app.get('/admin/scrape', async (c) => {
    const env = c.env
    const targetId = c.req.query('id')
    const force = c.req.query('force') === 'true'

    if (targetId) {
        // Manual specific target scrape (bypass Carl logic, just direct)
        // Check config for batch size though
        const config = await env.DB.prepare('SELECT batch_size FROM carl_settings WHERE id = 1').first()
        const batchSize = config?.batch_size || 50

        const party = await env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(targetId).first()
        if (!party) return c.json({ error: 'Party not found' }, 404)

        c.executionCtx.waitUntil((async () => {
            await scrapeArchive(party, env, batchSize)
            await enrichPartyWithAI(party.id, env)
        })())

        return c.json({ status: 'Manual Scrape Started', party: targetId })
    }

    // Manual 'Wake Carl' trigger
    const result = await runCarl(env, force)
    return c.json(result)
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

app.get('/admin/stats', async (c) => {
    try {
        const stats = await getStats(c.env)
        return c.json(stats)
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
    }
})

app.get('/admin/usage', async (c) => {
    try {
        const stats = await getUsageStats(c.env)
        return c.json(stats)
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
    }
})

app.get('/admin/scrape-status', async (c) => {
    const sort = c.req.query('sort') || 'last_scraped_at'
    const dir = c.req.query('dir') === 'asc' ? 'ASC' : 'DESC'

    let orderBy = 's.last_scraped_at DESC NULLS FIRST, p.id ASC'

    if (sort === 'enrichment_level') {
        orderBy = `p.enrichment_level ${dir} NULLS LAST, p.id ASC`
    } else if (sort === 'title') {
        orderBy = `p.title ${dir}, p.id ASC`
    } else if (sort === 'status') {
        orderBy = `s.status ${dir} NULLS LAST, p.id ASC`
    } else if (sort === 'date') {
        orderBy = `p.party_date ${dir} NULLS LAST, p.id ASC`
    }

    const { results } = await c.env.DB.prepare(`
        SELECT p.id, p.title, p.series, p.location_name, p.latitude, p.longitude, p.party_date, p.enriched_at, p.enrichment_level, s.last_scraped_at, s.images_found, s.images_saved, s.status
        FROM parties p
        LEFT JOIN scrape_status s ON p.id = s.party_id
        ORDER BY ${orderBy}
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

app.get('/admin/backfill-public-ids', async (c) => {
    const db = c.env.DB
    const { results } = await db.prepare('SELECT image_key FROM photos WHERE public_id IS NULL').all()

    let updated = 0
    for (const photo of results) {
        const newId = crypto.randomUUID()
        await db.prepare('UPDATE photos SET public_id = ? WHERE image_key = ?').bind(newId, photo.image_key).run()
        updated++
    }

    return c.json({ status: 'Backfill Complete', updated, total: results.length })
})

app.get('/quiz', async (c) => {
    try {
        const db = c.env.DB

        // Deep Linking Support
        const photoId = c.req.query('photoId')
        let selectedPhoto: any = null

        if (photoId) {
            // URL Decoding happens here to handle both clear keys and opaque IDs safely
            const keyOrId = decodeURIComponent(photoId)

            // 1. Try lookup by public_id (Opaque)
            selectedPhoto = await db.prepare('SELECT * FROM photos WHERE public_id = ?').bind(keyOrId).first()

            // 2. Fallback: Try lookup by image_key (Legacy/Clear)
            if (!selectedPhoto) {
                selectedPhoto = await db.prepare('SELECT * FROM photos WHERE image_key = ?').bind(keyOrId).first()
            }

            if (!selectedPhoto) {
                console.warn(`⚠️ Deep Link: Photo not found via public_id or key: ${keyOrId}`)
            }
        }

        // Random Fallback (if no photoId or valid photo found)
        if (!selectedPhoto) {
            // Pick a random photo from the DB
            selectedPhoto = await db.prepare('SELECT * FROM photos ORDER BY RANDOM() LIMIT 1').first()

            if (!selectedPhoto) {
                // TEMPORARY FALLBACK FOR ORPHANED R2 FILES (Pre-migration safety)
                const bucket = c.env.BUCKET
                const listed = await bucket.list()
                if (listed.objects.length > 0) {
                    const randomObj = listed.objects[Math.floor(Math.random() * listed.objects.length)]
                    selectedPhoto = { image_key: randomObj.key } // No public_id available
                } else {
                    return c.json({ error: 'Archive Empty' }, 404)
                }
            }
        }


        const key = selectedPhoto.image_key
        const publicIdOutput = selectedPhoto.public_id || key // Prefer public_id, fallback to key if missing

        const partyId = selectedPhoto.party_id || key.split('/')[0]

        // Fetch Party Metadata
        const correctArchive = await db.prepare('SELECT * FROM parties WHERE id = ?').bind(partyId).first() as any

        if (!correctArchive) {
            console.warn(`⚠️ Party metadata missing for photo: ${key}`)
            return c.json({ error: 'Archive Consistency Error: Party metadata missing.', key }, 500)
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

        // Generate Token/Nonce for updating preferences
        // Since we don't have user accounts, we sign the photoID with a rotating daily secret or just the env secret
        // For simplicity and speed in this context, we'll hash the photoID with a secret.
        const msgBuffer = new TextEncoder().encode(publicIdOutput + (c.env.CRON_SECRET || 'dev-secret'));
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const nonce = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Return URL with publicId if possible, else key.
        // And ensure photoId returns the opaque ID.
        return c.json({
            imageUrl: `/api/img/${encodeURIComponent(publicIdOutput)}`,
            photoId: encodeURIComponent(publicIdOutput),
            correctId: partyId,
            options,
            date: photoDate,
            qrInverted: selectedPhoto.qr_inverted === 1 ? true : (selectedPhoto.qr_inverted === 0 ? false : null),
            nonce
        })

    } catch (e: any) {
        console.error('Quiz Error:', e)
        return c.json({ error: e.message || 'Failed to generate quiz' }, 500)
    }
})

app.post('/photos/qr-pref', async (c) => {
    try {
        const { publicId, inverted, nonce } = await c.req.json() as any

        if (!publicId || !nonce) return c.json({ error: 'Missing required fields' }, 400)

        // Verify Nonce
        const msgBuffer = new TextEncoder().encode(publicId + (c.env.CRON_SECRET || 'dev-secret'));
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const expectedNonce = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (nonce !== expectedNonce) {
            return c.json({ error: 'Invalid Nonce' }, 403)
        }

        await c.env.DB.prepare('UPDATE photos SET qr_inverted = ? WHERE public_id = ?')
            .bind(inverted ? 1 : 0, publicId)
            .run()

        return c.json({ success: true })
    } catch (e: any) {
        return c.json({ error: e.message }, 500)
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
        const pathSuffix = url.pathname.replace('/api/img/', '')
        const decodedInput = decodeURIComponent(pathSuffix)

        console.log(`🖼️ Fetching Image Request: ${decodedInput}`)

        // 1. Resolve potential public_id to real R2 key
        let r2Key = decodedInput
        const db = c.env.DB

        // Try to find by public_id first
        const photo = await db.prepare('SELECT image_key FROM photos WHERE public_id = ?').bind(decodedInput).first()
        if (photo) {
            r2Key = photo.image_key
            console.log(`🔓 Resolved public_id ${decodedInput} to ${r2Key}`)
        } else {
            console.log(`ℹ️ Assuming direct key or legacy access: ${decodedInput}`)
        }

        const object = await c.env.BUCKET.get(r2Key)

        if (!object) {
            console.warn(`❌ Image Not Found: ${r2Key} (requested as ${decodedInput})`)
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
