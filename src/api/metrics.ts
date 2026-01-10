
export const trackRequest = async (
    c: any,
    type: 'page_view' | 'api_call' | 'error' = 'api_call'
) => {
    try {
        const url = new URL(c.req.url)
        const path = url.pathname
        const ip = c.req.header('CF-Connecting-IP') || 'unknown'
        const ua = c.req.header('User-Agent') || 'unknown'
        const status = c.res.status || 200

        // Fire and forget - don't await this to keep response fast
        // Use waitUntil if available (workers)
        const task = c.env.DB.prepare(`
            INSERT INTO usage_metrics (type, path, status, ip, user_agent, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(type, path, status, ip, ua, Date.now()).run()

        if (c.executionCtx && c.executionCtx.waitUntil) {
            c.executionCtx.waitUntil(task)
        } else {
            // If we can't wait until, we just let it float. 
            // In a real production worker, await might be needed if not using waitUntil 
            // but we want to avoid blocking the response.
            // For now, we'll just not await it.
            task.catch((e: any) => console.error('Metrics Error:', e))
        }

    } catch (e) {
        console.error('Failed to track metrics', e)
    }
}

export const getStats = async (env: any) => {
    const now = Date.now()
    const fiveMinAgo = now - (5 * 60 * 1000)
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000)

    // Parallelize queries
    const [activeVisitors, totalRequests, errorCount, dbStats] = await Promise.all([
        // Active Visitors (Unique IPs in last 5 min)
        env.DB.prepare('SELECT COUNT(DISTINCT ip) as count FROM usage_metrics WHERE timestamp > ?').bind(fiveMinAgo).first(),

        // Total Requests (Last 24h)
        env.DB.prepare('SELECT COUNT(*) as count FROM usage_metrics WHERE timestamp > ?').bind(twentyFourHoursAgo).first(),

        // Error Count (Last 24h)
        env.DB.prepare('SELECT COUNT(*) as count FROM usage_metrics WHERE status >= 500 AND timestamp > ?').bind(twentyFourHoursAgo).first(),

        // DB Size / scrape status summary
        env.DB.prepare(`
            SELECT 
                (SELECT COUNT(*) FROM parties) as total_parties,
                (SELECT COUNT(*) FROM photos) as total_photos,
                (SELECT COUNT(*) FROM scrape_status WHERE status = 'success' AND last_scraped_at > ?) as scraped_24h
        `).bind(twentyFourHoursAgo).first()
    ])

    return {
        activeVisitors: activeVisitors?.count || 0,
        requests24h: totalRequests?.count || 0,
        errors24h: errorCount?.count || 0,
        totalParties: dbStats?.total_parties || 0,
        totalPhotos: dbStats?.total_photos || 0,
        scraped24h: dbStats?.scraped_24h || 0
    }
}
