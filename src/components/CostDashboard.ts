import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { calculateMonthlyCosts, PRICING } from '../api/costs'

@customElement('cost-dashboard')
export class CostDashboard extends LitElement {
    static styles = css`
        :host {
            display: block;
            color: #e0e0e0;
            font-family: 'Inter', sans-serif;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
        }

        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
        }

        .card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 1.5rem;
            padding: 2rem;
        }

        h2 {
            margin-top: 0;
            font-size: 1.5rem;
            font-weight: 900;
            letter-spacing: -0.025em;
            background: linear-gradient(to right, #white, #00f3ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .slider-group {
            margin-bottom: 1.5rem;
        }

        label {
            display: block;
            font-size: 0.75rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 0.5rem;
        }

        .slider-row {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        input[type="range"] {
            flex-grow: 1;
            accent-color: #bc13fe;
        }

        .value {
            font-family: monospace;
            min-width: 4rem;
            text-align: right;
            font-weight: 700;
            color: #00f3ff;
        }

        .cost-hero {
            text-align: center;
            margin-bottom: 2rem;
        }

        .total-price {
            font-size: 4rem;
            font-weight: 900;
            color: #bc13fe;
            text-shadow: 0 0 30px rgba(188, 19, 254, 0.4);
        }

        .breach-alert {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: #f87171;
            padding: 1rem;
            border-radius: 1rem;
            margin-top: 1rem;
            font-size: 0.875rem;
        }

        .breakdown-row {
            display: flex;
            justify-content: space-between;
            padding: 0.75rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 0.9rem;
        }

        .breakdown-row:last-child {
            border-bottom: none;
        }

        .warning-icon {
            color: #fbbf24;
            margin-right: 0.5rem;
        }
    `

    @state() dailyVisitors = 1000
    @state() roundsPerVisitor = 10
    @state() partiesScrapedPerMonth = 10
    @state() avgPhotosPerParty = 200
    @state() selectedPlan: 'FREE' | 'PAID' = 'FREE'

