export interface UsageScenario {
    monthlyVisitors: number
    roundsPerVisitor: number
    partiesScrapedPerMonth: number
    avgPhotosPerParty: number
    plan: 'FREE' | 'PAID'
}

export interface CostBreakdown {
    workers: number
    d1: number
    r2: number
    browsers: number
    kv: number
    total: number
    isFreeTierExceeded: boolean
    exceededLimits: string[]
    rejectedUsage: Record<string, number> // Usage that would be blocked on Free plan
}

export const PRICING = {
    FREE: {
        MONTHLY_FEE: 0,
        WORKERS_REQUESTS: 100_000, // per day
        D1_ROWS_READ: 5_000_000, // per day
        D1_ROWS_WRITE: 100_000, // per day
        D1_STORAGE_GB: 5,
        R2_CLASS_A: 1_000_000, // per month
        R2_CLASS_B: 10_000_000, // per month
        R2_STORAGE_GB: 10,
        BROWSER_MIN_PER_DAY: 10,
        KV_READS: 100_000, // per day
        KV_WRITES: 1_000, // per day
    },
    PAID: {
        MONTHLY_FEE: 5,
        WORKERS_INCLUDED_REQ: 10_000_000,
        WORKERS_OVERAGE_REQ: 0.50 / 1_000_000, // per million
        D1_INCLUDED_READS: 25_000_000_000,
        D1_OVERAGE_READS: 0.001 / 1_000_000,
        D1_INCLUDED_WRITES: 50_000_000,
        D1_OVERAGE_WRITES: 1.00 / 1_000_000,
        D1_STORAGE_GB: 0.75, // per GB after 5 included
        R2_CLASS_A: 4.50 / 1_000_000,
        R2_CLASS_B: 0.36 / 1_000_000,
        R2_STORAGE_GB: 0.015,
        BROWSER_INCLUDED_HOURS: 10,
        BROWSER_OVERAGE_HOUR: 0.10, // approximate
        KV_READS_OVERAGE: 0.50 / 1_000_000,
        KV_WRITES_OVERAGE: 5.00 / 1_000_000,
    }
}

// Estimates per unit of usage
export const UNIT_USAGE = {
    VISITOR: {
        WORKERS_REQ: 5, // page load + a few assets/api calls
        D1_READS: 10,
        D1_WRITES: 5, // 1 per request (metrics)
        KV_READS: 2,
    },
    GAME_ROUND: {
        WORKERS_REQ: 3, // /api/quiz, submission, tags
        D1_READS: 20,
        D1_WRITES: 2,
        R2_CLASS_B: 1, // photo fetch
    },
    SCRAPE_PARTY: {
        WORKERS_REQ: 5,
        BROWSER_MIN: 0.5, // 30 seconds avg
        D1_READS: 100,
        D1_WRITES: 50, // per photo saved
        R2_CLASS_A: 50, // per photo saved
    }
}

