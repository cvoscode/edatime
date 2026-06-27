import { getChartPalette } from '../utils/theme.js';

type CanvasFetcher = (includeDrawings: boolean) => Promise<HTMLCanvasElement | null>;
type BlobDownloader = (blob: Blob, filename: string) => void;
type UrlDownloader = (url: string, filename: string) => void;

interface ExportDeps {
    filename: string;
    getCanvas: CanvasFetcher;
}

interface UrlExportDeps extends ExportDeps {
    downloadUrl: UrlDownloader;
}

interface BlobExportDeps extends ExportDeps {
    downloadBlob: BlobDownloader;
}

export async function exportDataChartPNG({ filename, getCanvas, downloadUrl }: UrlExportDeps): Promise<void> {
    const canvas = await getCanvas(true);
    if (!canvas) return;
    downloadUrl(canvas.toDataURL('image/png'), filename);
}

export async function exportDataChartSVG({ filename, getCanvas, downloadBlob }: BlobExportDeps): Promise<void> {
    const canvas = await getCanvas(true);
    if (!canvas) return;
    const pngData = canvas.toDataURL('image/png');
    const width = canvas.width || 1;
    const height = canvas.height || 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <image href="${pngData}" x="0" y="0" width="${width}" height="${height}" />\n</svg>`;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function exportDataChartHTML({ filename, getCanvas, downloadBlob }: BlobExportDeps): Promise<void> {
    const canvas = await getCanvas(true);
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const exportPalette = getChartPalette();
    const html = `<!DOCTYPE html><html><head><title>EdaTime Export</title><style>body{margin:0;background:${exportPalette.background};display:flex;justify-content:center;align-items:center;min-height:100vh}img{max-width:100%;height:auto;box-shadow:0 4px 12px rgba(0,0,0,0.5)}</style></head><body><img src="${dataUrl}" alt="EdaTime Chart"/></body></html>`;
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
}
