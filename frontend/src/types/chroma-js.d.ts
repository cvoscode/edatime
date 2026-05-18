declare module 'chroma-js' {
  export interface Color {
    _rgb: [number, number, number, number];
    toString(): string;
    css(): string;
    luminance(): number;
  }

  export interface Scale {
    (value: number): Color;
    domain(domain?: [number, number]): Scale;
    colors(steps?: number): string[];
  }

  export interface ChromaStatic {
    (color: unknown): Color;
    scale(colors: string[]): Scale;
    hex(color: unknown): string;
    hsl(h: number, s: number, l: number): Color;
    rgb(r: number, g: number, b: number, a?: number): Color;
  }

  const chroma: ChromaStatic;
  export default chroma;
  export { type Color, type Scale };
}