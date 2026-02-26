
export interface Party {
    id: string;
    title: string;
    url: string;
    series: string;
    party_date: string | null; // dates should be ISO YYYY-MM-DD
}

export function disambiguatePartyNames(parties: Party[]): Party[] {
    // 1. Sort by date just in case
    const sorted = [...parties].sort((a, b) => {
        if (!a.party_date) return 1;
        if (!b.party_date) return -1;
        return a.party_date.localeCompare(b.party_date);
    });

    // 2. Group by title
    const clusters = new Map<string, Party[]>();
    for (const p of sorted) {
        if (!clusters.has(p.title)) {
            clusters.set(p.title, []);
        }
        clusters.get(p.title)!.push(p);
    }

    const result: Party[] = [];

    // 3. Process each title group
    for (const [title, group] of clusters.entries()) {
        if (group.length <= 1) {
            result.push(...group);
            continue;
        }

        // Check for consecutive streaks or multiple distinct events
        // We'll separate them into "Events". 
        // An event is a set of parties with consecutive dates (gap <= 1 day).
        // If a party has no date, it's considered its own isolated event for safety.

        const events: Party[][] = [];
        let currentEvent: Party[] = [];

        for (const p of group) {
            if (currentEvent.length === 0) {
                currentEvent.push(p);
            } else {
                const lastP = currentEvent[currentEvent.length - 1];
                if (canCombine(lastP.party_date, p.party_date)) {
                    currentEvent.push(p);
                } else {
                    events.push(currentEvent);
                    currentEvent = [p];
                }
            }
        }
        if (currentEvent.length > 0) {
            events.push(currentEvent);
        }

        // If we have multiple events for the same title, we need to disambiguate
        if (events.length > 1) {
            for (const eventParties of events) {
                // Use the start date of the event to label it
                // If the first party in the event has no date, skip appending (or handle differently?)
                // Based on requirements, if we have date, we use it.
                const startDate = eventParties[0].party_date;
                if (startDate) {
                    for (const p of eventParties) {
                        p.title = `${p.title} (${startDate})`;
                    }
                }
                result.push(...eventParties);
            }
        } else {
            // Only one event (could be multi-day), no changes needed
            result.push(...events[0]);
        }
    }

    return result;
}

function canCombine(dateA: string | null, dateB: string | null): boolean {
    if (!dateA || !dateB) return false;
    const d1 = new Date(dateA);
    const d2 = new Date(dateB);

    // allow gap of 1 day (consecutive)
    // 1 day in ms = 86400000
    const diff = Math.abs(d2.getTime() - d1.getTime());
    return diff <= 86400000 * 1.5; // generous 1.5 days to account for potential timezone weirdness if any, but strictly it's usually adjacent days
}
