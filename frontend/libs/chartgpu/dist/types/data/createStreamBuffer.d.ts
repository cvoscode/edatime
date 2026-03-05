export interface StreamBuffer {
    /**
     * Writes a new vertex payload into the streaming buffer.
     *
     * Notes:
     * - `data` is interpreted as interleaved `vec2<f32>` vertices: `[x0, y0, x1, y1, ...]`.
     * - Uses double buffering (alternates GPU buffers each write) to avoid writing into the same
     *   buffer the GPU might still be reading from the prior frame.
     * - Uses a per-buffer CPU mirror (Uint32 bit patterns) to compute partial updates.
     */
    write(data: Float32Array): void;
    /** Returns the GPUBuffer that contains the most recently written data. */
    getBuffer(): GPUBuffer;
    /** Returns the vertex count for the most recently written data. */
    getVertexCount(): number;
    /** Destroys GPU resources (best-effort). Safe to call multiple times. */
    dispose(): void;
}
export declare function createStreamBuffer(device: GPUDevice, maxSize: number): StreamBuffer;
//# sourceMappingURL=createStreamBuffer.d.ts.map