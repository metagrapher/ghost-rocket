
import { scrapeArchive } from './scraper'
import { enrichPartyWithAI } from './enrichment'

export async function runCarl(env: any, forced: boolean = false) {
    const db = env.DB

    // 1. Get Settings
    const config = await db.prepare('SELECT * FROM carl_settings WHERE id = 1').first()
    if (!config) {
        console.error('❌ Carl Settings not found!')
        return { status: 'Error', message: 'Settings missing' }
    }

    if (!config.enabled && !forced) {
        console.log('💤 Carl is sleeping (disabled).')
        return { status: 'Skipped', message: 'Carl is disabled' }
    }

    // 2. Check Frequency (Lockout)
    // Find the last successful scrape time globally or determine if we should run
    // For now, we will simply rely on the cron trigger frequency, but we could enforce a global lockout here.
    // Instead, we'll enforce "Don't scrape the SAME party too often" which is handled by the selection query below.

    // 3. Select Candidates
    // Select parties that have NEVER been scraped OR haven't been scraped in 'frequency_hours'
    const hours = config.frequency_hours || 24

    // We want to pick 1 party to focus on per run (or maybe 2 small ones, but let's stick to 1 for stability)
    // unless forced, then maybe more.
    const { results: parties } = await db.prepare(`
        SELECT p.* FROM parties p
        LEFT JOIN scrape_status s ON p.id = s.party_id
        WHERE s.last_scraped_at IS NULL 
           OR datetime(s.last_scraped_at) < datetime('now', '-' || ? || ' hours')
        ORDER BY s.last_scraped_at ASC NULLS FIRST
        LIMIT 1
    `).bind(hours).all()

    if (parties.length === 0) {
        console.log('✅ Carl is full. No parties need scraping right now.')
        return { status: 'Idle', message: 'No eligible parties found' }
    }

    const party = parties[0]
    console.log(`🍽️ Carl is starting to eat: ${party.title} (${party.id}) with batch size ${config.batch_size}`)

    // 4. Run Scraper
    // We execute this inline (await) so the worker stays alive, or we can use waitUntil if called from an HTTP context.
    // Since this is likely called from a scheduled event or API, we return the promise.

    const report = await scrapeArchive(party, env, config.batch_size)

    // 5. Trigger Enrichment
    if (report.status === 'success') {
        await enrichPartyWithAI(party.id, env)
    }

    return {
        status: 'Executed',
        party: party.id,
        report
    }
}

export async function getCarlStatus(env: any) {
    const db = env.DB
    const config = await db.prepare('SELECT * FROM carl_settings WHERE id = 1').first()

    // Calculate Backlog
    // Count of parties that meet the criteria for scraping
    const hours = config?.frequency_hours || 24
    const backlog = await db.prepare(`
        SELECT COUNT(*) as count FROM parties p
        LEFT JOIN scrape_status s ON p.id = s.party_id
        WHERE s.last_scraped_at IS NULL 
           OR datetime(s.last_scraped_at) < datetime('now', '-' || ? || ' hours')
    `).bind(hours).first('count')

    // Get last run info
    const lastRun = await db.prepare(`
        SELECT last_scraped_at, party_id, status FROM scrape_status 
        ORDER BY last_scraped_at DESC LIMIT 1
    `).first()

    // Get currently active job (if any)
    const currentJob = await db.prepare(`
        SELECT p.title, s.party_id, s.images_found, s.images_saved, s.last_scraped_at 
        FROM scrape_status s
        JOIN parties p ON s.party_id = p.id
        WHERE s.status = 'processing'
        ORDER BY s.last_scraped_at DESC LIMIT 1
    `).first()

    return {
        config,
        backlog,
        lastRun,
        currentJob,
        // Eating if there is literally a job processing, OR if the last run was < 1 min ago (fallback)
        isEating: !!currentJob || (lastRun ? (Date.now() - new Date(lastRun.last_scraped_at as string).getTime() < 60000) : false)
    }
}
