import puppeteer from '@cloudflare/puppeteer'
import { disambiguatePartyNames } from './name-utils'

export async function discoverParties(env: any) {
    const db = env.DB
    const browserBinding = env.BROWSER
    const archiveUrl = 'http://ssbproductions.com/archive/'

    if (!browserBinding) {
        throw new Error('Browser binding not found')
    }

    let browser;
    try {
        browser = await puppeteer.launch(browserBinding)
        const page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        console.log(`🕵️ Discovering parties at: ${archiveUrl}`)
        await page.goto(archiveUrl, { waitUntil: 'networkidle2', timeout: 30000 })

        const discovered = await page.evaluate(() => {
            const baseUrl = 'http://ssbproductions.com/archive/'
            const links = Array.from(document.querySelectorAll('a'))

            return links.map(a => {
                const href = a.getAttribute('href') || ''
                const text = a.innerText.trim()

                let id = ''
                try {
                    const urlObj = new URL(href, baseUrl)
                    const pathParts = urlObj.pathname.split('/').filter(p => p)
                    // If it's in /archive/XYZ, the ID is XYZ
                    if (pathParts[0] === 'archive' && pathParts[1]) {
                        id = pathParts[1]
                    } else if (pathParts[0] && pathParts[0] !== 'archive') {
                        id = pathParts[0]
                    }
                } catch (e) {
                    // Fallback to old regex if URL parsing fails
                    if (href.includes('id=')) {
                        id = href.split('id=')[1].split('&')[0]
                    }
                }

                // Ignore common non-party stuff
                const ignore = ['archive', 'action', 'about', 'contact', 'home', 'index', 'php', 'css', 'js', 'img', 'images']
                if (!id || ignore.includes(id.toLowerCase()) || id.length < 3) return null

                // Ensure absolute URL
                const absoluteUrl = new URL(href, window.location.href).toString()

                // Extract Date: 
                // 1. Look in next sibling <td>
                let rawDate = ''
                const parentTd = a.closest('td')
                if (parentTd) {
                    const nextTd = parentTd.nextElementSibling
                    if (nextTd) {
                        const dateMatch = nextTd.textContent?.trim().match(/([A-Z][a-z]+ \d{1,2}, \d{4})/)
                        if (dateMatch) rawDate = dateMatch[1]
                    }
                }

                // 2. Fallback: Search the entire table row text
                if (!rawDate) {
                    const rowText = a.closest('tr')?.textContent || ''
                    const dateMatch = rowText.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/)
                    if (dateMatch) rawDate = dateMatch[1]
                }

                // 3. Last Resort Fallback: Sibling text traversal (old method)
                if (!rawDate) {
                    let next = a.nextSibling
                    while (next) {
                        const content = next.textContent?.trim() || ''
                        const dateMatch = content.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/)
                        if (dateMatch) {
                            rawDate = dateMatch[1]
                            break
                        }
                        if (next.nodeType === 1) break
                        next = next.nextSibling
                    }
                }

                // 4. Date from ID Fallback
                if (!rawDate) {
                    const dateMatch = id.match(/(\d{2})(\d{2})(\d{2})$/)
                    if (dateMatch) {
                        const [_, mm, dd, yy] = dateMatch
                        const year = parseInt(yy) > 25 ? `19${yy}` : `20${yy}`
                        // We won't set rawDate here because parseDate handles Month Name, 
                        // but we can return it as a backup
                    }
                }

                // The link text (text) is canonical for the album/party name. 
                // We should clean it only slightly (trim).
                let title = text.trim()

                // Series extraction: 
                // This is still useful for grouping consecutive days, but it shouldn't be the label.
                // We derive it from the ID (folder name) but keep it as a secondary attribute.
                let series = id.replace(/\d+/g, '')
                if (id.toLowerCase().includes('taint') || id.startsWith('5')) {
                    series = 'Five Inch Taint'
                } else {
                    series = series.charAt(0).toUpperCase() + series.slice(1)
                }

                // If the link text is a number (common for multi-page galleries or lazy naming), 
                // we then use the folder name (Series) as a fallback.
                if (/^\d+$/.test(title) || !title) {
                    title = `${series} (${id})`
                }

                // If the user says "Melissa" (id: melissa121705) is not a party name, 
                // it's likely because the system was showing the ID-based name.
                // By making 'title' = 'text', we respect the <a> tag's contents.

                return {
                    id: id.toLowerCase(),
                    title,
                    url: absoluteUrl,
                    series,
                    party_date: rawDate
                }
            }).filter(p => p !== null)
        })

        // Helper to parse "Month DD, YYYY" to "YYYY-MM-DD"
        const parseDate = (d: string) => {
            if (!d) return null
            try {
                // Handle cases like "October 30, 2009"
                const date = new Date(d)
                if (isNaN(date.getTime())) return null
                return date.toISOString().split('T')[0]
            } catch {
                return null
            }
        }

        // Helper to parse numeric IDs like "031710"
        const parseIdDate = (id: string) => {
            const dateMatch = id.match(/(\d{2})(\d{2})(\d{2})$/)
            if (!dateMatch) return null
            const [_, mm, dd, yy] = dateMatch
            const year = parseInt(yy) > 80 ? `19${yy}` : `20${yy}` // Heuristic
            return `${year}-${mm}-${dd}`
        }

        // Remove duplicates, prioritizing the 'best' title (non-autogenerated)
        const uniqueMap = new Map()
        const ext_logs: any[] = []

        discovered.forEach(p => {
            if (!p) return
            const raw = p.party_date
            p.party_date = parseDate(p.party_date) || parseIdDate(p.id)

            if (ext_logs.length < 20 && p.party_date) {
                ext_logs.push({ id: p.id, raw, parsed: p.party_date })
            }

            const existing = uniqueMap.get(p.id)
            const isGenerated = p.title.includes('(' + p.id + ')')

            if (!existing) {
                uniqueMap.set(p.id, p)
            } else {
                const existingIsGenerated = existing.title.includes('(' + existing.id + ')')
                // If existing is generated but new isn't, or existing is shorter
                if (existingIsGenerated && !isGenerated) {
                    uniqueMap.set(p.id, p)
                } else if (!existing.party_date && p.party_date) {
                    // Update if we found a date (sometimes one link has it, another doesn't)
                    uniqueMap.set(p.id, p)
                } else if (p.title.length > existing.title.length) {
                    uniqueMap.set(p.id, p)
                }
            }
        })
        const unique = Array.from(uniqueMap.values())
        console.log(`📦 Deduped to ${unique.length} unique parties before disambiguation.`)

        // Disambiguate names for recurring parties
        const finalParties = disambiguatePartyNames(unique)
        console.log(`✨ Disambiguated names for ${finalParties.length} parties.`)

        let added = 0
        console.log(`🚀 Starting DB update for ${finalParties.length} parties...`)
        for (const party of finalParties) {
            try {
                // Force update title, series, and DATE
                const result = await db.prepare(`
                    INSERT INTO parties (id, title, url, series, party_date)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET 
                        url = CASE 
                            WHEN excluded.url NOT LIKE '%index2%' AND excluded.url NOT LIKE '%index3%' THEN excluded.url 
                            ELSE parties.url 
                        END,
                        title = CASE 
                            WHEN parties.title IN ('2', '3', '4', '5') OR parties.title GLOB '[0-9]*' THEN excluded.title
                            WHEN LENGTH(excluded.title) > LENGTH(parties.title) AND excluded.title NOT GLOB '[0-9]*' THEN excluded.title
                            ELSE parties.title 
                        END,
                        series = excluded.series,
                        party_date = COALESCE(excluded.party_date, parties.party_date)
                `).bind(party!.id, party!.title, party!.url, party!.series, party!.party_date).run()

                if (result.meta?.changes > 0) {
                    added++
                }
            } catch (e) {
                console.error(`Failed to insert/update party ${party!.id}:`, e)
            }
        }

        await browser.close()
        return { total_found: unique.length, processed: added }

    } catch (e: any) {
        if (browser) await browser.close()
        throw e
    }
}
