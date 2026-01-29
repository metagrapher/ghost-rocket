import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('raver-avatar')
export class RaverAvatar extends LitElement {
    @property({ type: Number }) x = 0;
    @property({ type: Number }) y = 0;
    @property({ type: Number }) hue = 0;
    @property({ type: String }) name = '';
    @property({ type: Boolean }) isMe = false;

    static styles = css`
        :host {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 40px;
            height: 60px;
            transition: transform 0.3s linear;
            will-change: transform;
            pointer-events: none;
            z-index: 50;
        }

        .avatar-body {
            width: 100%;
            height: 100%;
            position: relative;
            /* Simple stick figure raver style */
        }

        .head {
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 50%;
            position: absolute;
            top: 0;
            left: 10px;
            box-shadow: 0 0 10px currentColor;
        }

        .torso {
            width: 4px;
            height: 25px;
            background: white;
            position: absolute;
            top: 20px;
            left: 18px;
        }

        .legs {
            position: absolute;
            top: 45px;
            width: 100%;
            display: flex;
            justify-content: center;
        }

        .leg {
            width: 4px;
            height: 15px;
            background: white;
            margin: 0 2px;
        }

        .glow-stick {
            position: absolute;
            width: 30px;
            height: 4px;
            background: currentColor; /* Uses hue */
            top: 25px;
            left: 5px;
            border-radius: 2px;
            animation: wave 1s infinite alternate ease-in-out;
            box-shadow: 0 0 15px currentColor;
        }

        .name-tag {
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 4px;
            white-space: nowrap;
            font-family: monospace;
        }

        @keyframes wave {
            from { transform: rotate(-20deg); }
            to { transform: rotate(20deg); }
        }
    `;

    render() {
        // Transform coordinates to CSS
        // Assume x is 0-100 (percent), y is 0-100 (percent of floor height)
        // But for "floor" logic, usually y is minimal variation (walking depth).
        // Let's assume passed x, y are percentages.

        // Host transform handles the position
        this.style.transform = `translate(${this.x}vw, ${-this.y}px)`;

        return html`
            <div class="avatar-body" style="color: hsl(${this.hue}, 100%, 50%)">
                ${this.name ? html`<div class="name-tag">${this.name} ${this.isMe ? '(YOU)' : ''}</div>` : ''}
                <div class="head" style="background: hsl(${this.hue}, 100%, 80%)"></div>
                <div class="torso"></div>
                <div class="glow-stick"></div>
                <div class="legs">
                    <div class="leg"></div>
                    <div class="leg"></div>
                </div>
            </div>
        `;
    }
}