    render() {
        const scenario = {
            monthlyVisitors: this.dailyVisitors * 30,
            roundsPerVisitor: this.roundsPerVisitor,
            partiesScrapedPerMonth: this.partiesScrapedPerMonth,
            avgPhotosPerParty: this.avgPhotosPerParty,
            plan: this.selectedPlan
        }

        const costs = calculateMonthlyCosts(scenario)
        const paidComparison = calculateMonthlyCosts({ ...scenario, plan: 'PAID' })

        return html`
            <div class="grid">
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                        <h2 style="margin: 0;">Traffic Scenario</h2>
                        <div class="plan-toggle">
                            <button class="${this.selectedPlan === 'FREE' ? 'active' : ''}" 
                                @click=${() => this.selectedPlan = 'FREE'}>Free</button>
                            <button class="${this.selectedPlan === 'PAID' ? 'active' : ''}" 
                                @click=${() => this.selectedPlan = 'PAID'}>Paid</button>
                        </div>
                    </div>
                    
                    <style>
                        .plan-toggle {
                            background: rgba(255, 255, 255, 0.05);
                            padding: 0.25rem;
                            border-radius: 0.75rem;
                            display: flex;
                            gap: 0.25rem;
                        }
                        .plan-toggle button {
                            background: transparent;
                            border: none;
                            color: rgba(255, 255, 255, 0.4);
                            padding: 0.5rem 1rem;
                            border-radius: 0.5rem;
                            font-weight: 800;
                            text-transform: uppercase;
                            font-size: 0.7rem;
                            cursor: pointer;
                            transition: all 0.2s;
                        }
                        .plan-toggle button.active {
                            background: #bc13fe;
                            color: white;
                            box-shadow: 0 0 15px rgba(188, 19, 254, 0.4);
                        }
                    </style>

                    <div class="slider-group">
                        <label>Daily Visitors</label>
                        <div class="slider-row">
                            <input type="range" min="100" max="1000000" step="1" 
                                .value=${this.dailyVisitors.toString()} 
                                @input=${(e: any) => this.dailyVisitors = parseInt(e.target.value)}>
                            <span class="value">${this.formatNumber(this.dailyVisitors)}</span>
                        </div>
                    </div>

                    <div class="slider-group">
                        <label>Game Rounds per Visitor</label>
                        <div class="slider-row">
                            <input type="range" min="10" max="5000" step="10" 
                                .value=${this.roundsPerVisitor.toString()} 
                                @input=${(e: any) => this.roundsPerVisitor = parseInt(e.target.value)}>
                            <span class="value">${this.roundsPerVisitor}</span>
                        </div>
                    </div>

                    <div class="slider-group">
                        <label>Parties Scraped / Month</label>
                        <div class="slider-row">
                            <input type="range" min="0" max="500" step="5" 
                                .value=${this.partiesScrapedPerMonth.toString()} 
                                @input=${(e: any) => this.partiesScrapedPerMonth = parseInt(e.target.value)}>
                            <span class="value">${this.partiesScrapedPerMonth}</span>
                        </div>
                    </div>

                    <div class="slider-group">
                        <label>Avg Photos / Party</label>
                        <div class="slider-row">
                            <input type="range" min="10" max="250" step="10" 
                                .value=${this.avgPhotosPerParty.toString()} 
                                @input=${(e: any) => this.avgPhotosPerParty = parseInt(e.target.value)}>
                            <span class="value">${this.avgPhotosPerParty}</span>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="cost-hero">
                        <label>${this.selectedPlan === 'FREE' ? 'Current Plan: FREE' : 'Estimated Monthly Cost (Paid)'}</label>
                        <div class="total-price">${this.selectedPlan === 'FREE' ? 'FREE' : '$' + costs.total.toFixed(2)}</div>
                        ${this.selectedPlan === 'FREE' && costs.isFreeTierExceeded ? html`
                            <div style="color: #f87171; font-weight: 800; font-size: 0.8rem; margin-top: 0.5rem;">
                                DOWNTIME EXPECTED ON THIS SCALE
                            </div>
                        ` : ''}
                    </div>

                    ${costs.isFreeTierExceeded ? html`
                        <div class="breach-alert">
                            <strong>⚠️ ${this.selectedPlan === 'FREE' ? 'USAGE REJECTED / ERRORS' : 'FREE PLAN BREACHED'}</strong>
                            <p>Exceeded thresholds for: ${costs.exceededLimits.join(', ')}</p>
                            <div style="margin-top: 1rem; border-top: 1px solid rgba(239, 68, 68, 0.2); pt-2;">
                                <label style="margin-top: 0.5rem;">Rejected Usage / Month:</label>
                                ${Object.entries(costs.rejectedUsage).map(([k, v]) => html`
                                    <div class="breakdown-row" style="color: #ef4444; border: none; padding: 0.25rem 0;">
                                        <span>${k}</span>
                                        <span>${this.formatNumber(Math.floor(v))} rejected</span>
                                    </div>
                                `)}
                            </div>
                            ${this.selectedPlan === 'FREE' ? html`
                                <p style="margin-top: 1rem; color: #fbbf24; font-size: 0.75rem;">
                                    Tip: Switch to <strong>PAID</strong> plan to see costs ($${paidComparison.total.toFixed(2)}) for handling this traffic.
                                </p>
                            ` : ''}
                        </div>
                    ` : html`
                        <div class="breach-alert" style="background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.2); color: #4ade80;">
                            <strong>✅ SAFE ON FREE PLAN</strong>
                            <p>Current scenario fits within free tier daily limits.</p>
                        </div>
                    `}

                    <div style="margin-top: 2rem;">
                        <label>Monthly Cost Breakdown (Paid Projection)</label>
                        <div class="breakdown-row">
                            <span>Base Subscription</span>
                            <span>$5.00</span>
                        </div>
                        <div class="breakdown-row">
                            <span>Workers Overages</span>
                            <span>$${paidComparison.workers.toFixed(2)}</span>
                        </div>
                        <div class="breakdown-row">
                            <span>D1 Overages</span>
                            <span>$${paidComparison.d1.toFixed(2)}</span>
                        </div>
                        <div class="breakdown-row">
                            <span>R2 Operations Overages</span>
                            <span>$${paidComparison.r2.toFixed(2)}</span>
                        </div>
                        <div class="breakdown-row">
                            <span>Browser Rendering Overages</span>
                            <span>$${paidComparison.browsers.toFixed(2)}</span>
                        </div>
                        <div class="breakdown-row" style="font-weight: 900; color: white; border-top: 1px solid rgba(255, 255, 255, 0.2); margin-top: 0.5rem;">
                            <span>Total Estimated Monthly</span>
                            <span>$${paidComparison.total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `
    }

    private formatNumber(num: number): string {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
        return num.toString()
    }
}
