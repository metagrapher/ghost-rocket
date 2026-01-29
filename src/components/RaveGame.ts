import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { trackEvent } from '../lib/analytics.ts';
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
    copyright?: string;
    sourceLink?: string;
}

@customElement('rave-game')
export class RaveGame extends LitElement {
    @state()
    private showToast = false;

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
            filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.4));
            /* Add padding to prevent clipping of sticking-out elements like the pin button */
            padding: 20px; 
            box-sizing: border-box;
        }
        .polaroid-container:hover {
            transform: rotate(0deg);
        }

        /* Shared Face Styles */
        .polaroid-face {
            width: 100%;
            box-sizing: border-box;
            background: #fdfaf7; /* Solid off-white polaroid paper */
            position: relative;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
        }
        
        .polaroid-inner {
            position: relative;
            width: 100%;
            aspect-ratio: 448 / 546; /* Providing height for absolute children */
            transform-style: preserve-3d;
            transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .polaroid-inner.is-flipped {
            transform: rotateY(180deg);
        }

        .polaroid-front, .polaroid-back {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            background: #fdfaf7 !important; /* Force solid paper color */
            transform-style: preserve-3d;
        }

        .polaroid-front {
            transform: rotateY(0deg) translateZ(1px);
            z-index: 2;
        }

        .polaroid-back {
            transform: rotateY(180deg) translateZ(1px);
            z-index: 1;
        }

        .image-container {
            position: absolute;
            /* Precise positioning of the image within the frame's dark hole */
            top: 6.2%;
            left: 7.8%;
            width: 84.8%;
            height: 72%;
            background-color: #1a1a1a;
            overflow: hidden;
            display: block;
            z-index: 10;
            transform-style: preserve-3d;
            transform: translateZ(2px);
        }

        .polaroid-overlay {
            position: absolute;
            /* Cropping 800x600 PNG to the 448x546 content area */
            top: -4.58%;
            left: -38.39%;
            width: 178.57%;
            height: 109.89%;
            pointer-events: none;
            z-index: 20; /* Frame stays below image if it lacks a cutout */
            background: url('/polaroid-frame.png') no-repeat center;
            background-size: 100% 100%;
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
            object-position: var(--image-pos, center);
            opacity: 1 !important;
            transition: opacity 0.5s, object-position 0.5s ease;
            position: absolute;
            top: 0; left: 0;
            z-index: 20;
            transform: translateZ(5px);
        }
        img.loading {
            opacity: 1 !important; /* Even when loading, let's see the broken icon or empty space */
            background: #222;
        }
        .caption {
            position: absolute;
            /* Precise positioning in the bottom area of the polaroid */
            bottom: 6%;
            left: 8%;
            right: 8%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            z-index: 40;
            transform: translateZ(10px);
        }
        .handwriting {
            font-family: 'Permanent Marker', cursive;
            color: #1f2937; /* Dark Grey/Blue ink */
            font-size: 1.75rem;
            transform: rotate(-3deg) translateY(-0.25rem);
            line-height: 1.2;
            width: 100%;
            text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
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

        .share-btn {
            position: absolute;
            bottom: 15px;
            right: 15px;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 40; /* Needs to be above face-tagger (30) */
            transition: all 0.2s ease;
            color: white;
            padding: 0;
        }

        .share-btn:hover {
            background: rgba(255, 255, 255, 0.6);
            transform: scale(1.1);
        }

        .share-btn svg {
            width: 20px;
            height: 20px;
            pointer-events: none;
        }

        .share-btn-top {
            bottom: auto;
            top: -15px;
            right: -15px;
            background: rgba(255, 255, 255, 0.9); /* More visible on dark background */
            color: #111827;
            border: 2px solid #1f2937;
            box-shadow: 2px 2px 0px rgba(0,0,0,0.2);
            z-index: 50;
        }
        .share-btn-top:hover {
             background: #ffffff;
             transform: scale(1.1) rotate(5deg);
        }

        .toast {
            position: absolute;
            bottom: 65px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #4ade80;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 600;
            pointer-events: none;
            opacity: 0;
            transform: translateY(10px);
            animation: fadeInOut 2s ease forwards;
            z-index: 50;
            white-space: nowrap;
            border: 1px solid rgba(74, 222, 128, 0.3);
        }

        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(10px); }
            15% { opacity: 1; transform: translateY(0); }
            85% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-10px); }
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

        .reveal-actions {
            position: absolute;
            top: 6.2%;
            left: 7.8%;
            width: 84.8%;
            height: 72%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1.5rem;
            z-index: 60;
            transform: translateZ(20px);
            pointer-events: none;
        }
        .reveal-actions .next-btn {
            pointer-events: auto;
            /* margin-top removed, handled by gap */
        }
        .result-text {
            text-shadow: 0 0 20px rgba(0,0,0,0.5);
            pointer-events: none;
            width: 100%;
            text-align: center;
            font-weight: 900;
        }
        .result-text span {
            display: block;
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
    @state() imagePosition = '50% 50%';
    @state() qrDataUrl: string | null = null;
    @state() qrInverted: boolean = false;

    // Nonce for updating QR preference
    private qrNonce: string | null = null;

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
        this.imagePosition = '50% 50%';
        this.qrDataUrl = null;
        this.qrInverted = false;
        this.qrNonce = null;

        try {
            console.log("🎮 Loading next quiz question...");

            // Check for deep link param
            const urlParams = new URLSearchParams(window.location.search);
            const photoId = urlParams.get('photo');
            let apiUrl = "/api/quiz";

            if (photoId) {
                console.log(`🔗 Deep Link Detected: ${photoId}`);
                apiUrl += `?photoId=${encodeURIComponent(photoId)}`;
            }

            const res = await fetch(apiUrl);
            if (!res.ok) {
                const errData = await res.json() as any;
                console.error("💔 Quiz API Error:", errData.error);
                this.caption = `Error: ${errData.error || res.status}. Retrying...`;

                // If deep link failed (e.g. 404), clear param and retry standard load
                if (photoId) {
                    window.history.pushState({}, '', '/');
                    setTimeout(() => this.loadGame(), 1000);
                    return;
                }

                setTimeout(() => this.loadGame(), 2000);
                return;
            }

            const data = await res.json();
            console.log("📦 Quiz data received:", data);

            // Assigning the new quiz data only AFTER any flip-back is done
            this.quiz = data;

            // Set QR state from API if available
            if (data.qrInverted !== null && data.qrInverted !== undefined) {
                this.qrInverted = data.qrInverted;
                console.log(`📡 Used server-side QR preference: ${this.qrInverted ? 'Inverted' : 'Normal'}`);
            }
            if (data.nonce) {
                this.qrNonce = data.nonce;
            }

            // Generate QR Code immediately (client-side)
            if (this.quiz?.photoId) {
                this.generateQRCode(this.quiz.photoId);
            }

            // Enrich tracking event with party data
            trackEvent('party_viewed', {
                party_id: this.quiz?.correctId,
                party_title: this.quiz?.options.find(o => o.id === this.quiz?.correctId)?.label,
                image_url: this.quiz?.imageUrl,
                party_date: this.quiz?.date ? `${this.quiz.date.year}-${this.quiz.date.month}-${this.quiz.date.day}` : null
            });

            // Preload image
            if (this.quiz?.imageUrl) {
                console.log(`🖼️ Preloading image: ${this.quiz.imageUrl}`);
                const img = new Image();
                img.crossOrigin = "Anonymous"; // Required for canvas reading
                img.src = this.quiz.imageUrl;

                img.onload = () => {
                    console.log("✅ Image loaded successfully.");
                    this.imageLoaded = true;
                    this.loading = false;

                    // Verify QR Scannability if preference is unknown
                    if (data.qrInverted === null || data.qrInverted === undefined) {
                        this.verifyScannability(img);
                    }
                };

                img.onerror = (err) => {
                    console.error("❌ Image failed to load, autoadvancing:", this.quiz?.imageUrl, err);
                    this.loadGame();
                };

                // Safety timeout
                setTimeout(() => {
                    if (this.loading) {
                        console.warn("⏳ Image load timed out. Autoadvancing.");
                        this.loadGame();
                    }
                }, 10000);
            } else {
                console.warn("⚠️ No imageUrl in quiz data!");
                this.loading = false;
            }
        } catch (e: any) {
            console.error("💔 Rave API Error:", e);
            this.loading = false;
            this.caption = `Error: ${e.message}`;
        }
    }

    async generateQRCode(photoId: string) {
        try {
            const QRCode = await import('qrcode');
            const url = new URL(window.location.origin);
            url.searchParams.set('photo', decodeURIComponent(photoId));

            this.qrDataUrl = await QRCode.toDataURL(url.toString(), {
                margin: 0,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                },
                errorCorrectionLevel: 'M'
            });
        } catch (e) {
            console.error("QR Gen Failed", e);
        }
    }

    async verifyScannability(img: HTMLImageElement) {
        if (!this.qrDataUrl) return;

        try {
            const jsQR = (await import('jsqr')).default;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            // Canvas size should match the display size roughly for accurate simulation, 
            // but for raw pixel analysis, we can work with the natural size.
            // However, the QR code is overlaid on the BOTTOM RIGHT.
            // Let's simulate the composition.

            // Use a standard size for analysis to be consistent
            const w = 800;
            const h = 600;
            canvas.width = w;
            canvas.height = h;

            // Draw Image (simulate object-fit: cover)
            // For simplicity, we just draw it to fill.
            ctx.drawImage(img, 0, 0, w, h);

            // Define QR Location (Bottom Right, similar to CSS)
            // CSS: bottom: 0; right: 0; width: 22%; (approx from visual)
            const qrSize = w * 0.20;
            const qrX = w - qrSize - (w * 0.05); // 5% margin right
            const qrY = h - qrSize - (h * 0.05); // 5% margin bottom

            // Create ImageBitmap from QR Data URL
            const qrImg = new Image();
            qrImg.src = this.qrDataUrl;
            await new Promise(r => qrImg.onload = r);

            // Function to test readability
            const testReadability = (invert: boolean): boolean => {
                // Restore background area
                ctx.drawImage(img, qrX, qrY, qrSize, qrSize, qrX, qrY, qrSize, qrSize);

                // Draw QR
                ctx.save();
                ctx.globalAlpha = 0.6; // Opacity 0.6
                ctx.filter = invert ? 'invert(1)' : 'none';
                ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
                ctx.restore();

                // Read Pixels
                const imageData = ctx.getImageData(0, 0, w, h);
                const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });

                return !!code;
            };

            // Test Normal
            const normalWorks = testReadability(false);
            console.log(`🧐 QR Check (Normal): ${normalWorks ? 'PASS' : 'FAIL'}`);

            // Test Inverted
            const invertedWorks = testReadability(true);
            console.log(`🧐 QR Check (Inverted): ${invertedWorks ? 'PASS' : 'FAIL'}`);

            let bestInverted = false;

            if (normalWorks && !invertedWorks) bestInverted = false;
            else if (!normalWorks && invertedWorks) bestInverted = true;
            else if (normalWorks && invertedWorks) bestInverted = false; // Default to normal if both work
            else {
                // Both failed. Fallback to luminance check.
                // Capture the area behind the QR code
                ctx.drawImage(img, 0, 0, w, h);
                const bgData = ctx.getImageData(qrX, qrY, qrSize, qrSize);
                let totalLum = 0;
                for (let i = 0; i < bgData.data.length; i += 4) {
                    const r = bgData.data[i];
                    const g = bgData.data[i + 1];
                    const b = bgData.data[i + 2];
                    // Relative luminance
                    totalLum += (0.2126 * r + 0.7152 * g + 0.0722 * b);
                }
                const avgLum = totalLum / (bgData.data.length / 4);
                console.log(`🌑 Fallback Luminance Check: ${avgLum}`);

                // If background is dark (low lum), we want Inverted (White) QR.
                // If background is light (high lum), we want Normal (Black) QR.
                bestInverted = avgLum < 128;
            }

            this.qrInverted = bestInverted;
            console.log(`🏁 Final Decision: ${this.qrInverted ? "Inverted" : "Normal"}`);

            // Save to API
            if (this.quiz?.photoId && this.qrNonce) {
                fetch('/api/photos/qr-pref', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        publicId: this.quiz.photoId,
                        inverted: this.qrInverted,
                        nonce: this.qrNonce
                    })
                }).catch(e => console.error("Failed to save QR pref", e));
            }

        } catch (e) {
            console.error("Verification logic failed", e);
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
            // Clear deep link if present when skipping
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('photo')) {
                window.history.pushState({}, '', '/');
            }
            this.loadGame();
        }
    }

    handleGuess(id: string) {
        if (this.result !== null || !this.quiz) return; // Prevent multi-guess

        this.selectedId = id;
        const isCorrect = id === this.quiz.correctId;
        this.result = isCorrect ? 'correct' : 'wrong';

        trackEvent('guess_submitted', {
            party_id: this.quiz.correctId,
            guessed_id: id,
            is_correct: isCorrect
        });

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

    handleFacesDetected(e: any) {
        // Center the image on the detected faces
        const { x, y } = e.detail;
        if (isNaN(x) || isNaN(y)) {
            console.warn("⚠️ Face detection returned NaN coordinates.");
            this.imagePosition = 'center';
            return;
        }
        this.imagePosition = `${x}% ${y}%`;
        console.log(`🎯 Centering image on faces: ${this.imagePosition}`);
    }

    async copyShareLink() {
        if (!this.quiz?.photoId) return;

        const url = new URL(window.location.href);
        url.searchParams.set('photo', decodeURIComponent(this.quiz.photoId));

        try {
            await navigator.clipboard.writeText(url.toString());
            this.showToast = true;
            trackEvent('share_link_copied', {
                party_id: this.quiz.correctId,
                url: url.toString()
            });
            setTimeout(() => this.showToast = false, 2500);
        } catch (err) {
            console.error('Failed to copy using API', err);
            // Fallback?
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
                            <!-- Image -->
                            <img src="${this.quiz.imageUrl}" 
                                 class="${!this.imageLoaded ? 'loading' : ''}" 
                                 style="--image-pos: ${this.imagePosition}"
                                 alt="Party moment"
                                 @load=${() => { console.log("🔥 IMG tag load event fired"); this.imageLoaded = true; this.loading = false; }}
                                 @error=${(e: any) => { console.error("🔥 IMG tag error event fired", e); this.imageLoaded = true; this.loading = false; }}
                            >

                            <!-- Face Tagger (Only visible when image loaded) -->
                            ${this.imageLoaded ? html`
                                <face-tagger 
                                    .src=${this.quiz.imageUrl} 
                                    image-key="${imageKey}"
                                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 30; transform: translateZ(3px);"
                                    @tags-loaded=${this.handleTagsLoaded}
                                    @faces-detected=${this.handleFacesDetected}
                                ></face-tagger>

                                <!-- QR Watermark / Share Button -->
                                ${this.qrDataUrl ? html`
                                    <div class="share-btn" 
                                         @click=${this.copyShareLink} 
                                         title="Scan to Share / Click to Copy"
                                         style="
                                            background: none; 
                                            border: none; 
                                            width: 22%; 
                                            height: auto; 
                                            aspect-ratio: 1; 
                                            bottom: 0; 
                                            right: 0; 
                                            border-radius: 0; 
                                            opacity: 0.6;
                                            filter: ${this.qrInverted ? 'invert(1) drop-shadow(0 0 2px rgba(0,0,0,0.5))' : 'drop-shadow(0 0 2px rgba(255,255,255,0.5))'};
                                            transition: opacity 0.3s;
                                         "
                                    >
                                        <img src="${this.qrDataUrl}" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;" />
                                    </div>
                                ` : html`
                                    <button class="share-btn" @click=${this.copyShareLink} title="Copy Link">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                        </svg>
                                    </button>
                                `}

                                ${this.showToast ? html`<div class="toast">LINK COPIED!</div>` : ''}
                            ` : ''}

                            <!-- Loader (Highest level inside container) -->
                            ${!this.imageLoaded ? html`
                                <div class="loading-spinner" style="z-index: 100; transform: translateZ(50px);">
                                    <div class="raver-loader" @click=${this.handleRaverClick}></div>
                                    <div style="margin-top: 1rem; font-family: monospace; font-size: 0.75rem; color: #2563eb; animation: pulse 2s infinite;">
                                        LOADING...
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Top Right Duplicate Share Button -->
                        <button class="share-btn share-btn-top" @click=${this.copyShareLink} title="Copy Link">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                        </button>

                        <!-- Overlay stays behind the container in this architecture to ensure visibility -->
                        <div class="polaroid-overlay" style="z-index: 10;"></div>
                        
                        <div class="caption">
                            <div class="handwriting">${this.caption}</div>
                            <div class="meta">
                                ${this.quiz.sourceLink
                ? html`<a href="${this.quiz.sourceLink}" target="_blank" rel="noopener noreferrer">${this.quiz.copyright || 'SSB Productions'}</a>`
                : (this.quiz.copyright || 'SSB Productions')
            }
                            </div>
                        </div>
                    </div>

                    <!-- BACK FACE (The Reveal) -->
                    <div class="polaroid-face polaroid-back">
                        <div class="polaroid-overlay"></div>
                        <div class="image-container" style="background-color: #050505; z-index: 5;">
                            <!-- Developer area background -->
                        </div>

                        <!-- Higher layer for actions to prevent occlusion by long party names -->
                        <div class="reveal-actions">
                            <div class="result-text">
                                 ${this.result === 'correct' ? html`<span style="color: #4ade80; font-size: 2.25rem;">THE VIBE IS RIGHT</span>` : this.result === 'wrong' ? html`<span style="color: #f87171; font-size: 3rem;">NOT THE VIBE</span>` : ''}
                            </div>
                            <button class="next-btn" @click=${() => {
                // Clear deep link for next photo
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('photo')) {
                    window.history.pushState({}, '', '/');
                }
                trackEvent('next_photo_clicked', {
                    previous_party_id: this.quiz?.correctId
                });
                this.loadGame();
            }}>NEXT PHOTO →</button>
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
