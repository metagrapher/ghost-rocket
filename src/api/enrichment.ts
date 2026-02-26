export interface EnrichmentResult {
    latitude: number | null
    longitude: number | null
    location_name: string | null
    party_date: string | null
    lineup: string[]
    enrichment_level?: number
}

// Gradient Enrichment Types
// 0x[Date][Location][Lineup]

const DATE_WEIGHT = 256 // 16^2
const LOC_WEIGHT = 16   // 16^1
const LINEUP_WEIGHT = 1 // 16^0

enum DateState {
    UNKNOWN = 0,
    YEAR_ONLY = 1,
    MONTH_YEAR = 2,
    PARTIAL = 3,
    EXACT = 0xF
}

enum LocationState {
    UNKNOWN = 0,
    VAGUE = 1,     // "London", "South East"
    CITY = 2,      // "Brixton Academy, London"
    COORDS = 0xF   // Exact lat/long
}

enum LineupState {
    UNKNOWN = 0,
    SINGLE = 1,
    PARTIAL = 2,
    FULL = 0xF
}

function calculateEnrichmentLevel(data: EnrichmentResult): number {
    let dateScore = DateState.UNKNOWN
    if (data.party_date) {
        // Simple heuristic: if we have a full YYYY-MM-DD string
        if (/^\d{4}-\d{2}-\d{2}$/.test(data.party_date)) {
            dateScore = DateState.EXACT
        } else if (data.party_date.length === 4) { // YYYY
            dateScore = DateState.YEAR_ONLY
        } else {
            dateScore = DateState.MONTH_YEAR
        }
    }

    let locScore = LocationState.UNKNOWN
    if (data.latitude && data.longitude) {
        locScore = LocationState.COORDS
    } else if (data.location_name) {
        // If we have a location name but no coords, it's at least CITY level for now
        locScore = LocationState.CITY
    }

    let lineupScore = LineupState.UNKNOWN
    if (data.lineup && data.lineup.length > 0) {
        if (data.lineup.length > 2) {
            lineupScore = LineupState.FULL
        } else {
            lineupScore = LineupState.SINGLE
        }
    }

    // 0x[Date][Location][Lineup]
    return (dateScore * DATE_WEIGHT) + (locScore * LOC_WEIGHT) + (lineupScore * LINEUP_WEIGHT)
}

export async function enrichPartyWithAI(partyId: string, env: any): Promise<EnrichmentResult | null> {
    const ai = env.AI
    const bucket = env.BUCKET
    const db = env.DB

    if (!ai) {
        console.error('AI binding not found')
        return null
    }

    // Get a couple of images from R2 to analyze
    let objects;
    try {
        objects = await bucket.list({ prefix: `${partyId}/`, limit: 3 })
    } catch (err: any) {
        console.error(`❌ Bucket list failed for ${partyId}:`, err)
        return null
    }

    console.log(`📂 Found ${objects.objects.length} objects for ${partyId}`)

    if (objects.objects.length === 0) {
        console.warn(`⚠️ No images found in R2 for party ${partyId}. Cannot enrich.`)
        return null
    }

    // For now, let's just pick one image to analyze for location/date/lineup
    // In a more robust version, we might aggregate multiple images
    const imageKey = objects.objects[0].key
    const imageRes = await bucket.get(imageKey)
    if (!imageRes) return null

    const imageArrayBuffer = await imageRes.arrayBuffer()
    const imageData = Array.from(new Uint8Array(imageArrayBuffer))

    console.log(`🤖 AI Enrichment: Analyzing ${imageKey} for party ${partyId} (Image size: ${imageData.length} bytes)`)

    const prompt = `agree
    Analyze this image from an ARCHIVED RAVE/PARTY in the early 2000s/2010s. 
    Try to determine:
    1. The geolocation (latitude and longitude) of where this party took place.
    2. The name of the venue or location.
    3. The exact date (YYYY-MM-DD) or approximate date.
    4. The lineup of DJs or artists if a flyer or schedule is visible.

    Return the data in the following JSON format ONLY:
    {
      "latitude": number | null,
      "longitude": number | null,
      "location_name": "string" | null,
      "party_date": "YYYY-MM-DD" | null,
      "lineup": ["artist1", "artist2"]
    }
    If you cannot find a specific field, return null for that field.`

    try {
        const response = await ai.run('@cf/meta/llama-3.2-11b-vision-instruct', {
            prompt: prompt,
            image: imageData,
        })

        // Simple parsing logic (assuming AI returns clean JSON)
        // In practice, we might need a regex to extract JSON from the text
        const jsonMatch = response.response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            console.log('⚠️ AI response did not contain JSON:', response.response)
            return null
        }

        const data: EnrichmentResult = JSON.parse(jsonMatch[0])
        const enrichmentLevel = calculateEnrichmentLevel(data)
        data.enrichment_level = enrichmentLevel

        // Update D1
        console.log(`✅ AI Enrichment Success for ${partyId}:`, data)
        await db.prepare(`
            UPDATE parties 
            SET latitude = ?, longitude = ?, location_name = ?, party_date = ?, lineup = ?, enrichment_level = ?, enriched_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(
            data.latitude
            , data.longitude
            , data.location_name
            , data.party_date
            , JSON.stringify(data.lineup)
            , enrichmentLevel
            , partyId
        ).run()

        return data
    } catch (e) {
        console.error('AI Enrichment Failed:', e)
        return null
    }
}
