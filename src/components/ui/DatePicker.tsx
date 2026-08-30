import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { ARABIC_MONTHS, formatLocalDate, parseLocalDate } from '../../core/utils/periodFinance';

const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

interface DatePickerProps {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  max?: string; // YYYY-MM-DD
  min?: string; // YYYY-MM-DD
  error?: string;
  disabled?: boolean;
  containerStyle?: React.CSSProperties;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  max,
  min,
  error,
  disabled,
  containerStyle,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = value ? parseLocalDate(value) : null;
  const today = new Date();

  const [viewYear, setViewYear] = useState(() => (selected ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected ?? today).getMonth());

  useEffect(() => {
    if (open) {
      const base = selected ?? today;
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const maxDate = max ? parseLocalDate(max) : null;
  const minDate = min ? parseLocalDate(min) : null;

  const yearOptions = useMemo(() => {
    const maxYear = maxDate ? maxDate.getFullYear() : today.getFullYear() + 5;
    const minYear = minDate ? minDate.getFullYear() : today.getFullYear() - 15;
    const lo = Math.min(minYear, viewYear);
    const hi = Math.max(maxYear, viewYear);
    const years: number[] = [];
    for (let y = hi; y >= lo; y--) years.push(y);
    return years;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, max, min]);

  const isDisabled = (d: Date) => {
    if (maxDate && d > maxDate) return true;
    if (minDate && d < minDate) return true;
    return false;
  };

  const goPrevMonth = () => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  };
  const goNextMonth = () => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  };

  const days = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ date: Date } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(viewYear, viewMonth, d) });
    return cells;
  }, [viewYear, viewMonth]);

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(formatLocalDate(d));
    setOpen(false);
  };

  const displayText = selected
    ? `${selected.getDate()} ${ARABIC_MONTHS[selected.getMonth()]} ${selected.getFullYear()}`
    : 'اختر تاريخ';

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', width: '100%', position: 'relative', ...containerStyle }}>
      {label && (
        <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-2)',
          padding: '8px 10px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          backgroundColor: disabled ? 'var(--color-bg)' : 'var(--color-surface)',
          color: selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'right',
        }}
      >
        {displayText}
        <Calendar size={14} />
      </button>
      {error && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>{error}</span>}

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          marginTop: '4px',
          right: 0,
          zIndex: 100,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--spacing-3)',
          width: '280px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--spacing-2)' }}>
            <button type="button" onClick={goPrevMonth} className="btn-ghost" style={{ border: 'none', borderRadius: 'var(--radius-md)', padding: '4px', cursor: 'pointer' }}>
              <ChevronRight size={16} />
            </button>
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}
            >
              {ARABIC_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              style={{ width: '90px', fontSize: 'var(--font-size-xs)' }}
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={goNextMonth} className="btn-ghost" style={{ border: 'none', borderRadius: 'var(--radius-md)', padding: '4px', cursor: 'pointer' }}>
              <ChevronLeft size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>
                {w.slice(0, 2)}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {days.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} />;
              const disabledDay = isDisabled(cell.date);
              const isSelected = selected && formatLocalDate(cell.date) === formatLocalDate(selected);
              const isToday = formatLocalDate(cell.date) === formatLocalDate(today);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => pick(cell.date)}
                  style={{
                    padding: '6px 0',
                    fontSize: 'var(--font-size-xs)',
                    borderRadius: 'var(--radius-md)',
                    border: isToday && !isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                    backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                    color: disabledDay ? 'var(--color-text-secondary)' : isSelected ? 'var(--color-text-white)' : 'var(--color-text-primary)',
                    opacity: disabledDay ? 0.4 : 1,
                    cursor: disabledDay ? 'not-allowed' : 'pointer',
                  }}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--spacing-2)', paddingTop: 'var(--spacing-2)', borderTop: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ border: 'none', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', cursor: 'pointer', padding: '4px' }}
              onClick={() => pick(today)}
              disabled={isDisabled(today)}
            >
              اليوم
            </button>
            {value && (
              <button
                type="button"
                className="btn-ghost"
                style={{ border: 'none', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px' }}
                onClick={() => { onChange(''); setOpen(false); }}
              >
                مسح
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
