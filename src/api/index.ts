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
    [{ id: 'cubik041604', title: 'Cübik - 04-16-04', url: 'http://ssbproductions.com/cubik041604/', series: 'Cübik (2004)' }
        , { id: 'transit031710', title: 'Mass Transit - 03-17-10', url: 'http://ssbproductions.com/transit031710/', series: 'Mass Transit (2010)' }
        , { id: 'zebabar090118', title: 'Pump Pump - 09-01-18', url: 'http://ssbproductions.com/zebabar090118/', series: 'Zeba Bar (2018)' }
        , { id: 'transit033118', title: 'Mass Transit w/ JOHN B', url: 'http://ssbproductions.com/transit033118/', series: 'Mass Transit (2018)' }
        , { id: 'wickerman062318', title: 'WickerMan Burn - Sat', url: 'http://ssbproductions.com/wickerman062318/', series: 'WickerMan Burn (2018)' }
        , { id: 'wickerman062218', title: 'WickerMan Burn - Fri', url: 'http://ssbproductions.com/wickerman062218/', series: 'WickerMan Burn (2018)' }
        , { id: 'wickerman062118', title: 'WickerMan Burn - Thu', url: 'http://ssbproductions.com/wickerman062118/', series: 'WickerMan Burn (2018)' }
        , { id: 'farmshow03', title: 'Farm Show 2003', url: 'http://ssbproductions.com/farmshow03/', series: 'Farm Show (2003)' }
        , { id: 'starscape060609', title: 'Starscape 2009', url: 'http://ssbproductions.com/starscape060609/', series: 'Starscape (2009)' }
        , { id: 'paradox042509', title: 'Spring Massive - 04-25-09', url: 'http://ssbproductions.com/paradox042509/', series: 'Spring Massive (2009)' }
        , { id: 'potd091808', title: 'Planet of the Drums', url: 'http://ssbproductions.com/potd091808/', series: 'Planet of the Drums (2008)' }
        , { id: 'gothprom052409', title: 'Goth Prom at Town', url: 'http://ssbproductions.com/gothprom052409/', series: 'Goth Prom (2009)' }
        , { id: 'ibiza120509', title: 'Ibiza - 12-05-09', url: 'http://ssbproductions.com/ibiza120509/', series: 'Ibiza (2009)' }
        , { id: 'fallmassive112809', title: 'Fall Massive 2009', url: 'http://ssbproductions.com/fallmassive112809/', series: 'Fall Massive (2009)' }
        , { id: 'buzzboat2009-7', title: 'Buzz Boat Closing', url: 'http://ssbproductions.com/buzzboat2009-7/', series: 'Buzz Boat (2009)' }
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
    // 1. Iterate over all defined Archives
    const report: any[] = []
    const bucket = c.env.BUCKET

    for (const party of ARCHIVE) {
        try {
            // Fetch the index page
            const indexRes = await fetch(party.url, {
                headers: { 'User-Agent': 'GhostRocket/1.0' }
            })
            if (!indexRes.ok) {
                report.push({ id: party.id, status: 'failed_index', code: indexRes.status })
                continue
            }

            const html = await indexRes.text()
            // Naive regex to find links to jpgs. 
            // Look for href="... .jpg" or .JPG, naive because HTML parsing is hard with regex but sufficient for this legacy site.
            // Targeting: <a href="SSB_0001.jpg"> or <a href="tn/DSC_0001.JPG">
            const combinedSource: string[] = []

            // Regex 1: Capture hrefs (including hash prefix)
            const hrefMatches = [...html.matchAll(/href=["']([^"']+\.(?:jpg|JPG))["']/gi)]
            hrefMatches.forEach(m => combinedSource.push(m[1]))

            // Regex 2: Capture window.open args
            const scriptMatches = [...html.matchAll(/window\.open\(['"]([^"']+\.(?:jpg|JPG))['"]/gi)]
            scriptMatches.forEach(m => combinedSource.push(m[1]))

            const uniqueImages = new Set<string>()

            combinedSource.forEach(raw => {
                // Cleanup: remove starting #
                let clean = raw.startsWith('#') ? raw.substring(1) : raw
                uniqueImages.add(clean)
            })

            let saved = 0
            const images = Array.from(uniqueImages)

            // Limit to 20 per party for now to avoid timeout/rate limits during first pass?
            // Or just go for it? Let's cap at 50 for the "Kick off".
            const LIMIT = 50
            const toProcess = images.slice(0, LIMIT)

            await Promise.all(toProcess.map(async (imgLink) => {
                // Handle relative paths. Usually just filename.
                // Sometimes might be 'tn/foo.jpg' -> skip thumbnails?
                if (imgLink.includes('tn/') || imgLink.includes('TN/')) return // Skip thumbnails

                const fullUrl = new URL(imgLink, party.url).toString()
                const filename = imgLink.split('/').pop()!
                const r2Key = `${party.id}/${filename}`

                // Fetch & Store (Verify content-type)
                const vidRes = await fetch(fullUrl)
                if (vidRes.ok) {
                    const contentType = vidRes.headers.get('content-type') || ''
                    if (contentType.includes('image')) {
                        const blob = await vidRes.arrayBuffer()
                        await bucket.put(r2Key, blob, {
                            httpMetadata: { contentType: contentType }
                        })
                        saved++
                    }
                }
            }))

            report.push({ id: party.id, found: images.length, processing_limit: LIMIT, saved_new: saved })

        } catch (e: any) {
            report.push({ id: party.id, error: e.message })
        }
    }

    return c.json({ status: 'Batch Complete', report })
})

app.get('/quiz', async (c) => {
    try {
        const bucket = c.env.BUCKET
        const listed = await bucket.list()

        if (!listed.objects || listed.objects.length === 0) {
            return c.json({ error: 'Archive Empty' }, 404)
        }

        // Pick a random photo from the entire archive
        const randomObj = listed.objects[Math.floor(Math.random() * listed.objects.length)]
        const key = randomObj.key // e.g. "partyId/filename.jpg"
        const partyId = key.split('/')[0]

        // Validate partyId against our metadata
        const correctArchive = ARCHIVE.find(a => a.id === partyId)

        // If we have a file for a party we don't know about (orphan), just recurse/retry? 
        // For now, let's just error to be safe, or handle gracefully.
        if (!correctArchive) {
            return c.json({ error: 'Orphaned Photo Found', key }, 500)
        }

        // Generate options
        // Generate options (Grouping by Series)

        // 1. Get correct series
        const correctSeries = correctArchive.series || correctArchive.title

        // 2. Get all other VALID series (deduplicated)
        const othersMap = new Map<string, string>() // series -> id
        ARCHIVE.forEach(a => {
            const series = a.series || a.title
            if (series !== correctSeries) {
                othersMap.set(series, a.id)
            }
        })

        const distinctDistractors = Array.from(othersMap.keys())

        // 3. Shuffle and pick 3 unique distractors
        const selectedDistractors = distinctDistractors
            .sort(() => 0.5 - Math.random())
            .slice(0, 3)
            .map(series => ({
                id: othersMap.get(series)!,
                label: series
            }))

        const options = [...selectedDistractors, { id: correctArchive.id, label: correctSeries }]
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
        return c.json({ error: e.message }, 500)
    }
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
