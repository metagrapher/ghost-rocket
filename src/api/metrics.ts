
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

export const getUsageStats = async (env: any, period: 'month' | 'all' = 'month') => {
    // Current month start
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const queryStart = period === 'month' ? startOfMonth : 0

    // 1. Aggregated Daily Stats (for Chart)
    const { results: dailyStats } = await env.DB.prepare(`
        SELECT 
            strftime('%Y-%m-%d', datetime(timestamp / 1000, 'unixepoch')) as date,
            COUNT(*) as total_requests,
            SUM(CASE WHEN type = 'page_view' THEN 1 ELSE 0 END) as visitors,
            SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as errors,
            SUM(CASE WHEN path LIKE '/api/quiz' THEN 1 ELSE 0 END) as game_rounds
        FROM usage_metrics
        WHERE timestamp > ?
        GROUP BY date
        ORDER BY date ASC
    `).bind(queryStart).all()

    // 2. Month Totals (for Cost Calc)
    let currentMonth = {
        visitors: 0,
        requests: 0,
        gameRounds: 0,
        errors: 0
    }

    dailyStats.forEach((day: any) => {
        currentMonth.visitors += day.visitors
        currentMonth.requests += day.total_requests
        currentMonth.gameRounds += day.game_rounds
        currentMonth.errors += day.errors
    })

    // 3. Scrape Stats (Month)
    // We need to count how many parties were scraped this month
    const { results: scrapedStats } = await env.DB.prepare(`
        SELECT COUNT(*) as count, SUM(images_saved) as images
        FROM scrape_status 
        WHERE status = 'success' AND last_scraped_at > ?
    `).bind(startOfMonth).all()

    const scrapedCount = scrapedStats[0]?.count || 0
    const imagesSaved = scrapedStats[0]?.images || 0

    return {
        daily: dailyStats,
        currentMonth: {
            ...currentMonth,
            partiesScraped: scrapedCount,
            imagesSaved: imagesSaved
        }
    }
}
