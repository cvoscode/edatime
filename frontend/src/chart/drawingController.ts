import { getSetting } from '../utils/settings.js';

export interface DrawingItem {
    type: string;
    color: string;
    width: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

/** Owns user drawing state, canvas gesture listeners, and drawing primitives. */
export class DrawingController {
    private canvas: HTMLCanvasElement | null = null;
    private drawings: DrawingItem[] = [];
    private currentDraw: DrawingItem | null = null;
    private mode = 'none';
    private color = '#ff0055';
    private width = 2;
    private rafId: number | null = null;

    constructor(private readonly onRender: () => void) {}

    get isEnabled(): boolean {
        return this.mode !== 'none';
    }

    get items(): readonly DrawingItem[] {
        return this.drawings;
    }

    get activeItem(): DrawingItem | null {
        return this.currentDraw;
    }

    attach(canvas: HTMLCanvasElement): void {
        if (this.canvas === canvas) return;
        this.detach();
        this.canvas = canvas;
        canvas.style.pointerEvents = this.isEnabled ? 'auto' : 'none';
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('pointercancel', this.onPointerCancel);
    }

    detach(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas?.removeEventListener('pointermove', this.onPointerMove);
        this.canvas?.removeEventListener('pointerup', this.onPointerUp);
        this.canvas?.removeEventListener('pointercancel', this.onPointerCancel);
        this.canvas = null;
    }

    reset(): void {
        this.detach();
        this.drawings = [];
        this.currentDraw = null;
        this.mode = 'none';
        this.color = '#ff0055';
        this.width = 2;
    }

    setMode(mode: string, color?: string, width?: number): void {
        this.mode = mode;
        if (color) this.color = color;
        if (width) this.width = width;
        if (this.canvas) this.canvas.style.pointerEvents = mode === 'none' ? 'none' : 'auto';
    }

    clear(): void {
        this.drawings = [];
        this.currentDraw = null;
        this.onRender();
    }

    render(ctx: CanvasRenderingContext2D, scale = { x: 1, y: 1 }): void {
        const strokeScale = Math.min(scale.x, scale.y);
        const allDrawings = this.currentDraw ? [...this.drawings, this.currentDraw] : this.drawings;
        for (const item of allDrawings) {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width * strokeScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const startX = item.startX * scale.x;
            const startY = item.startY * scale.y;
            const endX = item.endX * scale.x;
            const endY = item.endY * scale.y;
            if (item.type === 'arrow') this.drawArrow(ctx, startX, startY, endX, endY, 10 * strokeScale);
            else if (item.type === 'box') {
                ctx.beginPath();
                ctx.rect(Math.min(startX, endX), Math.min(startY, endY), Math.abs(endX - startX), Math.abs(endY - startY));
                ctx.stroke();
            }
        }
    }

    private readonly onPointerDown = (event: PointerEvent): void => {
        const canvas = this.canvas;
        if (!canvas || event.button !== 0 || !this.isEnabled) return;
        const rect = canvas.getBoundingClientRect();
        this.currentDraw = {
            type: this.mode,
            color: this.color,
            width: this.width,
            startX: event.clientX - rect.left,
            startY: event.clientY - rect.top,
            endX: event.clientX - rect.left,
            endY: event.clientY - rect.top,
        };
        try { canvas.setPointerCapture(event.pointerId); } catch { /* ignored */ }
    };

    private readonly onPointerMove = (event: PointerEvent): void => {
        const canvas = this.canvas;
        if (!canvas || !this.currentDraw || !this.isEnabled) return;
        const rect = canvas.getBoundingClientRect();
        this.currentDraw.endX = event.clientX - rect.left;
        this.currentDraw.endY = event.clientY - rect.top;
        this.scheduleRender();
    };

    private readonly onPointerUp = (event: PointerEvent): void => {
        const canvas = this.canvas;
        if (!canvas || !this.currentDraw || !this.isEnabled) return;
        this.drawings.push(this.currentDraw);
        this.currentDraw = null;
        try { canvas.releasePointerCapture(event.pointerId); } catch { /* ignored */ }
        this.onRender();
        if (getSetting('drawAutoReset')) this.clear();
    };

    private readonly onPointerCancel = (): void => {
        if (!this.currentDraw) return;
        this.currentDraw = null;
        this.onRender();
    };

    private scheduleRender(): void {
        if (this.rafId !== null) return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.onRender();
        });
    }

    private drawArrow(ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number, headLength: number): void {
        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }
}
