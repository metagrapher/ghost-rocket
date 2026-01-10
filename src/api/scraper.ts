import puppeteer from '@cloudflare/puppeteer'

export interface ScrapeReport {
    id: string
    found: number
    saved: number
    status: string
    error?: string
}

interface ImageMetadata {
    link: string
    caption: string | null
}

export async function scrapeArchive(party: any, env: any): Promise<ScrapeReport> {
    const bucket = env.BUCKET
    const db = env.DB
    const browserBinding = env.BROWSER

    if (!browserBinding) {
        return { id: party.id, found: 0, saved: 0, status: 'error', error: 'Browser binding not found' }
    }

    let browser;
    try {
        browser = await puppeteer.launch(browserBinding)
        const page = await browser.newPage()

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        console.log(`🕵️ Scraper visiting: ${party.url}`)
        await page.goto(party.url, { waitUntil: 'networkidle2', timeout: 30000 })

        const images = await page.evaluate(() => {
            const results = new Map<string, string | null>()

            // Helper to clean and extract caption
            const getCaption = (el: HTMLElement): string | null => {
                const td = el.closest('td')
                if (td && td.nextElementSibling) {
                    return td.nextElementSibling.textContent?.trim() || null
                }
                const tr = el.closest('tr')
                if (tr && tr.nextElementSibling) {
                    return tr.nextElementSibling.textContent?.trim() || null
                }
                return null
            }

            // 1. Standard A tags with image extensions
            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href')
                if (href && /\.(jpg|jpeg|png)$/i.test(href) && !/tn/i.test(href)) {
                    if (!results.has(href)) {
                        results.set(href, getCaption(a))
                    }
                }

                // 2. onclick handlers
                const onclick = a.getAttribute('onclick')
                if (onclick) {
                    const match = onclick.match(/['"]([^"']+\.(jpg|jpeg|png))['"]/i)
                    if (match && !/tn/i.test(match[1])) {
                        if (!results.has(match[1])) {
                            results.set(match[1], getCaption(a))
                        }
                    }
                }
            })

            // 3. Img tags directly
            document.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src')
                if (src && /\.(jpg|jpeg|png)$/i.test(src) && !/tn/i.test(src)) {
                    if (!results.has(src)) {
                        results.set(src, img.getAttribute('alt') || null)
                    }
                }
            })

            return Array.from(results.entries()).map(([link, caption]) => ({ link, caption }))
        })

        console.log(`📸 Found ${images.length} raw links for ${party.id}`)

        const uniqueImages: ImageMetadata[] = images
            .map(img => {
                let link = img.link.startsWith('#') ? img.link.substring(1) : img.link
                // Resolve relative URLs
                try {
                    link = new URL(link, party.url).toString()
                } catch (e) {
                    console.warn(`Invalid URL found: ${link}`)
                }
                return { link, caption: img.caption }
            })
            .filter(img => /\.(jpg|jpeg|png)$/i.test(img.link))

        console.log(`✨ Filtering to ${uniqueImages.length} actual images for ${party.id}`)

        let saved = 0
        const LIMIT = 50

        for (const img of uniqueImages.slice(0, LIMIT)) {
            const filename = img.link.split('/').pop()!
            const r2Key = `${party.id}/${filename}`

            try {
                const publicId = crypto.randomUUID()

                // Upsert into D1 photos table first
                await db.prepare(`
                    INSERT INTO photos (image_key, party_id, caption, public_id)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(image_key) DO UPDATE SET
                        caption = COALESCE(excluded.caption, photos.caption),
                        public_id = COALESCE(photos.public_id, excluded.public_id)
                `).bind(r2Key, party.id, img.caption, publicId).run()

                const existing = await bucket.head(r2Key)
                if (existing) {
                    saved++
                    continue
                }

                const imgRes = await fetch(img.link, { headers: { 'Referer': party.url } })
                if (imgRes.ok) {
                    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
                    if (contentType.includes('image')) {
                        const blob = await imgRes.arrayBuffer()
                        await bucket.put(r2Key, blob, { httpMetadata: { contentType: contentType } })
                        saved++
                        console.log(`✅ Saved: ${r2Key}`)
                    }
                } else {
                    console.warn(`❌ Failed to fetch: ${img.link} (${imgRes.status})`)
                }
            } catch (e) {
                console.error(`💔 Error processing ${img.link}:`, e)
            }
        }

        await browser.close()

        // Update D1
        await db.prepare(`
            INSERT INTO scrape_status (party_id, images_found, images_saved, status, last_scraped_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(party_id) DO UPDATE SET
                images_found = excluded.images_found,
                images_saved = MAX(images_saved, excluded.images_saved),
                status = excluded.status,
                last_scraped_at = excluded.last_scraped_at
        `).bind(party.id, uniqueImages.length, saved, 'success').run()

        return { id: party.id, found: uniqueImages.length, saved, status: 'success' }

    } catch (e: any) {
        if (browser) await browser.close()
        await db.prepare(`
            INSERT INTO scrape_status (party_id, status, last_scraped_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP) 
            ON CONFLICT(party_id) DO UPDATE SET status = excluded.status
        `).bind(party.id, 'error').run()
        return { id: party.id, found: 0, saved: 0, status: 'error', error: e.message }
    }
}
