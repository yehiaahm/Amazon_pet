import { useEffect, useRef } from 'react';

type BarcodeScanHandler = (code: string, opts?: { silentIfMissing?: boolean }) => boolean;

type UseBarcodeWedgeListenerOptions = {
  enabled: boolean;
  scanArmed: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onArmScan: () => void;
  onScan: BarcodeScanHandler;
  onSetPaymentMethod: (method: 'CASH' | 'CARD') => void;
  onClearCart: () => void;
};

/**
 * Keyboard wedge barcode scanner + POS shortcuts (F1/F3/F4/Escape).
 * Keeps handler refs stable so the keydown listener does not re-bind on every render.
 */
export function useBarcodeWedgeListener({
  enabled,
  scanArmed,
  searchInputRef,
  onArmScan,
  onScan,
  onSetPaymentMethod,
  onClearCart,
}: UseBarcodeWedgeListenerOptions) {
  const scanBufferRef = useRef('');
  const scanLastKeyAtRef = useRef(0);
  const handleBarcodeScanRef = useRef<BarcodeScanHandler>(() => false);
  const armBarcodeScanRef = useRef<() => void>(() => {});

  handleBarcodeScanRef.current = onScan;
  armBarcodeScanRef.current = onArmScan;

  useEffect(() => {
    if (!enabled) return;

    const isTypingInField = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      if (tag === 'input') {
        if (el === searchInputRef.current) return false;
        return true;
      }
      return false;
    };

    const handleShortcuts = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        armBarcodeScanRef.current();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        onSetPaymentMethod('CASH');
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        onSetPaymentMethod('CARD');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClearCart();
        return;
      }

      if (!scanArmed && document.activeElement !== searchInputRef.current) return;
      if (isTypingInField(e.target) && document.activeElement !== searchInputRef.current) return;
      if (document.activeElement === searchInputRef.current) return;

      const now = Date.now();
      if (now - scanLastKeyAtRef.current > 80) {
        scanBufferRef.current = '';
      }
      scanLastKeyAtRef.current = now;

      if (e.key === 'Enter') {
        const code = scanBufferRef.current;
        scanBufferRef.current = '';
        if (code.length >= 2) {
          e.preventDefault();
          handleBarcodeScanRef.current(code);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        scanBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [enabled, scanArmed, searchInputRef, onSetPaymentMethod, onClearCart]);

  return { clearScanBuffer: () => { scanBufferRef.current = ''; } };
}
