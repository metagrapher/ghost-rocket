export interface UsageScenario {
    monthlyVisitors: number
    roundsPerVisitor: number
    partiesScrapedPerMonth: number
    avgPhotosPerParty: number
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
}

export const PRICING = {
    FREE: {
        MONTHLY_FEE: 0,
        WORKERS_REQUESTS: 100_000, // per day
        D1_ROWS_READ: 5_000_000, // per day
        D1_ROWS_WRITE: 100_000, // per day
        D1_STORAGE_GB: 5,
        R2_CLASS_A: 1_000_000,
        R2_CLASS_B: 10_000_000,
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
        BROWSER_OVERAGE_HOUR: 0.10, // approximate based on general lambda/compute pricing if not specified
        KV_READS_OVERAGE: 0.50 / 1_000_000,
        KV_WRITES_OVERAGE: 5.00 / 1_000_000,
    }
}

// Estimates per unit of usage
export const UNIT_USAGE = {
    VISITOR: {
        WORKERS_REQ: 5, // page load + a few assets/api calls
        D1_READS: 10,
        D1_WRITES: 1, // session/analytics
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
    const { monthlyVisitors, roundsPerVisitor, partiesScrapedPerMonth, avgPhotosPerParty } = scenario

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

    // Check Free Tier Breaches (Daily limits converted to monthly approx)
    const DAILY_TO_MONTHLY = 30
    const exceededLimits: string[] = []
    if (reqs / DAILY_TO_MONTHLY > PRICING.FREE.WORKERS_REQUESTS) exceededLimits.push('Workers Requests')
    if (d1Reads / DAILY_TO_MONTHLY > PRICING.FREE.D1_ROWS_READ) exceededLimits.push('D1 Reads')
    if (d1Writes / DAILY_TO_MONTHLY > PRICING.FREE.D1_ROWS_WRITE) exceededLimits.push('D1 Writes')
    if (browserMin / DAILY_TO_MONTHLY > PRICING.FREE.BROWSER_MIN_PER_DAY) exceededLimits.push('Browser Rendering')
    if (kvReads / DAILY_TO_MONTHLY > PRICING.FREE.KV_READS) exceededLimits.push('KV Reads')

    if (r2A > PRICING.FREE.R2_CLASS_A) exceededLimits.push('R2 Class A')
    if (r2B > PRICING.FREE.R2_CLASS_B) exceededLimits.push('R2 Class B')

    const isFreeTierExceeded = exceededLimits.length > 0

    // Paid Plan Calculation
    let paidTotal = PRICING.PAID.MONTHLY_FEE

    // Workers overage
    if (reqs > PRICING.PAID.WORKERS_INCLUDED_REQ) {
        paidTotal += (reqs - PRICING.PAID.WORKERS_INCLUDED_REQ) * PRICING.PAID.WORKERS_OVERAGE_REQ
    }

    // D1 Read overage (Billions included, so likely few overages for small sites)
    if (d1Reads > PRICING.PAID.D1_INCLUDED_READS) {
        paidTotal += (d1Reads - PRICING.PAID.D1_INCLUDED_READS) * PRICING.PAID.D1_OVERAGE_READS
    }

    // D1 Write overage
    if (d1Writes > PRICING.PAID.D1_INCLUDED_WRITES) {
        paidTotal += (d1Writes - PRICING.PAID.D1_INCLUDED_WRITES) * PRICING.PAID.D1_OVERAGE_WRITES
    }

    // R2 Operations (1M included for A, 10M for B)
    if (r2A > PRICING.FREE.R2_CLASS_A) {
        paidTotal += (r2A - PRICING.FREE.R2_CLASS_A) * PRICING.PAID.R2_CLASS_A
    }
    if (r2B > PRICING.FREE.R2_CLASS_B) {
        paidTotal += (r2B - PRICING.FREE.R2_CLASS_B) * PRICING.PAID.R2_CLASS_B
    }

    // Browser Overage
    const browserHours = browserMin / 60
    if (browserHours > PRICING.PAID.BROWSER_INCLUDED_HOURS) {
        paidTotal += (browserHours - PRICING.PAID.BROWSER_INCLUDED_HOURS) * PRICING.PAID.BROWSER_OVERAGE_HOUR
    }

    return {
        workers: reqs > PRICING.PAID.WORKERS_INCLUDED_REQ ? (reqs - PRICING.PAID.WORKERS_INCLUDED_REQ) * PRICING.PAID.WORKERS_OVERAGE_REQ : 0,
        d1: (d1Writes > PRICING.PAID.D1_INCLUDED_WRITES ? (d1Writes - PRICING.PAID.D1_INCLUDED_WRITES) * PRICING.PAID.D1_OVERAGE_WRITES : 0),
        r2: ((r2A > PRICING.FREE.R2_CLASS_A ? (r2A - PRICING.FREE.R2_CLASS_A) * PRICING.PAID.R2_CLASS_A : 0) + (r2B > PRICING.FREE.R2_CLASS_B ? (r2B - PRICING.FREE.R2_CLASS_B) * PRICING.PAID.R2_CLASS_B : 0)),
        browsers: browserHours > PRICING.PAID.BROWSER_INCLUDED_HOURS ? (browserHours - PRICING.PAID.BROWSER_INCLUDED_HOURS) * PRICING.PAID.BROWSER_OVERAGE_HOUR : 0,
        kv: 0, // usually negligible
        total: paidTotal,
        isFreeTierExceeded,
        exceededLimits
    }
}
