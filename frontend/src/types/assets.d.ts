interface ImportMeta {
    glob<T = unknown>(
        pattern: string,
        options?: {
            eager?: boolean;
            import?: string;
            query?: string;
        },
    ): Record<string, T>;
}

declare module '*.css?url' {
    const href: string;
    export default href;
}