export const calculateMonthlyCosts = (scenario: UsageScenario): CostBreakdown => {
    const { monthlyVisitors, roundsPerVisitor, partiesScrapedPerMonth, avgPhotosPerParty, plan } = scenario
    const DAILY_TO_MONTHLY = 30

    // Total Monthly Metrics
    const totalRounds = monthlyVisitors * roundsPerVisitor
    const totalPhotosSaved = partiesScrapedPerMonth * avgPhotosPerParty

    const reqs = (monthlyVisitors * UNIT_USAGE.VISITOR.WORKERS_REQ)
        + (totalRounds * UNIT_USAGE.GAME_ROUND.WORKERS_REQ)
        + (partiesScrapedPerMonth * UNIT_USAGE.SCRAPE_PARTY.WORKERS_REQ)

    const d1Reads = (monthlyVisitors * UNIT_USAGE.VISITOR.D1_READS)
        + (totalRounds * UNIT_USAGE.GAME_ROUND.D1_READS)
        + (partiesScrapedPerMonth * UNIT_USAGE.SCRAPE_PARTY.D1_READS)

    const d1Writes = (monthlyVisitors * UNIT_USAGE.VISITOR.D1_WRITES)
        + (totalRounds * UNIT_USAGE.GAME_ROUND.D1_WRITES)
        + (totalPhotosSaved * 1.5) // padding for logs/status

    const r2A = (totalPhotosSaved * 1.1) // Class A for put
    const r2B = (totalRounds * 1.5) // Class B for get/head

    const browserMin = partiesScrapedPerMonth * UNIT_USAGE.SCRAPE_PARTY.BROWSER_MIN

    const kvReads = monthlyVisitors * UNIT_USAGE.VISITOR.KV_READS

    // Breakdown and Breaches
    const exceededLimits: string[] = []
    const rejectedUsage: Record<string, number> = {}

    const checkLimit = (name: string, current: number, limit: number, isMonthly = false) => {
        const threshold = isMonthly ? limit : limit * DAILY_TO_MONTHLY
        if (current > threshold) {
            exceededLimits.push(name)
            rejectedUsage[name] = current - threshold
        }
    }

    checkLimit('Workers Requests', reqs, PRICING.FREE.WORKERS_REQUESTS)
    checkLimit('D1 Reads', d1Reads, PRICING.FREE.D1_ROWS_READ)
    checkLimit('D1 Writes', d1Writes, PRICING.FREE.D1_ROWS_WRITE)
    checkLimit('Browser Rendering', browserMin, PRICING.FREE.BROWSER_MIN_PER_DAY)
    checkLimit('KV Reads', kvReads, PRICING.FREE.KV_READS)
    checkLimit('R2 Class A', r2A, PRICING.FREE.R2_CLASS_A, true)
    checkLimit('R2 Class B', r2B, PRICING.FREE.R2_CLASS_B, true)

    // D1 Storage Estimation (Metrics)
    const totalRequests = reqs // Approximation: every worker req is a metric row
    const BYTES_PER_ROW = 200
    const totalStorageBytes = totalRequests * BYTES_PER_ROW
    const totalStorageGB = totalStorageBytes / (1024 * 1024 * 1024)

    // Check D1 Storage Limit (Monthly)
    if (totalStorageGB > PRICING.FREE.D1_STORAGE_GB) {
        exceededLimits.push('D1 Storage')
        rejectedUsage['D1 Storage (GB)'] = totalStorageGB - PRICING.FREE.D1_STORAGE_GB
    }

    const isFreeTierExceeded = exceededLimits.length > 0

    // Paid Plan Calculation (always calculated regardless of selected plan for comparison)
    let paidTotal = PRICING.PAID.MONTHLY_FEE

    const workersOver = Math.max(0, reqs - PRICING.PAID.WORKERS_INCLUDED_REQ)
    const workersCost = workersOver * PRICING.PAID.WORKERS_OVERAGE_REQ
    paidTotal += workersCost

    const d1ReadsOver = Math.max(0, d1Reads - PRICING.PAID.D1_INCLUDED_READS)
    const d1ReadsCost = d1ReadsOver * PRICING.PAID.D1_OVERAGE_READS
    paidTotal += d1ReadsCost

    const d1WritesOver = Math.max(0, d1Writes - PRICING.PAID.D1_INCLUDED_WRITES)
    const d1WritesCost = d1WritesOver * PRICING.PAID.D1_OVERAGE_WRITES
    paidTotal += d1WritesCost

    // D1 Storage Overage
    const d1StorageOver = Math.max(0, totalStorageGB - PRICING.FREE.D1_STORAGE_GB) // Paid includes 5GB? Actually pricing says "per GB after 5 included" effectively same base.
    // Wait, PRICING.PAID.D1_STORAGE_GB says 0.75.
    const d1StorageCost = d1StorageOver * 0.75
    paidTotal += d1StorageCost

    const r2AOver = Math.max(0, r2A - PRICING.FREE.R2_CLASS_A)
    const r2ACost = r2AOver * PRICING.PAID.R2_CLASS_A
    paidTotal += r2ACost

    const r2BOver = Math.max(0, r2B - PRICING.FREE.R2_CLASS_B)
    const r2BCost = r2BOver * PRICING.PAID.R2_CLASS_B
    paidTotal += r2BCost

    const browserHours = browserMin / 60
    const browserOver = Math.max(0, browserHours - PRICING.PAID.BROWSER_INCLUDED_HOURS)
    const browserCost = browserOver * PRICING.PAID.BROWSER_OVERAGE_HOUR
    paidTotal += browserCost

    return {
        workers: workersCost,
        d1: d1ReadsCost + d1WritesCost + d1StorageCost,
        r2: r2ACost + r2BCost,
        browsers: browserCost,
        kv: 0, // usually negligible
        total: plan === 'FREE' ? 0 : paidTotal,
        isFreeTierExceeded,
        exceededLimits,
        rejectedUsage
    }
}
