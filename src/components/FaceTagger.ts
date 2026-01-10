import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('face-tagger')
export class FaceTagger extends LitElement {
    @property({ type: String }) src = ''; // Image URL
    @property({ type: String }) imageKey = ''; // R2 Key

    @state() faces: any[] = [];
    @state() tags: any[] = [];
    @state() showInput = false;
    @state() selectedFace: any = null;
    @state() inputName = '';

    static styles = css`
        :host {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: 20;
            pointer-events: none; /* Host allows pass-through by default */
            user-select: none; /* Prevent text selection */
            -webkit-user-select: none;
        }
        .canvas-overlay {
            position: absolute; /* FIX: Ensure it covers the area */
            top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: auto; /* Overlay captures clicks */
            cursor: cell;
            z-index: 1; /* Lowest interaction layer */
        }
        .modal-backdrop {
            position: fixed; /* Fix to viewport to guarantee trap */
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.01); /* Almost transparent but present */
            z-index: 5; /* FIX: Lower than faces (10), higher than overlay (1) */
            pointer-events: auto;
            cursor: default;
        }
        @keyframes pulse-fade {
            0% { opacity: 0.1; border-color: rgba(255, 255, 255, 0.4); transform: scale(1); }
            50% { opacity: 0.4; border-color: rgba(255, 255, 255, 0.6); transform: scale(1.02); }
            100% { opacity: 0.1; border-color: rgba(255, 255, 255, 0.4); transform: scale(1); }
        }
        .face-box {
            position: absolute;
            border: 2px dashed rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            cursor: pointer; /* Better cursor for clickable elements */
            pointer-events: auto;
            transition: all 0.1s; /* Faster transition */
            box-sizing: border-box;
            opacity: 0.1; /* Default/Final state */
            animation: pulse-fade 5s ease-in-out 3 forwards; /* Run 3 times, then stop */
            z-index: 10; /* Above backdrop */
        }
        .face-box:hover, .face-box.selected {
            animation: none; /* Stop pulsing on interaction */
            opacity: 1;
            border-color: rgba(255, 0, 255, 1); /* Brighter */
            background: rgba(255, 0, 255, 0.2);
            transform: scale(1.05);
            border-style: solid;
            box-shadow: 0 0 10px rgba(255,0,255,0.5); /* Glow */
            z-index: 20; /* Active face on top */
        }
        .face-box:active {
            transform: scale(0.95); /* Click feedback */
        }
        .input-dialog {
            position: absolute;
            background: rgba(255,255,255,0.95);
            border: 1px solid #333;
            color: black;
            padding: 10px;
            border-radius: 4px;
            pointer-events: auto;
            display: flex;
            gap: 5px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            font-family: monospace;
            z-index: 30; /* Highest interaction layer */
            cursor: default;
        }
        input {
            background: white;
            border: 1px solid #ccc;
            color: black;
            padding: 4px;
            font-size: 14px;
        }
        button {
            background: #ff00ff;
            color: white;
            border: none;
            cursor: pointer;
            padding: 4px 8px;
            font-size: 12px;
            font-weight: bold;
        }
    `;

