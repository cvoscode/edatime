import { Component, createSignal, Show } from 'solid-js';
import { uploadStore } from '../../stores/uploadStore';
import styles from './UploadDropzone.module.css';

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  onSampleDataset: (datasetId: string) => void;
}

const UploadDropzone: Component<UploadDropzoneProps> = (props) => {
  const [isDragging, setIsDragging] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

  const handleClick = () => {
    fileInputRef?.click();
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files[0];
    if (file) props.onFileSelected(file);
  };

  const handleFileChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) props.onFileSelected(file);
  };

  const handleBrowseClick = (e: MouseEvent) => {
    e.stopPropagation();
    fileInputRef?.click();
  };

  return (
    <div
      class={`${styles.dropZone} ${isDragging() ? styles.dragover : ''}`}
      role="button"
      tabindex="0"
      aria-label="Drop CSV or Parquet file here or browse for a file"
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span class={styles.title}>Drop CSV or Parquet here</span>
      <span class={styles.sub}>or</span>
      <button class={styles.browseBtn} type="button" onClick={handleBrowseClick}>Browse file</button>
      <input
        ref={fileInputRef}
        type="file"
        id="file-upload"
        accept=".csv,.parquet"
        hidden
        onChange={handleFileChange}
      />
      <Show when={uploadStore.state.selectedFile}>
        <span class={styles.filename} role="status" aria-live="polite">
          {uploadStore.state.selectedFile?.name}
        </span>
      </Show>
    </div>
  );
};

export default UploadDropzone;