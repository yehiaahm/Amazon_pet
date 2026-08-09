import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, X } from 'lucide-react';

interface FileDropzoneProps {
  accept?: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  progress?: number | null; // 0-100, null = not uploading
  hint?: string;
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  accept = '.xlsx,.csv',
  onFileSelected,
  disabled = false,
  progress = null,
  hint = 'اسحب وأفلت ملف Excel (.xlsx) أو CSV هنا، أو اضغط للاختيار',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;
    const file = files[0];
    setSelectedFile(file);
    onFileSelected(file);
  }, [disabled, onFileSelected]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-8)',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: isDragging ? 'var(--color-primary-light)' : 'var(--color-surface)',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {selectedFile ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <FileSpreadsheet size={36} style={{ color: 'var(--color-primary)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
            <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{selectedFile.name}</span>
            {!disabled && (
              <X
                size={16}
                style={{ cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (inputRef.current) inputRef.current.value = ''; }}
              />
            )}
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {(selectedFile.size / 1024).toFixed(0)} KB
          </span>
          {progress !== null && (
            <div style={{ width: '100%', maxWidth: '260px', height: '6px', backgroundColor: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--color-primary)', transition: 'width 0.2s ease' }} />
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <UploadCloud size={36} style={{ color: 'var(--color-text-secondary)' }} />
          <span style={{ color: 'var(--color-text-secondary)' }}>{hint}</span>
        </div>
      )}
    </div>
  );
};

export default FileDropzone;
