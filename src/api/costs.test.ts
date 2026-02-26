import { describe, it, expect } from 'vitest'
import { calculateMonthlyCosts } from './costs'

describe('Costs Calculation', () => {
    it('should stay within free tier for low traffic', () => {
        const scenario: UsageScenario = {
            monthlyVisitors: 1000,
            roundsPerVisitor: 5,
            partiesScrapedPerMonth: 5,
            avgPhotosPerParty: 20,
            plan: 'FREE'
        }
        const costs = calculateMonthlyCosts(scenario)
        expect(costs.isFreeTierExceeded).toBe(false)
        expect(costs.total).toBe(0)
    })

    it('should detect worker limit breach', () => {
        const scenario: UsageScenario = {
            monthlyVisitors: 1000000, // 1M visitors will definitely breach free workers
            roundsPerVisitor: 3,
            partiesScrapedPerMonth: 10,
            avgPhotosPerParty: 50,
            plan: 'FREE'
        }
        const costs = calculateMonthlyCosts(scenario)
        expect(costs.isFreeTierExceeded).toBe(true)
        expect(costs.exceededLimits).toContain('Workers Requests')
        expect(costs.rejectedUsage['Workers Requests']).toBeGreaterThan(0)
    })

    it('should calculate paid plan overages for high volume', () => {
        const scenario: UsageScenario = {
            monthlyVisitors: 500000,
            roundsPerVisitor: 10,
            partiesScrapedPerMonth: 100,
            avgPhotosPerParty: 100,
            plan: 'PAID'
        }
        const costs = calculateMonthlyCosts(scenario)
        expect(costs.total).toBeGreaterThan(5) // Base fee + overages
        expect(costs.workers).toBeGreaterThan(0)
    })

    it('should show zero cost on FREE plan even if limits exceeded', () => {
        const scenario: UsageScenario = {
            monthlyVisitors: 500000,
            roundsPerVisitor: 3,
            partiesScrapedPerMonth: 10,
            avgPhotosPerParty: 50,
            plan: 'FREE'
        }
        const costs = calculateMonthlyCosts(scenario)
        expect(costs.total).toBe(0)
        expect(costs.isFreeTierExceeded).toBe(true)
    })
})
