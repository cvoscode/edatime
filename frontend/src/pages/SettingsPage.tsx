import { Component } from 'solid-js';
import { uiStore } from '../stores';
import { COLORMAPS, getColorScaleGradientCSS, type ColorScaleName } from '../utils/colorScale';
import { type PlotThemeMode } from '../utils/plotTemplate';
import styles from './SettingsPage.module.css';

const SettingsPage: Component = () => {
  const currentTheme = () => uiStore.state.theme;
  const currentColorScale = () => uiStore.state.colorScale;
  const currentPlotTheme = () => uiStore.state.plotTheme;

  const themeOptions = [
    {
      id: 'dark',
      name: 'Dark Mode',
      desc: 'Easy on the eyes during late-night analysis sessions.',
      icon: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 10.5A7 7 0 1 1 5.5 2a5 5 0 0 0 8.5 8.5z" />
        </svg>
      ),
    },
    {
      id: 'light',
      name: 'Light Mode',
      desc: 'Clean and crisp for daytime viewing.',
      icon: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="3" />
          <line x1="8" y1="1" x2="8" y2="3" />
          <line x1="8" y1="13" x2="8" y2="15" />
          <line x1="1" y1="8" x2="3" y2="8" />
          <line x1="13" y1="8" x2="15" y2="8" />
          <line x1="3" y1="3" x2="4.5" y2="4.5" />
          <line x1="11.5" y1="11.5" x2="13" y2="13" />
          <line x1="3" y1="13" x2="4.5" y2="11.5" />
          <line x1="11.5" y1="4.5" x2="13" y2="3" />
        </svg>
      ),
    },
    {
      id: 'system',
      name: 'Follow System',
      desc: 'Matches whatever your computer is set to. Zero effort.',
      icon: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="12" height="10" rx="1.5" />
          <polyline points="6,14 8,16 10,14" />
        </svg>
      ),
    },
  ];

  const plotThemeOptions = [
    {
      id: 'auto' as PlotThemeMode,
      name: 'Auto',
      desc: 'Follows your UI theme setting. Syncs nicely.',
      icon: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-.5 1.9l2.1 2.1a4 4 0 0 1-5.6 5.6l-2.1-2.1A4 4 0 0 1 2 8a4 4 0 0 1 10-6z" />
          <path d="M12 2v4" /><path d="M12 10v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M8.24 11.76l2.83 2.83" /><path d="M2 8h4" /><path d="M10 8h4" />
        </svg>
      ),
    },
    {
      id: 'light' as PlotThemeMode,
      name: 'Light',
      desc: 'Light background, dark text. Easier on the eyes in bright environments.',
      icon: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="3" />
          <line x1="8" y1="1" x2="8" y2="3" />
          <line x1="8" y1="13" x2="8" y2="15" />
          <line x1="1" y1="8" x2="3" y2="8" />
          <line x1="13" y1="8" x2="15" y2="8" />
          <line x1="3" y1="3" x2="4.5" y2="4.5" />
          <line x1="11.5" y1="11.5" x2="13" y2="13" />
          <line x1="3" y1="13" x2="4.5" y2="11.5" />
          <line x1="11.5" y1="4.5" x2="13" y2="3" />
        </svg>
      ),
    },
    {
      id: 'dark' as PlotThemeMode,
      name: 'Dark',
      desc: 'Dark background, light text. Puts focus on your data.',
      icon: (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 10.5A7 7 0 1 1 5.5 2a5 5 0 0 0 8.5 8.5z" />
        </svg>
      ),
    },
  ];

  return (
    <div class={styles.page}>
      <div class={styles.hero}>
        <div class={styles.heroIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </div>
        <h1 class={styles.title}>Settings</h1>
        <p class={styles.tagline}>Tweak things until it feels just right. Changes happen instantly.</p>
      </div>

      <div class={styles.content}>
        <div class={styles.section}>
          <h2 class={styles.sectionTitle}>Make it yours</h2>
          <p class={styles.sectionCopy}>Pick a theme that works for you. Your eyes will thank you.</p>
          <div class={styles.themeGrid}>
            {themeOptions.map((theme) => (
              <button
                class={`${styles.themeCard} ${currentTheme() === theme.id ? styles.active : ''}`}
                onClick={() => uiStore.setTheme(theme.id as 'dark' | 'light' | 'system')}
                type="button"
              >
                <div class={styles.themeIcon}>{theme.icon}</div>
                <div class={styles.themeInfo}>
                  <div class={styles.themeName}>{theme.name}</div>
                  <div class={styles.themeDesc}>{theme.desc}</div>
                </div>
                {currentTheme() === theme.id && (
                  <div class={styles.checkmark}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3,8 6,12 13,4" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div class={styles.section}>
          <h2 class={styles.sectionTitle}>Color scale</h2>
          <p class={styles.sectionCopy}>Sets the palette for heatmaps, scatter plots, and charts. Pick what feels right for your data.</p>
          <div class={styles.colorScaleGrid}>
            {(Object.keys(COLORMAPS) as ColorScaleName[]).map((id) => (
              <button
                class={`${styles.colorScaleCard} ${currentColorScale() === id ? styles.active : ''}`}
                onClick={() => uiStore.setColorScale(id)}
                type="button"
              >
                <div
                  class={styles.colorScalePreview}
                  style={{ background: getColorScaleGradientCSS(id) }}
                />
                <div class={styles.colorScaleInfo}>
                  <div class={styles.colorScaleName}>{COLORMAPS[id].label}</div>
                  <div class={styles.colorScaleDesc}>{COLORMAPS[id].desc}</div>
                </div>
                {currentColorScale() === id && (
                  <div class={styles.checkmark}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3,8 6,12 13,4" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div class={styles.section}>
          <h2 class={styles.sectionTitle}>Plot appearance</h2>
          <p class={styles.sectionCopy}>Controls the background and colors of charts. Independent of the UI theme — set it however you like.</p>
          <div class={styles.plotThemeGrid}>
            {plotThemeOptions.map((opt) => (
              <button
                class={`${styles.plotThemeCard} ${currentPlotTheme() === opt.id ? styles.active : ''}`}
                onClick={() => uiStore.setPlotTheme(opt.id)}
                type="button"
              >
                <div class={styles.plotThemeIcon}>{opt.icon}</div>
                <div class={styles.plotThemeInfo}>
                  <div class={styles.plotThemeName}>{opt.name}</div>
                  <div class={styles.plotThemeDesc}>{opt.desc}</div>
                </div>
                {currentPlotTheme() === opt.id && (
                  <div class={styles.checkmark}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3,8 6,12 13,4" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div class={styles.section}>
          <h2 class={styles.sectionTitle}>Keyboard shortcuts</h2>
          <p class={styles.sectionCopy}>Once you memorize these, you'll feel like a pro. No cap.</p>
          <div class={styles.shortcutsGrid}>
            <div class={styles.shortcutGroup}>
              <h4 class={styles.shortcutGroupTitle}>Navigation</h4>
              <div class={styles.shortcutRow}><kbd>⌥1</kbd><span>Upload</span></div>
              <div class={styles.shortcutRow}><kbd>⌥2</kbd><span>Timeseries</span></div>
              <div class={styles.shortcutRow}><kbd>⌥3</kbd><span>Scatter</span></div>
              <div class={styles.shortcutRow}><kbd>⌥4</kbd><span>Matrix view</span></div>
            </div>
            <div class={styles.shortcutGroup}>
              <h4 class={styles.shortcutGroupTitle}>Chart</h4>
              <div class={styles.shortcutRow}><kbd>Dbl-click</kbd><span>Reset zoom</span></div>
              <div class={styles.shortcutRow}><kbd>Ctrl+click</kbd><span>Set adaptive filter</span></div>
              <div class={styles.shortcutRow}><kbd>Drag</kbd><span>Pan / draw</span></div>
            </div>
            <div class={styles.shortcutGroup}>
              <h4 class={styles.shortcutGroupTitle}>Session</h4>
              <div class={styles.shortcutRow}><kbd>Ctrl+S</kbd><span>Save session</span></div>
              <div class={styles.shortcutRow}><kbd>Ctrl+O</kbd><span>Import session</span></div>
              <div class={styles.shortcutRow}><kbd>Ctrl+K</kbd><span>Command palette</span></div>
            </div>
          </div>
        </div>

        <div class={styles.section}>
          <h2 class={styles.sectionTitle}>About</h2>
          <div class={styles.aboutGrid}>
            <div class={styles.aboutCard}>
              <div class={styles.aboutIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="2,18 7,10 12,22 17,6 22,16 30,12 30,12" />
                </svg>
              </div>
              <div class={styles.aboutInfo}>
                <div class={styles.aboutName}>EdaTime</div>
                <div class={styles.aboutVersion}>v0.1.0</div>
              </div>
            </div>
            <div class={styles.aboutCard}>
              <div class={styles.aboutIcon}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1,10 4,6 7,12 10,3 13,8 15,7" />
                </svg>
              </div>
              <div class={styles.aboutInfo}>
                <div class={styles.aboutName}>ChartGPU</div>
                <div class={styles.aboutVersion}>WebGPU rendering</div>
              </div>
            </div>
          </div>
          <p class={styles.aboutDesc}>
            Upload your data, explore patterns, and export insights. Built for people who actually work with time series.
          </p>
          <div class={styles.links}>
            <a href="/" class={styles.link}>Documentation</a>
            <a href="/" class={styles.link}>GitHub</a>
            <a href="/" class={styles.link}>Report an issue</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;