    async connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this.handleGlobalKeydown);
        await this.loadFaceAPI();
        this.fetchExistingTags();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this.handleGlobalKeydown);
    }

    handleGlobalKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.showInput) {
            this.dismissModal();
        }
    }

    async updated(changedProps: Map<string, any>) {
        if (changedProps.has('src') && this.src) {
            this.detectFaces();
            this.fetchExistingTags();
        }
        if (changedProps.has('tags')) {
            this.dispatchTags();
        }
        // Auto-focus input when shown
        if (changedProps.has('showInput') && this.showInput) {
            setTimeout(() => {
                const input = this.shadowRoot?.querySelector('input');
                if (input) input.focus();
            }, 50);
        }
    }

    dispatchTags() {
        const event = new CustomEvent('tags-loaded', {
            detail: { tags: this.tags },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    async loadFaceAPI() {
        if ((window as any).faceapi) return;
        try {
            console.log("🧬 Loading Face API...");
            // Dynamically load face-api.js from CDN
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Failed to load face-api.js from CDN"));
                document.head.appendChild(script);
            });
            console.log("🧬 Loading TinyFaceDetector models...");
            await (window as any).faceapi.nets.tinyFaceDetector.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models');
            console.log("🧬 Face API ready.");
        } catch (e) {
            console.error("🧬 Face API initialization failed:", e);
        }
    }

    async fetchExistingTags() {
        if (!this.imageKey) return;
        try {
            console.log(`🏷️ Fetching tags for: ${this.imageKey}`);
            const res = await fetch(`/api/tags/${encodeURIComponent(this.imageKey)}`);
            if (res.ok) {
                this.tags = await res.json();
                console.log(`🏷️ Found ${this.tags.length} tags.`);
            } else {
                console.warn('Failed to fetch tags:', await res.text());
            }
        } catch (e) {
            console.error('Failed to load tags', e);
        }
    }

    async detectFaces() {
        // Try to find image in same shadow root or parent
        const root = (this.getRootNode() as ShadowRoot | Document);
        const img = root.querySelector('img') as HTMLImageElement;

        if (!img || !(window as any).faceapi || !(window as any).faceapi.nets.tinyFaceDetector.params) {
            console.warn("🧬 Face detection skipped: image not found or faceapi not ready.");
            return;
        }

        console.log(`🧬 Detecting faces on ${img.src} (${img.width}x${img.height})`);

        // Wait for image to load if not already complete
        if (!img.complete) {
            await new Promise((resolve) => {
                const onLoaded = () => {
                    img.removeEventListener('load', onLoaded);
                    img.removeEventListener('error', onLoaded);
                    resolve(true);
                };
                img.addEventListener('load', onLoaded);
                img.addEventListener('error', onLoaded);
            });
        }

        const detections = await (window as any).faceapi.detectAllFaces(
            img,
            new (window as any).faceapi.TinyFaceDetectorOptions()
        );

        console.log("Raw detections:", detections.length); // DEBUG

        // Custom object-fit: cover remapping
        const natW = img.naturalWidth;
        const natH = img.naturalHeight;
        const elmW = img.width;
        const elmH = img.height;

        const natRatio = natW / natH;
        const elmRatio = elmW / elmH;

        let scale = 1;
        let offX = 0;
        let offY = 0;

        if (natRatio > elmRatio) {
            // Image is wider than container (cropped sides)
            scale = elmH / natH;
            const renderedW = natW * scale;
            offX = (elmW - renderedW) / 2;
        } else {
            // Image is taller/same (cropped top/bottom)
            scale = elmW / natW;
            const renderedH = natH * scale;
            offY = (elmH - renderedH) / 2;
        }

        console.log("Resize metrics:", { scale, offX, offY, natW, natH, elmW, elmH }); // DEBUG

        this.faces = detections.map((d: any) => {
            // Detections are relative to intrinsic size (naturalWidth/Height)
            const b = d.box;
            return {
                ...d,
                box: {
                    x: (b.x * scale) + offX,
                    y: (b.y * scale) + offY,
                    width: b.width * scale,
                    height: b.height * scale
                }
            };
        });

        console.log("Processed faces:", this.faces); // DEBUG

        if (detections.length > 0) {
            const avgX = detections.reduce((acc: number, d: any) => acc + (d.box.x + d.box.width / 2), 0) / detections.length;
            const avgY = detections.reduce((acc: number, d: any) => acc + (d.box.y + d.box.height / 2), 0) / detections.length;

            const percentX = (avgX / natW) * 100;
            const percentY = (avgY / natH) * 100;

            this.dispatchEvent(new CustomEvent('faces-detected', {
                detail: { x: percentX, y: percentY },
                bubbles: true,
                composed: true
            }));
        }
    }

    handleCanvasClick(e: MouseEvent) {
        // If modal is open, the backdrop (z-5) sits on top of this overlay (z-1).
        // So this method ONLY fires when NO input is open.
        // Therefore checking `if (this.showInput)` is redundant but safe.
        if (this.showInput) return;

        // Calculate click position relative to image
        const rect = this.getBoundingClientRect(); // Host rect
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Define a manual face box size
        const manualSize = 60;

        console.log("Canvas Tag Create"); // DEBUG

        this.selectedFace = {
            box: {
                x: x - (manualSize / 2),
                y: y - (manualSize / 2),
                width: manualSize,
                height: manualSize
            },
            isManual: true
        };
        this.inputName = '';
        this.showInput = true;
    }

    handleFaceClick(face: any) {
        // ALLOW switching!
        console.log("Face Click -> Switch");
        // Since faces are now siblings to overlay, this doesn't need stopPropagation
        this.selectedFace = face;
        this.showInput = true;
        this.inputName = '';
        // Force focus in next update
        this.requestUpdate();
    }

    dismissModal() {
        this.showInput = false;
        this.selectedFace = null;
        this.inputName = '';
    }

    async submitTag() {
        console.log("Submitting Tag:", this.inputName, this.selectedFace); // DEBUG

        if (!this.inputName || !this.selectedFace) {
            console.warn("Input missing");
            return;
        }

        const { x, y, width, height } = this.selectedFace.box;

        const payload = {
            image_key: this.imageKey,
            x, y, w: width, h: height,
            name: this.inputName
        };

        try {
            // Correct API path
            const res = await fetch(`/api/tags`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.error) {
                alert(data.error);
            } else {
                this.tags = [...this.tags, payload];
                this.showInput = false;
                this.inputName = '';
                this.selectedFace = null;
            }
        } catch (e) {
            console.error(e);
            alert("Failed to submit tag. Check network.");
        }
    }

    render() {
        const detectedFaces = this.faces.map(face => {
            const { x, y, width, height } = face.box;
            const isSelected = this.selectedFace === face;
            // Only render faces if we are NOT making a manual selection (clutter reduction)
            // OR render them but dimmed? Let's keep them all.
            return html`
                <div class="face-box ${isSelected ? 'selected' : ''}"
                     title="Who is this?"
                     style="left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;"
                     @click=${() => this.handleFaceClick(face)}>
                </div>
            `;
        });

        let manualBox = html``;
        if (this.selectedFace && this.selectedFace.isManual) {
            const { x, y, width, height } = this.selectedFace.box;
            manualBox = html`
                <div class="face-box selected"
                     style="left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;">
                </div>
             `;
        }

        return html`
            <!-- Layer 1: Background Click Catcher (Always active unless blocked) -->
            <div class="canvas-overlay" @click=${this.handleCanvasClick}></div>

            <!-- Layer 2: Faces -->
            ${detectedFaces}
            ${manualBox}

            <!-- Layer 3: Modal Backdrop (Only active when input is shown) -->
            ${this.showInput ? html`
                <div class="modal-backdrop" @click=${this.dismissModal}></div>
            ` : ''}

            <!-- Layer 4: UI Dialog -->
            ${this.showInput && this.selectedFace ? html`
                <div class="input-dialog"
                     style="left: ${this.selectedFace.box.x}px; top: ${this.selectedFace.box.y + this.selectedFace.box.height}px;"
                >
                    <input type="text"
                        .value=${this.inputName}
                        @input=${(e: any) => this.inputName = e.target.value}
                        @keydown=${(e: KeyboardEvent) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') this.submitTag();
                    if (e.key === 'Escape') this.dismissModal();
                }}
                        placeholder="Who is this?">
                    <button @click=${this.submitTag}>TAG</button>
                    <button @click=${this.dismissModal}>X</button>
                </div>
            ` : ''}
        `;
    }
}
