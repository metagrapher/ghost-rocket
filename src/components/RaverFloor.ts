import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getGun, getMyRaverId, type Raver } from '../lib/gun-client';
import './RaverAvatar'; // Import the avatar component

@customElement('raver-floor')
export class RaverFloor extends LitElement {
    @state() ravers: Record<string, Raver> = {};
    @state() myId: string = '';

    private gun: any;
    private walkInterval: any;

    static styles = css`
        :host {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 15vh; /* The "floor" area */
            pointer-events: none; /* Let clicks pass through to content behind, unless clicking an avatar */
            z-index: 9999;
            overflow: hidden;
            /* Optional: subtle gradient to visualize floor */
            background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
        }
    `;

    connectedCallback() {
        super.connectedCallback();
        if (typeof window !== 'undefined') {
            this.initGun();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.walkInterval) clearInterval(this.walkInterval);
    }

    async initGun() {
        this.gun = getGun();
        this.myId = getMyRaverId();

        // 1. Announce Self
        const myHue = Math.floor(Math.random() * 360);
        const me: Raver = {
            id: this.myId,
            x: Math.random() * 90 + 5, // Random start X (5-95%)
            y: Math.random() * 20,     // Random depth Y (pixels from bottom)
            hue: myHue,
            lastSeen: Date.now(),
            name: `Raver ${this.myId.substr(-4)}`
        };

        const raversRef = this.gun.get('ravers');
        raversRef.get(this.myId).put(me);

        // 2. Subscribe to Valid Ravers
        // Gun.js map().on() iterates over all items
        raversRef.map().on((data: Raver, id: string) => {
            if (!data || !data.x) return; // Ignore nulls/trash

            // Cleanup stale ravers (older than 30s) locally
            if (Date.now() - data.lastSeen > 30000) {
                // In a real app we might delete from Gun, but here just filter UI
                const newRavers = { ...this.ravers };
                delete newRavers[id];
                this.ravers = newRavers;
                return;
            }

            // Update state
            this.ravers = {
                ...this.ravers,
                [id]: data
            };
        });

        // 3. Start Walking/Heartbeat loop
        this.walkInterval = setInterval(() => {
            this.updateMyPosition();
        }, 2000);
    }

    updateMyPosition() {
        if (!this.gun || !this.myId) return;

        const current = this.ravers[this.myId];
        if (!current) return;

        // Random walk
        let newX = current.x + (Math.random() * 10 - 5);
        // Bounds check (0-100)
        newX = Math.max(2, Math.min(98, newX));

        const update = {
            x: newX,
            lastSeen: Date.now()
        };

        this.gun.get('ravers').get(this.myId).put(update);
    }

    render() {
        return html`
            ${Object.values(this.ravers).map(raver => html`
                <raver-avatar 
                    .x=${raver.x} 
                    .y=${raver.y} 
                    .hue=${raver.hue} 
                    .name=${raver.name}
                    .isMe=${raver.id === this.myId}
                ></raver-avatar>
            `)}
        `;
    }
}
