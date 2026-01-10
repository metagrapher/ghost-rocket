import { describe, it, expect } from 'vitest'
import { calculateMonthlyCosts } from './costs'

describe('Costs Calculation', () => {
    it('should stay within free tier for low traffic', () => {
        const scenario = {
            monthlyVisitors: 100,
            roundsPerVisitor: 5,
            partiesScrapedPerMonth: 2,
            avgPhotosPerParty: 50
        }
        const costs = calculateMonthlyCosts(scenario)
        expect(costs.isFreeTierExceeded).toBe(false)
        expect(costs.total).toBe(5) // Just the base fee if on paid, but we would be on free
    })

    it('should detect worker limit breach', () => {
        const scenario = {
            monthlyVisitors: 100_000, // ~3.3k daily, but unit usage is 5 req/visitor -> 16k req/day
            roundsPerVisitor: 20, // 2M rounds -> 6M req/month -> 200k req/day
            partiesScrapedPerMonth: 10,
            avgPhotosPerParty: 50
        }
        const costs = calculateMonthlyCosts(scenario)
        expect(costs.exceededLimits).toContain('Workers Requests')
        expect(costs.isFreeTierExceeded).toBe(true)
    })

    it('should calculate paid plan overages for high volume', () => {
        const scenario = {
            monthlyVisitors: 1_000_000,
            roundsPerVisitor: 10,
            partiesScrapedPerMonth: 100,
            avgPhotosPerParty: 100
        }
        // reqs = 1M * 5 + 10M * 3 + 100 * 5 = 35M + 500 = 35.0005M
        // overage = 25.0005M * $0.50/M = $12.50
        // base = $5
        // expected total ~ $17.50
        const costs = calculateMonthlyCosts(scenario)
        expect(costs.total).toBeGreaterThan(17)
    })
})
