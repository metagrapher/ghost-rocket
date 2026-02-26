
import { describe, it, expect } from 'vitest';
import { disambiguatePartyNames, Party } from './name-utils';

function p(id: string, title: string, party_date: string | null): Party {
    return { id, title, party_date, url: '', series: '' };
}

describe('disambiguatePartyNames', () => {
    it('leaves unique parties alone', () => {
        const input = [
            p('1', 'Party A', '2023-01-01'),
            p('2', 'Party B', '2023-01-02'),
        ];
        const result = disambiguatePartyNames(input);
        expect(result).toEqual(input);
    });

    it('leaves single multi-day party alone', () => {
        const input = [
            p('1', 'Fest', '2023-01-01'),
            p('2', 'Fest', '2023-01-02'),
            p('3', 'Fest', '2023-01-03'),
        ];
        const result = disambiguatePartyNames(input);
        expect(result.map(x => x.title)).toEqual(['Fest', 'Fest', 'Fest']);
    });

    it('disambiguates two separate parties with same name', () => {
        const input = [
            p('1', 'Fest', '2023-01-01'), // Event 1
            p('2', 'Fest', '2023-06-01'), // Event 2
        ];
        const result = disambiguatePartyNames(input);
        expect(result.find(x => x.id === '1')!.title).toBe('Fest (2023-01-01)');
        expect(result.find(x => x.id === '2')!.title).toBe('Fest (2023-06-01)');
    });

    it('disambiguates a multi-day party from another separate party', () => {
        const input = [
            p('1', 'Fest', '2023-01-01'),
            p('2', 'Fest', '2023-01-02'),
            p('3', 'Fest', '2023-06-01'),
        ];
        // Expected: 1&2 get (2023-01-01), 3 gets (2023-06-01)
        const result = disambiguatePartyNames(input);
        expect(result.find(x => x.id === '1')!.title).toBe('Fest (2023-01-01)');
        expect(result.find(x => x.id === '2')!.title).toBe('Fest (2023-01-01)');
        expect(result.find(x => x.id === '3')!.title).toBe('Fest (2023-06-01)');
    });

    it('handles non-sorted input', () => {
        const input = [
            p('3', 'Fest', '2023-06-01'),
            p('1', 'Fest', '2023-01-01'),
        ];
        const result = disambiguatePartyNames(input);
        expect(result.find(x => x.id === '1')!.title).toBe('Fest (2023-01-01)');
        expect(result.find(x => x.id === '3')!.title).toBe('Fest (2023-06-01)');
    });

    it('handles mixed content', () => {
        const input = [
            p('1', 'A', '2023-01-01'),
            p('2', 'B', '2023-01-01'),
            p('3', 'A', '2023-02-01'),
        ];
        const result = disambiguatePartyNames(input);
        // A should be split
        expect(result.find(x => x.id === '1')!.title).toBe('A (2023-01-01)');
        expect(result.find(x => x.id === '3')!.title).toBe('A (2023-02-01)');
        // B should be untouched
        expect(result.find(x => x.id === '2')!.title).toBe('B');
    });
});
