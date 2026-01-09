import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './OptionButton.ts';
import './FaceTagger.ts';

interface QuizOption {
    id: string;
    label: string;
}

interface QuizData {
    imageUrl: string;
    correctId: string;
    options: QuizOption[];
    date?: { month: string; day: string; year: string; };
}

@customElement('rave-game')
export class RaveGame extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            max-width: 32rem;
            margin: 0 auto;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        
        /* Perspective Container */
        .polaroid-container {
            perspective: 1500px;
            margin-bottom: 2rem;
            width: 100%;
            transition: transform 0.7s;
            transform: rotate(1deg);
        }
        .polaroid-container:hover {
            transform: rotate(0deg);
        }

        /* The Flipping Box */
        .polaroid-inner {
            position: relative;
            width: 100%;
            transform-style: preserve-3d;
            transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .polaroid-inner.is-flipped {
            transform: rotateY(180deg);
        }

        /* Shared Face Styles */
        .polaroid-face {
            width: 100%;
            box-sizing: border-box;
            background: #fffafa;
            padding: 1rem;
            padding-bottom: 4.5rem;
            box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.3);
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
        }

        .polaroid-front {
            position: relative;
            z-index: 2;
        }

        .polaroid-back {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            transform: rotateY(180deg);
            display: flex;
            flex-direction: column;
            opacity: 0;
            transition: opacity 0.1s;
        }
        .is-flipped .polaroid-back {
            opacity: 1;
        }

        .image-container {
            aspect-ratio: 1 / 1;
            background-color: #1a1a1a;
            overflow: hidden;
            margin-bottom: 0.75rem;
            position: relative;
            display: grid;
            place-items: center;
            max-height: 50vh;
        }
        .polaroid-back .image-container {
            background-color: #050505; /* Deep black developer area */
            box-shadow: inset 0 0 20px rgba(0,0,0,1);
            position: relative;
            overflow: hidden;
        }
        /* Film backing texture effect */
        .polaroid-back .image-container::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(45deg, transparent 45%, rgba(255,255,255,0.02) 50%, transparent 55%);
            background-size: 10px 10px;
            opacity: 0.5;
        }
        .polaroid-back .image-container::before {
            content: 'FUJI FILM / DEVELOPED BY ARCADE';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            color: rgba(255,255,255,0.03);
            font-family: monospace;
            font-size: 0.6rem;
            white-space: nowrap;
            pointer-events: none;
        }

        .loading-spinner {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-color: #111827;
            z-index: 0;
            color: #2563eb;
        }
        .raver-loader {
            width: 64px;
            height: 64px;
            background: url("/dancing_raver.png") no-repeat;
            background-size: 192px 64px;
            animation: rave 0.6s steps(3) infinite;
            image-rendering: pixelated;
        }
        .raver-react {
            transform: scale(1.5) rotate(10deg);
        }
        @keyframes rave {
            0% { background-position: 0px 0; }
            100% { background-position: -192px 0; }
        }
        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0;
            transition: opacity 0.5s;
            position: relative;
            z-index: 10;
        }
        img.loaded {
            opacity: 1;
        }
        .caption {
            position: absolute;
            bottom: 0.75rem;
            left: 1rem;
            right: 1rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
        }
        .handwriting {
            font-family: 'Permanent Marker', cursive;
            color: #374151; /* Slightly darker for better marker feel */
            font-size: 1.75rem; /* Significantly larger */
            transform: rotate(-3deg) translateY(-0.25rem);
            line-height: 1.2;
            width: 100%;
        }
        .meta {
            color: #9ca3af;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-top: 0.25rem;
            opacity: 0.6;
        }
        .serial-number {
            position: absolute;
            bottom: 0.75rem;
            left: 50%;
            transform: translateX(-50%);
            font-family: "Courier New", Courier, monospace;
            color: #f472b6; /* Soft pink thermal print */
            font-size: 0.6rem;
            opacity: 0.8;
            font-weight: bold;
            letter-spacing: 0.15em;
        }
        .reveal-text {
            color: #111827;
            text-align: center;
            padding: 1rem;
            font-weight: bold;
        }
        .reveal-party {
            font-family: 'Permanent Marker', cursive;
            color: #2563eb; /* Marker Blue for correct reveal */
            font-size: 2.5rem;
            margin: 0;
            transform: rotate(-1deg);
        }
        .reveal-wrong .reveal-party {
            color: #f87171; /* Red for wrong reveal */
        }
        .reveal-label {
            font-size: 0.75rem;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 0.5rem;
        }

        .options-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.75rem; /* Reduced from 1rem */
            width: 100%;
        }
        @media (min-width: 640px) {
            .options-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 1rem;
            }
        }
        
        h2 {
            font-size: 3.75rem;
            font-weight: 900;
            margin-bottom: 1rem;
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
            filter: drop-shadow(0 0 15px rgba(74, 222, 128, 0.5));
        }
        .success h2 {
            background-image: linear-gradient(to right, #4ade80, #3b82f6);
        }
        .failure h2 {
            background-image: linear-gradient(to right, #ef4444, #db2777);
            filter: drop-shadow(0 0 15px rgba(239, 68, 68, 0.5));
        }
        .desc {
            font-size: 1.25rem;
            color: #d1d5db;
            margin-bottom: 2rem;
            font-weight: 300;
        }
        .next-btn {
            padding: 0.75rem 2rem;
            background-color: white;
            color: black;
            font-weight: bold;
            border-radius: 9999px;
            border: none;
            cursor: pointer;
            transition: transform 0.2s;
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
        }
        .next-btn:hover {
            transform: scale(1.05);
        }
        .next-btn:active {
            transform: scale(0.95);
        }
        
    `;

    @state() quiz: QuizData | null = null;
    @state() loading = true;
    @state() result: 'correct' | 'wrong' | null = null;
    @state() selectedId: string | null = null;
    @state() imageLoaded = false;
    @state() flipped = false;
    @state() caption = "Guess the party...";
    @state() raverClicks = 0;


    connectedCallback() {
        super.connectedCallback();
        this.loadGame();
    }

    async loadGame() {
        // Start flipping back immediately
        this.flipped = false;

        // Blank out the result text immediately so no spoilers are visible during the flip-back.
        this.result = null;
        this.selectedId = null;
        this.loading = true;
        this.imageLoaded = false;
        this.caption = "Guess the party...";
        this.raverClicks = 0; // Reset frustration meter


        try {
            const res = await fetch("/api/quiz");
            const data = await res.json();

            // Assigning the new quiz data only AFTER any flip-back is done
            this.quiz = data;

            // Preload image
            if (this.quiz?.imageUrl) {
                const img = new Image();
                img.src = this.quiz.imageUrl;
                img.onload = () => {
                    this.imageLoaded = true;
                    this.loading = false;
                };
            }
        } catch (e) {
            console.error("Rave API Error", e);
            this.loading = false;
        }
    }

    handleRaverClick(e: MouseEvent) {
        e.stopPropagation();
        this.raverClicks++;

        const raver = (e.target as HTMLElement);
        raver.classList.add("raver-react");
        setTimeout(() => raver.classList.remove("raver-react"), 200);

        if (this.raverClicks > 2) {
            console.log("User frustrated, skipping...");
            this.loadGame();
        }
    }

    handleGuess(id: string) {
        if (this.result !== null || !this.quiz) return; // Prevent multi-guess

        this.selectedId = id;
        const isCorrect = id === this.quiz.correctId;
        this.result = isCorrect ? 'correct' : 'wrong';

        // Flip after a short delay to let the button click be felt
        setTimeout(() => {
            this.flipped = true;
        }, 300);
    }

    handleTagsLoaded(e: CustomEvent) {
        const tags = e.detail.tags;
        if (tags && tags.length > 0) {
            const names = tags.map((t: any) => t.name).join(", ");
            this.caption = `w/ ${names}`;
        }
    }

    render() {
        if (!this.quiz) return html`<div>Loading...</div>`;

        const imageKey = this.quiz.imageUrl.split('/api/img/')[1] ? decodeURIComponent(this.quiz.imageUrl.split('/api/img/')[1]) : '';
        const correctOption = this.quiz.options.find(o => o.id === this.quiz?.correctId);

        return html`
            <div class="polaroid-container">
                <div class="polaroid-inner ${this.flipped ? 'is-flipped' : ''}">
                    <!-- FRONT FACE -->
                    <div class="polaroid-face polaroid-front">
                        <div class="image-container">
                            <!-- Loader -->
                            <div class="loading-spinner" ?hidden=${this.imageLoaded}>
                                <div class="raver-loader" @click=${this.handleRaverClick}></div>
                                <div style="margin-top: 1rem; font-family: monospace; font-size: 0.75rem; color: #2563eb; animation: pulse 2s infinite;">
                                    LOADING...
                                </div>
                            </div>

                            <!-- Image -->
                            <img src="${this.quiz.imageUrl}" 
                                 class="${this.imageLoaded ? 'loaded' : ''}" 
                                 alt="Party moment" />

                            <!-- Face Tagger (Only visible when image loaded) -->
                            ${this.imageLoaded ? html`
                                <face-tagger 
                                    .src=${this.quiz.imageUrl} 
                                    image-key="${imageKey}"
                                    @tags-loaded=${this.handleTagsLoaded}
                                ></face-tagger>
                            ` : ''}
                        </div>
                        
                        <div class="caption">
                            <div class="handwriting">${this.caption}</div>
                            <div class="meta">SSB ARCHIVE</div>
                        </div>
                    </div>

                    <!-- BACK FACE (The Reveal) -->
                    <div class="polaroid-face polaroid-back">
                        <div class="image-container" style="display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; gap: 1rem;">
                            <div style="font-size: 2.5rem; font-weight: 900; letter-spacing: -0.05em; transform: rotate(-1deg);">
                                ${this.result === 'correct' ? html`<span style="color: #4ade80;">NAILED IT</span>` : this.result === 'wrong' ? html`<span style="color: #f87171;">NOPE!</span>` : ''}
                            </div>
                            <button class="next-btn" @click=${this.loadGame} style="z-index: 20;">NEXT PHOTO →</button>
                        </div>
                        <div class="caption">
                           <div class="reveal-text ${this.result === 'wrong' ? 'reveal-wrong' : ''}">
                                <div class="reveal-label">LOCATION REVEALED:</div>
                                <h3 class="reveal-party">${this.result ? correctOption?.label : ''}</h3>
                           </div>
                           <div class="serial-number">
                               ${(() => {
                const d = this.quiz?.date || { month: '01', day: '01', year: '00' };
                const machine = '43';
                const film = '80';
                return `${d.month}${d.year}${machine}${film}${d.day}`;
            })()}
                           </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Options -->
            <div class="options-grid">
                ${this.quiz.options.map(opt => {
                let state = 'default';
                // Reveal Phase
                if (this.result !== null) {
                    if (opt.id === this.quiz?.correctId) state = 'correct';
                    else if (opt.id === this.selectedId) state = 'wrong';
                    else state = 'default';
                }

                return html`
                        <option-button 
                            label="${opt.label}" 
                            value="${opt.id}"
                            state="${state}"
                            style="${this.result !== null ? 'pointer-events: none;' : ''} ${this.result !== null && (this.flipped || state === 'default') ? 'opacity: 0.2;' : ''} transition: opacity 0.5s;"
                            @click=${() => this.handleGuess(opt.id)}
                        ></option-button>
                    `;
            })}
            </div>
        `;
    }
}
