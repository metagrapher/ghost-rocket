import Gun from 'gun/gun'

// Define types for presence
export interface Raver {
    id: string
    x: number
    y: number
    hue: number // Visual seed (0-360)
    lastSeen: number
    name?: string
    score?: number
}

// Singleton Gun instance
let gunInstance: any = null;

export const getGun = () => {
    if (gunInstance) return gunInstance;

    const peers = [
        // Local dev vs Production handling
        window.location.hostname === 'localhost'
            ? `ws://${window.location.host}/api/gun`
            : `wss://${window.location.host}/api/gun`
    ];

    gunInstance = Gun({
        peers,
        localStorage: false, // Don't clog local storage, rely on memory + relay
        radisk: false,
    });

    return gunInstance;
}

// Helper to generate a consistent "Raver ID" for this session
export const getMyRaverId = () => {
    let id = sessionStorage.getItem('raver_id');
    if (!id) {
        id = `raver_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('raver_id', id);
    }
    return id;
}
