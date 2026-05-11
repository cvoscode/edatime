import type { CandlestickStyle } from './types';
export declare const defaultGrid: {
    readonly left: 60;
    readonly right: 20;
    readonly top: 40;
    readonly bottom: 40;
};
export declare const defaultPalette: readonly ["#5470C6", "#91CC75", "#FAC858", "#EE6666", "#73C0DE", "#3BA272", "#FC8452", "#9A60B4", "#EA7CCC"];
export declare const defaultLineStyle: {
    readonly width: 2;
    readonly opacity: 1;
};
export declare const defaultAreaStyle: {
    readonly opacity: 0.25;
};
export declare const candlestickDefaults: {
    readonly style: CandlestickStyle;
    readonly itemStyle: {
        readonly upColor: "#22c55e";
        readonly downColor: "#ef4444";
        readonly upBorderColor: "#22c55e";
        readonly downBorderColor: "#ef4444";
        readonly borderWidth: 1;
    };
    readonly barWidth: "80%";
    readonly barMinWidth: 1;
    readonly barMaxWidth: 50;
    readonly sampling: "ohlc";
    readonly samplingThreshold: 5000;
};
export declare const scatterDefaults: {
    readonly mode: "points";
    readonly binSize: 2;
    readonly densityColormap: "viridis";
    readonly densityNormalization: "log";
};
export declare const defaultOptions: {
    readonly grid: {
        readonly left: 60;
        readonly right: 20;
        readonly top: 40;
        readonly bottom: 40;
    };
    readonly xAxis: {
        readonly type: "value";
    };
    readonly yAxis: {
        readonly type: "value";
    };
    readonly autoScroll: false;
    readonly theme: "dark";
    readonly palette: readonly ["#5470C6", "#91CC75", "#FAC858", "#EE6666", "#73C0DE", "#3BA272", "#FC8452", "#9A60B4", "#EA7CCC"];
    readonly series: readonly [];
};
//# sourceMappingURL=defaults.d.ts.map