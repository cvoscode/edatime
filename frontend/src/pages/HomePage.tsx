import { Component } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import styles from './HomePage.module.css';

const SAMPLE_DATASETS = [
  {
    id: 'ettm2',
    name: 'ETTm2',
    meta: '70,320 rows × 7 columns',
    desc: 'Industrial fault detection dataset with temperature, pressure, and quality measurements from a power plant.',
    tags: ['multivariate', 'industrial', '7 cols'],
    rows: '70K rows',
  },
  {
    id: 'sinusoidal',
    name: 'Sinusoidal',
    meta: '5,000 rows × 4 columns',
    desc: 'Synthetic multi-frequency sine waves with varying amplitudes and noise levels for testing.',
    tags: ['synthetic', 'periodic', '4 cols'],
    rows: '5K rows',
  },
  {
    id: 'weather',
    name: 'Weather',
    meta: '5,000 rows × 5 columns',
    desc: 'Daily weather observations with temperature, humidity, and pressure readings across multiple cities.',
    tags: ['real-world', 'time-series', '5 cols'],
    rows: '5K rows',
  },
];

const HomePage: Component = () => {
  const navigate = useNavigate();

  const handleSampleClick = (id: string) => {
    sessionStorage.setItem('sampleDataset', id);
    navigate('/upload');
  };

  return (
    <div class={styles.page}>
      <div class={styles.hero}>
        <div class={styles.heroIcon}>
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,18 7,10 12,22 17,6 22,16 27,12 30,12" />
          </svg>
        </div>
        <h1 class={styles.title}>EdaTime</h1>
        <p class={styles.tagline}>Interactive time-series analytics — upload a CSV or Parquet, explore, and export.</p>
        <A href="/upload" class={styles.ctaButton}>Upload a file to get started</A>
      </div>

      <div class={styles.datasets}>
        <div class={styles.section}>
          <h2 class={styles.sectionTitle}>Try a sample dataset</h2>
          <p class={styles.sectionCopy}>No data on hand? Start exploring with one of these ready-to-load datasets.</p>
        </div>
        <div class={styles.datasetsGrid}>
          {SAMPLE_DATASETS.map((ds) => (
            <button class={styles.datasetCard} onClick={() => handleSampleClick(ds.id)} type="button">
              <div class={styles.datasetHeader}>
                <div class={styles.datasetIcon}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="1,10 4,6 7,12 10,3 13,8 15,7" />
                  </svg>
                </div>
                <div class={styles.datasetInfo}>
                  <div class={styles.datasetName}>Load {ds.name} sample dataset</div>
                  <div class={styles.datasetMeta}>{ds.meta}</div>
                </div>
              </div>
              <p class={styles.datasetDesc}>{ds.desc}</p>
              <div class={styles.datasetTags}>
                {ds.tags.map((tag) => (
                  <span class={styles.datasetTag}>{tag}</span>
                ))}
                <span class={`${styles.datasetTag} ${styles.tagRows}`}>{ds.rows}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div class={styles.section}>
        <h2 class={styles.sectionTitle}>Recommended workflow</h2>
        <p class={styles.sectionCopy}>Start with the core path, then branch into advanced analyses only after you know which columns and intervals matter.</p>
      </div>
      <div class={`${styles.grid} ${styles.gridWorkflow}`}>
        <A href="/upload" class={styles.card} data-home-nav="upload">
          <div class={styles.cardIcon}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" /><polyline points="11 5 8 2 5 5" /><line x1="8" y1="2" x2="8" y2="11" />
            </svg>
          </div>
          <h3 class={styles.cardTitle}>Upload <kbd>⌥1</kbd></h3>
          <p class={styles.cardDesc}>Drag & drop CSV or Parquet files. Preview column profiles before ingesting. Select a column subset and time slice for partial loads.</p>
        </A>

        <A href="/timeseries" class={styles.card} data-home-nav="timeseries">
          <div class={styles.cardIcon}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1,10 4,6 7,12 10,3 13,8 15,7" />
            </svg>
          </div>
          <h3 class={styles.cardTitle}>Timeseries <kbd>⌥2</kbd></h3>
          <p class={styles.cardDesc}>WebGPU-accelerated multi-series chart with zoom, custom colors, rolling bands, anomaly detection, and adaptive line filters.</p>
        </A>

        <A href="/heatmap" class={styles.card} data-home-nav="heatmap">
          <div class={styles.cardIcon}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="1" width="4" height="4" rx="0.5" /><rect x="6" y="1" width="4" height="4" rx="0.5" /><rect x="11" y="1" width="4" height="4" rx="0.5" /><rect x="1" y="6" width="4" height="4" rx="0.5" /><rect x="6" y="6" width="4" height="4" rx="0.5" /><rect x="11" y="6" width="4" height="4" rx="0.5" /><rect x="1" y="11" width="4" height="4" rx="0.5" /><rect x="6" y="11" width="4" height="4" rx="0.5" /><rect x="11" y="11" width="4" height="4" rx="0.5" />
            </svg>
          </div>
          <h3 class={styles.cardTitle}>Correlations <kbd>⌥7</kbd></h3>
          <p class={styles.cardDesc}>Screen pairs in the correlation heatmap, then jump into the detailed scatter view for the promising relationships.</p>
        </A>

        <A href="/scatter" class={styles.card} data-home-nav="scatter">
          <div class={styles.cardIcon}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="4" cy="11" r="1.2" /><circle cx="8" cy="6" r="1.2" /><circle cx="12" cy="9" r="1.2" /><circle cx="6" cy="13" r="1.2" /><circle cx="11" cy="3" r="1.2" />
            </svg>
          </div>
          <h3 class={styles.cardTitle}>Scatter / Density <kbd>⌥3</kbd></h3>
          <p class={styles.cardDesc}>Inspect the selected pair in detail, color by an extra column, and switch to matrix view with <kbd>⌥4</kbd> for pairwise screening inside the same workspace.</p>
        </A>
      </div>

      <div class={styles.section}>
        <h2 class={styles.sectionTitle}>Advanced analyses</h2>
        <p class={styles.sectionCopy}>Use these pages after the workflow above has narrowed the signal, time window, or candidate variables.</p>
      </div>
      <div class={styles.grid}>
        <A href="/fft" class={styles.card} data-home-nav="fft">
          <div class={styles.cardIcon}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1,8 3,4 5,10 7,2 9,12 11,6 13,8 15,8" />
            </svg>
          </div>
          <h3 class={styles.cardTitle}>FFT / PSD <kbd>⌥6</kbd></h3>
          <p class={styles.cardDesc}>Frequency-domain analysis with magnitude or power spectral density. Log scale, multi-trace overlay, zoom, and PNG/SVG/CSV export.</p>
        </A>

        <A href="/causal" class={styles.card} data-home-nav="causal">
          <div class={styles.cardIcon}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="3" cy="8" r="2" /><circle cx="13" cy="4" r="2" /><circle cx="13" cy="12" r="2" /><line x1="5" y1="7.2" x2="11" y2="4.8" /><line x1="5" y1="8.8" x2="11" y2="11.2" />
            </svg>
          </div>
          <h3 class={styles.cardTitle}>Causal Discovery <kbd>⌥9</kbd></h3>
          <p class={styles.cardDesc}>PCMCI, PCMCI+, FullCI, BivCI, and LPCMCI via Tigramite. Directed graph with edge lag and p-value labels. Export to JSON or torch_geometric.</p>
        </A>

        <A href="/drift" class={styles.card} data-home-nav="drift">
          <div class={styles.cardIcon}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="7" width="3" height="7" rx="0.5" /><rect x="5" y="4" width="3" height="10" rx="0.5" /><rect x="9" y="6" width="3" height="8" rx="0.5" /><rect x="13" y="2" width="2" height="12" rx="0.5" /><polyline points="1,5 5,2 9,4 13,1" stroke-dasharray="2 1.5" />
            </svg>
          </div>
          <h3 class={styles.cardTitle}>Drift Analysis <kbd>⌥0</kbd></h3>
          <p class={styles.cardDesc}>Compare windows and detect distribution or score shifts once the main workflow has identified the slices worth monitoring.</p>
        </A>
      </div>

      <div class={styles.shortcuts}>
        <h2 class={styles.sectionTitle}>Keyboard shortcuts</h2>
        <div class={styles.shortcutsGrid}>
          <div class={styles.shortcutGroup}>
            <h4 class={styles.shortcutGroupTitle}>Navigation</h4>
            <div class={styles.shortcutRow}><kbd>⌥1–3, 6–0</kbd><span>Switch major pages</span></div>
            <div class={styles.shortcutRow}><kbd>⌥4</kbd><span>Open scatter matrix view</span></div>
            <div class={styles.shortcutRow}><kbd>Ctrl+K</kbd><span>Command palette</span></div>
            <div class={styles.shortcutRow}><kbd>Ctrl+I</kbd><span>Analysis context panel</span></div>
          </div>
          <div class={styles.shortcutGroup}>
            <h4 class={styles.shortcutGroupTitle}>Chart</h4>
            <div class={styles.shortcutRow}><kbd>Double-click</kbd><span>Reset zoom</span></div>
            <div class={styles.shortcutRow}><kbd>Ctrl+click</kbd><span>Set adaptive filter target</span></div>
            <div class={styles.shortcutRow}><kbd>Drag</kbd><span>Pan / draw</span></div>
          </div>
          <div class={styles.shortcutGroup}>
            <h4 class={styles.shortcutGroupTitle}>Session</h4>
            <div class={styles.shortcutRow}><kbd>Ctrl+S</kbd><span>Save session</span></div>
            <div class={styles.shortcutRow}><kbd>Ctrl+Shift+S</kbd><span>Export session file</span></div>
            <div class={styles.shortcutRow}><kbd>Ctrl+O</kbd><span>Import session file</span></div>
          </div>
          <div class={styles.shortcutGroup}>
            <h4 class={styles.shortcutGroupTitle}>Drift</h4>
            <div class={styles.shortcutRow}><kbd>Enter / D</kbd><span>Run drift compute</span></div>
            <div class={styles.shortcutRow}><kbd>E</kbd><span>Export drift CSV</span></div>
            <div class={styles.shortcutRow}><kbd>J / P</kbd><span>Export JSON / PNG</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;