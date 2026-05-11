import { Component, createSignal, Show, For, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { uploadStore } from '../stores/uploadStore';
import { datasetStore } from '../stores';
import { uiStore } from '../stores/uiStore';
import { uploadPreview, uploadIngest, fetchMetadata, fetchSampleETTm2 } from '../services/api';
import { generateSinusoidalCsv, generateWeatherCsv, createFileFromCsv } from '../utils/csvGenerators';
import { SwitchToggle } from '../components/ui';
import UploadDropzone from '../components/upload/UploadDropzone';
import ColumnProfileGrid from '../components/upload/ColumnProfileGrid';
import styles from './UploadPage.module.css';

const UploadPage: Component = () => {
  const navigate = useNavigate();
  const [profileMode, setProfileMode] = createSignal<'dataset' | 'preview'>('dataset');

  onMount(() => {
    const sampleId = sessionStorage.getItem('sampleDataset');
    if (sampleId) {
      sessionStorage.removeItem('sampleDataset');
      handleSampleDataset(sampleId);
    }
  });

  const handlePreview = async (file: File) => {
    uploadStore.setSelectedFile(file);
    uploadStore.setPreviewing(true);
    uploadStore.setUploadStatus('Loading preview...');

    try {
      const result = await uploadPreview(file);
      uploadStore.setPreview(result.metadata, result.metadata.column_profiles);
      setProfileMode('preview');
      uploadStore.setUploadStatus('');
    } catch (err) {
      uploadStore.setUploadStatus(`Error: ${err}`);
    } finally {
      uploadStore.setPreviewing(false);
    }
  };

  const handleUpload = async () => {
    const file = uploadStore.state.selectedFile;
    if (!file) return;

    uploadStore.setUploading(true);
    uploadStore.setUploadStatus('Uploading...');
    uploadStore.setUploadProgress(0);

    try {
      const options = {
        columns: uploadStore.state.selectedColumns.length > 0 ? uploadStore.state.selectedColumns : undefined,
        max_rows: uploadStore.state.partialEnabled ? uploadStore.state.maxRows : undefined,
        skip_rows: uploadStore.state.partialEnabled ? uploadStore.state.skipRows : undefined,
        time_start: uploadStore.state.partialEnabled ? uploadStore.state.timeStart : undefined,
        time_end: uploadStore.state.partialEnabled ? uploadStore.state.timeEnd : undefined,
        time_column: uploadStore.state.timeColumn || undefined,
      };

      const result = await uploadIngest(file, options);
      const rowCount = result.row_count ?? result.rows ?? 0;
      const colCount = result.columns?.length ?? 0;

      const freshMetadata = await fetchMetadata();
      uploadStore.setPreview(freshMetadata, freshMetadata.column_profiles);
      setProfileMode('dataset');

      uiStore.addToast({
        message: `Uploaded ${file.name} with ${rowCount.toLocaleString()} rows and ${colCount} columns.`,
        type: 'success',
        duration: 5000,
      });
      datasetStore.setMetadata({
        name: file.name,
        rowCount: rowCount,
        columns: result.columns,
        timestampColumn: result.timestamp_column ?? '',
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
      });
      datasetStore.setNumericCols(result.numeric_columns ?? []);
      uploadStore.setUploadStatus(`Loaded ${rowCount.toLocaleString()} rows`);
    } catch (err) {
      uploadStore.setUploadStatus(`Error: ${err}`);
    } finally {
      uploadStore.setUploading(false);
    }
  };

  const handleSampleDataset = async (datasetId: string) => {
    uploadStore.setPreviewing(true);
    uploadStore.setUploadStatus('Loading sample...');

    let file: File;

    try {
      if (datasetId === 'ettm2') {
        file = await fetchSampleETTm2();
      } else if (datasetId === 'sinusoidal') {
        const csv = generateSinusoidalCsv();
        file = createFileFromCsv(csv, 'sinusoidal.csv');
      } else {
        const csv = generateWeatherCsv();
        file = createFileFromCsv(csv, 'weather.csv');
      }

      uploadStore.setSelectedFile(file);

      const result = await uploadPreview(file);
      uploadStore.setPreview(result.metadata, result.metadata.column_profiles);
      setProfileMode('preview');
      uploadStore.setUploadStatus('');
    } catch (err) {
      uploadStore.setUploadStatus(`Error loading sample: ${err}`);
    } finally {
      uploadStore.setPreviewing(false);
    }
  };

  const handleSelectAll = () => {
    if (uploadStore.state.previewMetadata) {
      uploadStore.setSelectedColumns(uploadStore.state.previewMetadata.numeric_columns);
    }
  };

  const handleSelectNone = () => {
    uploadStore.setSelectedColumns([]);
  };

  return (
    <div class={styles.page}>
      <div class={styles.uploadInner}>
        <div class={styles.sourceTabs} role="tablist">
          <button
            class={`${styles.tabBtn} ${uploadStore.state.source === 'file' ? styles.active : ''}`}
            onClick={() => uploadStore.setSource('file')}
            role="tab"
            aria-selected={uploadStore.state.source === 'file'}
          >
            File
          </button>
          <button
            class={`${styles.tabBtn} ${uploadStore.state.source === 'database' ? styles.active : ''}`}
            onClick={() => uploadStore.setSource('database')}
            role="tab"
            aria-selected={uploadStore.state.source === 'database'}
          >
            Database
          </button>
        </div>

        <Show when={uploadStore.state.source === 'file'}>
          <div class={styles.filePanel}>
            <UploadDropzone onFileSelected={handlePreview} onSampleDataset={handleSampleDataset} />

            <div class={styles.partialSection}>
              <div class={styles.partialSectionTitle}>Load options</div>
              <label class={styles.toggleRow}>
                <SwitchToggle
                  checked={uploadStore.state.partialEnabled}
                  onChange={(e: Event & { currentTarget: HTMLInputElement }) => uploadStore.setPartialEnabled(e.currentTarget.checked)}
                  aria-label="Enable partial load options"
                />
                <div>
                  <div class={styles.toggleLabelText}>Partial load</div>
                  <div class={styles.toggleSub}>Limit the rows ingested from the file</div>
                </div>
              </label>

              <div class={`${styles.partialFields} ${uploadStore.state.partialEnabled ? styles.visible : ''}`}>
                <div class={styles.fieldGroup}>
                  <label for="n-rows-input">Max rows to load</label>
                  <div class={styles.row}>
                    <input
                      type="number"
                      id="n-rows-input"
                      placeholder="All rows"
                      min="1"
                      step="1000"
                      value={uploadStore.state.maxRows}
                      onInput={(e) => uploadStore.setMaxRows(parseInt(e.currentTarget.value) || 1000000)}
                    />
                    <input
                      type="range"
                      id="n-rows-range"
                      min="1000"
                      max="5000000"
                      step="1000"
                      value={uploadStore.state.maxRows}
                      onInput={(e) => uploadStore.setMaxRows(parseInt(e.currentTarget.value))}
                    />
                    <span class={styles.rangeValue}>{uploadStore.state.maxRows.toLocaleString()}</span>
                  </div>
                </div>

                <div class={styles.fieldGroup}>
                  <label for="skip-rows-input">Skip first N rows</label>
                  <input
                    type="number"
                    id="skip-rows-input"
                    placeholder="0"
                    min="0"
                    value={uploadStore.state.skipRows}
                    onInput={(e) => uploadStore.setSkipRows(parseInt(e.currentTarget.value) || 0)}
                  />
                </div>

                <div class={styles.fieldGroup}>
                  <label>Time range (optional)</label>
                  <div class={`${styles.row} ${styles.rowTime}`}>
                    <input
                      type="datetime-local"
                      id="time-start-input"
                      value={uploadStore.state.timeStart}
                      onInput={(e) => uploadStore.setTimeStart(e.currentTarget.value)}
                    />
                    <input
                      type="datetime-local"
                      id="time-end-input"
                      value={uploadStore.state.timeEnd}
                      onInput={(e) => uploadStore.setTimeEnd(e.currentTarget.value)}
                    />
                  </div>
                </div>

                <div class={styles.fieldGroup}>
                  <label for="time-column-select">Time column</label>
                  <select
                    id="time-column-select"
                    class={styles.select}
                    value={uploadStore.state.timeColumn}
                    onChange={(e) => uploadStore.setTimeColumn(e.currentTarget.value)}
                  >
                    <option value="">Auto-detect</option>
                    <For each={uploadStore.state.previewMetadata?.columns ?? []}>
                      {(col: { name: string }) => <option value={col.name}>{col.name}</option>}
                    </For>
                  </select>
                </div>
              </div>
            </div>

            <div class={styles.uploadActions}>
              <button
                class={styles.uploadBtn}
                id="upload-btn"
                type="button"
                disabled={!uploadStore.state.selectedFile || uploadStore.state.isUploading}
                onClick={handleUpload}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 11V3M5 6l3-3 3 3" />
                  <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" />
                </svg>
                Upload & Ingest
              </button>
              <Show when={uploadStore.state.isUploading}>
                <div class={styles.progressWrap} role="progressbar">
                  <div class={styles.progressBar} style={{ width: `${uploadStore.state.uploadProgress}%` }} />
                </div>
              </Show>
              <Show when={uploadStore.state.uploadStatus}>
                <div class={`${styles.status} ${uploadStore.state.uploadStatus.includes('Error') ? styles.error : ''}`}>
                  {uploadStore.state.uploadStatus}
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={uploadStore.state.source === 'database'}>
          <div class={styles.dbSection}>
            <div class={styles.partialSectionTitle}>Database Connection</div>
            <p class={styles.toggleSub}>Connect to PostgreSQL or TimescaleDB and load a table into the active dataset.</p>
            <div class={styles.dbFields}>
              <div class={styles.fieldGroup}>
                <label for="db-backend-select">Backend</label>
                <select id="db-backend-select" class={styles.select}>
                  <option value="timescale">TimescaleDB</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </div>
              <div class={styles.fieldGroup}>
                <label for="db-connection-input">Connection string</label>
                <input
                  type="text"
                  id="db-connection-input"
                  class={styles.input}
                  placeholder="postgres://user:pass@host/db"
                  value={uploadStore.state.dbConnectionString}
                  onInput={(e) => uploadStore.setDbConnectionString(e.currentTarget.value)}
                />
              </div>
              <div class={styles.fieldGroup}>
                <label for="db-schema-input">Schema</label>
                <input
                  type="text"
                  id="db-schema-input"
                  class={styles.input}
                  placeholder="public"
                  value={uploadStore.state.dbSchema}
                  onInput={(e) => uploadStore.setDbSchema(e.currentTarget.value)}
                />
              </div>
              <div class={styles.fieldGroup}>
                <label for="db-table-select">Table / Hypertable</label>
                <div class={styles.dbTableRow}>
                  <select
                    id="db-table-select"
                    class={styles.select}
                    disabled={!uploadStore.state.dbConnected}
                  >
                    <option value="">— connect first —</option>
                    <For each={uploadStore.state.dbTables}>
                      {(table: string) => <option value={table}>{table}</option>}
                    </For>
                  </select>
                  <input
                    type="text"
                    id="db-table-input"
                    class={styles.input}
                    placeholder="or type name"
                  />
                </div>
              </div>
              <div class={styles.fieldGroup}>
                <label for="db-time-col-input">Time column</label>
                <input
                  type="text"
                  id="db-time-col-input"
                  class={styles.input}
                  placeholder="Auto-detect"
                />
              </div>
              <div class={styles.dbBtnRow}>
                <button class={styles.primaryBtn} id="db-connect-btn" type="button">
                  Connect
                </button>
                <button class={styles.primaryBtn} id="db-load-btn" type="button" disabled>
                  Load data
                </button>
                <button class={styles.ghostBtn} id="db-disconnect-btn" type="button" hidden>
                  Disconnect
                </button>
              </div>
              <div class={styles.status} id="db-status" />
            </div>
          </div>
        </Show>
      </div>

      <div class={styles.uploadPreview}>
        <div class={styles.uploadPreviewHead}>
          <span class={styles.toolbarLabel}>File Preview</span>
          <span class={`${styles.profileModeBadge}`} data-mode={profileMode()}>
            {profileMode() === 'dataset' ? 'Current dataset' : 'Pending upload'}
          </span>
          <div class={styles.uploadPreviewSelection}>
            <button class={styles.selectBtn} id="profile-select-all-btn" type="button" onClick={handleSelectAll}>All</button>
            <button class={styles.selectBtn} id="profile-select-none-btn" type="button" onClick={handleSelectNone}>None</button>
          </div>
          <input
            type="text"
            id="profile-filter-input"
            class={styles.columnFilterInput}
            placeholder="Filter columns…"
          />
          <span class={styles.uploadPreviewStatus}>
            {uploadStore.state.isPreviewing
              ? 'Loading preview...'
              : uploadStore.state.previewMetadata
              ? `${uploadStore.state.previewMetadata.total_rows.toLocaleString()} rows × ${uploadStore.state.previewMetadata.columns.length} columns`
              : 'Select a file to preview columns'}
          </span>
        </div>

        <ColumnProfileGrid
          profiles={uploadStore.state.previewProfiles}
          selectedColumns={uploadStore.state.selectedColumns}
          onSelectionChange={(cols: string[]) => uploadStore.setSelectedColumns(cols)}
        />
      </div>
    </div>
  );
};

export default UploadPage;