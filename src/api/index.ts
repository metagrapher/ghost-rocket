import { Hono } from 'hono'

export const app = new Hono().basePath('/api')

app.get('/hello', (c) =>
    c.json(
        {
            message: 'Welcome to rave.arca.de.com'
            , status: 'ravertastic'
        })
)

const ARCHIVE =
    [{ id: 'cubik041604', title: 'Cübik - 04-16-04', url: 'http://ssbproductions.com/cubik041604/' }
        , { id: 'transit031710', title: 'Mass Transit - 03-17-10', url: 'http://ssbproductions.com/transit031710/' }
        , { id: 'zebabar090118', title: 'Pump Pump - 09-01-18', url: 'http://ssbproductions.com/zebabar090118/' }
        , { id: 'transit033118', title: 'Mass Transit w/ JOHN B', url: 'http://ssbproductions.com/transit033118/' }
    ]

const PHOTOS =
    [{ url: 'http://ssbproductions.com/cubik041604/SSB_0126.jpg', partyId: 'cubik041604' }
        , { url: 'http://ssbproductions.com/cubik041604/SSB_0127.jpg', partyId: 'cubik041604' }
        , { url: 'http://ssbproductions.com/zebabar090118/DSC_8884.JPG', partyId: 'zebabar090118' }
    ]

app.get('/archive', (c) => c.json(ARCHIVE))

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

app.get('/admin/scrape', async (c) => {
    // Basic security: Check for a secret header or just rely on obscurity for this mvp?
    // For now, let's just do it.

    // Bindings
    const bucket = c.env.BUCKET

    const results = []

    for (const photo of PHOTOS) {
        const filename = photo.url.split('/').pop()!
        const r2Key = `${photo.partyId}/${filename}`

        try {
            // Check if exists
            const existing = await bucket.head(r2Key)
            if (existing) {
                results.push({ url: photo.url, status: 'skipped', key: r2Key })
                continue
            }

            // Fetch from source
            const res = await fetch(photo.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': new URL(photo.url).origin
                }
            })

            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)

            // Save to R2
            await bucket.put(r2Key, res.body, {
                httpMetadata: {
                    contentType: res.headers.get('content-type') || 'image/jpeg'
                }
            })

            results.push({ url: photo.url, status: 'saved', key: r2Key })

        } catch (e: any) {
            console.error(`Failed to scrape ${photo.url}`, e)
            results.push({ url: photo.url, status: 'error', error: e.message })
        }
    }

    return c.json({ results })
})

app.get('/quiz', async (c) => {
    const photo = PHOTOS[Math.floor(Math.random() * PHOTOS.length)]
    // Generate 3 wrong options + 1 correct
    const correctArchive = ARCHIVE.find(a => a.id === photo.partyId)!
    const otherArchives = ARCHIVE.filter(a => a.id !== photo.partyId)

    // Shuffle and pick 3 wrong ones
    const wrongOptions = otherArchives
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(a => ({ id: a.id, label: a.title }))

    const options = [...wrongOptions, { id: correctArchive.id, label: correctArchive.title }]
        .sort(() => 0.5 - Math.random())

    // Check R2 first
    const bucket = c.env.BUCKET
    const filename = photo.url.split('/').pop()!
    const r2Key = `${photo.partyId}/${filename}`
    let imageUrl = `/api/image-proxy?url=${encodeURIComponent(photo.url)}` // default fallback

    try {
        // If we are on custom domain, we can serve directly if public access is enabled, 
        // OR we can serve via a new endpoint /api/image/KEY. 
        // For simplicity, let's verify existence. If it exists, we technically should serve it.
        // Since we don't have public R2 URL set up yet, let's create a serving endpoint: /api/img/:key
        const existing = await bucket.head(r2Key)
        if (existing) {
            imageUrl = `/api/img/${encodeURIComponent(r2Key)}`
        }
    } catch (e) {
        // ignore error, use fallback
    }

    return c.json({
        imageUrl: imageUrl,
        correctId: photo.partyId,
        options
    })
})

app.get('/img/:key', async (c) => {
    const key = c.req.param('key')
    const object = await c.env.BUCKET.get(decodeURIComponent(key))

    if (!object) return c.text('Not found', 404)

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)

    return new Response(object.body, {
        headers
    })
})

export default app
