
import posthog from 'posthog-js'

export const initAnalytics = () => {
    // Check if we are in a browser environment
    if (typeof window !== 'undefined') {
        posthog.init('phc_WOIYBNhgqVLYtm6IEg81iDKUWU6hDZNJ289FMPMs72Y',
            {
                api_host: '/api/ingest', // Proxy through our Worker
                person_profiles: 'always',
                persistence: 'memory', // CRITICAL: No cookies/localStorage
                bootstrap: {
                    // If we had server-side info (like geo), we could pass it here
                    // distinctID: '...',
                    // isIdentifiedID: true,
                }
            }
        )
    }
}

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
    if (typeof window !== 'undefined') {
        posthog.capture(eventName, properties)
    }
}
