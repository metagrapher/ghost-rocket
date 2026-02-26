import { describe, it, expect, beforeEach } from 'vitest'
import './OptionButton'
import { OptionButton } from './OptionButton'

describe('OptionButton Component', () => {
    let el: OptionButton

    beforeEach(async () => {
        el = document.createElement('option-button') as OptionButton
        document.body.appendChild(el)
        await el.updateComplete
    })

    it('should render with label', async () => {
        el.label = 'Test Label'
        await el.updateComplete
        const button = el.shadowRoot?.querySelector('button')
        expect(button?.textContent?.trim()).toBe('Test Label')
    })

    it('should apply correct state class', async () => {
        el.state = 'correct'
        await el.updateComplete
        const button = el.shadowRoot?.querySelector('button')
        expect(button?.classList.contains('correct')).toBe(true)
    })

    it('should apply wrong state class', async () => {
        el.state = 'wrong'
        await el.updateComplete
        const button = el.shadowRoot?.querySelector('button')
        expect(button?.classList.contains('wrong')).toBe(true)
    })
})
