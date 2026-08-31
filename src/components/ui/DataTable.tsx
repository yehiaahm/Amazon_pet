import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Search, Download, Eye, FileText, CheckSquare, Square } from 'lucide-react';
import * as XLSX from 'xlsx';
import Button from './Button';
import Input from './Input';

// Resolves a rendered cell (which may be a formatted JSX node, e.g. <Badge>) down to plain text/number
// so it can be written into a real spreadsheet cell instead of exporting blank.
function resolveCellValue(node: React.ReactNode): string | number {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'number') return node;
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(resolveCellValue).join('');
  if (React.isValidElement(node)) {
    return resolveCellValue((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  key: string;
  sortable?: boolean;
}

interface FilterConfig<T> {
  label: string;
  field: keyof T;
  options: { value: string; label: string }[];
}

interface BulkAction<T> {
  label: string;
  action: (rows: T[]) => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchField?: keyof T;
  /** When set, search matches any of these fields (overrides searchField). */
  searchFields?: (keyof T)[];
  filters?: FilterConfig<T>[];
  bulkActions?: BulkAction<T>[];
  rowKey: keyof T;
  pageSize?: number;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Search records...',
  searchField,
  filters = [],
  bulkActions = [],
  rowKey,
  pageSize = 10
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<any>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [showColMenu, setShowColMenu] = useState(false);

  // Filter & Search
  const filteredData = useMemo(() => {
    let result = [...data];

    // Search
    if (searchTerm && searchField) {
      result = result.filter(item => {
        const val = item[searchField];
        if (val === undefined || val === null) return false;
        return String(val).toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    // Dropdown Filters
    Object.entries(activeFilters).forEach(([field, value]) => {
      if (value) {
        result = result.filter(item => String(item[field]) === value);
      }
    });

    // Sorting
    if (sortField) {
      result.sort((a, b) => {
        const valA = a[sortField!];
        const valB = b[sortField!];

        if (valA === undefined || valB === undefined) return 0;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }

        return sortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return result;
  }, [data, searchTerm, searchField, activeFilters, sortField, sortOrder]);

  // Pagination
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;

  // Sorting Handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Visibility toggler
  const toggleColumn = (key: string) => {
    const next = new Set(hiddenColumns);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setHiddenColumns(next);
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
    } else {
      const keys = paginatedData.map(r => r[rowKey]);
      setSelectedRows(new Set(keys));
    }
  };

  const handleSelectRow = (keyVal: any) => {
    const next = new Set(selectedRows);
    if (next.has(keyVal)) {
      next.delete(keyVal);
    } else {
      next.add(keyVal);
    }
    setSelectedRows(next);
  };

  // Export to a real .xlsx workbook (resolves formatted/JSX columns to plain values,
  // avoids the mojibake Excel shows for Arabic text in plain CSV)
  const handleExportCSV = () => {
    const visibleCols = columns.filter(c => !hiddenColumns.has(c.key));
    const usedHeaders = new Set<string>();
    const headerNames = visibleCols.map(col => {
      let name = col.header?.trim() || col.key;
      while (usedHeaders.has(name)) name = `${name} `;
      usedHeaders.add(name);
      return name;
    });

    const sheetRows = filteredData.map(row => {
      const record: Record<string, string | number> = {};
      visibleCols.forEach((col, i) => {
        const raw = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
        record[headerNames[i]] = resolveCellValue(raw as React.ReactNode);
      });
      return record;
    });

    const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: headerNames });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
    XLSX.writeFile(workbook, `erp_export_${Date.now()}.xlsx`);
  };

  // Print optimized view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', width: '100%' }}>
      {/* Search and Filters Toolbar */}
      <div className="workspace-toolbar" style={{ flexWrap: 'wrap', gap: 'var(--spacing-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          {searchField && (
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px', flex: '1 1 200px' }}>
              <Search 
                size={16} 
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} 
              />
              <Input
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                style={{ paddingLeft: '32px' }}
              />
            </div>
          )}

          {/* Render Filters */}
          {filters.map(filter => (
            <select
              key={String(filter.field)}
              value={activeFilters[String(filter.field)] || ''}
              onChange={(e) => {
                setActiveFilters({ ...activeFilters, [String(filter.field)]: e.target.value });
                setCurrentPage(1);
              }}
              style={{ width: 'auto', minWidth: '130px' }}
            >
              <option value="">All {filter.label}</option>
              {filter.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>

        {/* Action buttons (CSV, Print, Cols Visibility) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexWrap: 'wrap', position: 'relative' }}>
          <Button onClick={() => setShowColMenu(!showColMenu)} variant="secondary" size="sm">
            <Eye size={14} /> Columns
          </Button>

          {showColMenu && (
            <div style={{
              position: 'absolute',
              top: '36px',
              right: 0,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              padding: 'var(--spacing-2)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: '150px',
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: '60vh',
              overflowY: 'auto'
            }}>
              {columns.map(c => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: '4px' }}>
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(c.key)}
                    onChange={() => toggleColumn(c.key)}
                  />
                  {c.header}
                </label>
              ))}
            </div>
          )}

          <Button onClick={handleExportCSV} variant="secondary" size="sm">
            <Download size={14} /> Export Excel
          </Button>
          <Button onClick={handlePrint} variant="secondary" size="sm">
            <FileText size={14} /> Print
          </Button>
        </div>
      </div>

      {/* Bulk actions notification bar */}
      {selectedRows.size > 0 && bulkActions.length > 0 && (
        <div style={{
          backgroundColor: 'var(--color-primary-light)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--spacing-2) var(--spacing-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-primary)'
        }}>
          <span><strong>{selectedRows.size}</strong> records selected</span>
          <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
            {bulkActions.map(action => (
              <Button
                key={action.label}
                variant={action.variant || 'secondary'}
                size="sm"
                onClick={() => {
                  const rows = filteredData.filter(r => selectedRows.has(r[rowKey]));
                  void Promise.resolve(action.action(rows)).finally(() => {
                    setSelectedRows(new Set());
                  });
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* The main table */}
      <div className="table-container">
        <table className="erp-table">
          <thead>
            <tr>
              {/* Checkbox select all */}
              <th style={{ width: '40px' }}>
                <span onClick={handleSelectAll} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  {selectedRows.size === paginatedData.length && paginatedData.length > 0 ? (
                    <CheckSquare size={16} className="text-primary" />
                  ) : (
                    <Square size={16} />
                  )}
                </span>
              </th>
              {columns.map(col => {
                if (hiddenColumns.has(col.key)) return null;
                return (
                  <th
                    key={col.key}
                    style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {col.header}
                      {col.sortable && sortField === col.key && (
                        sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 'var(--spacing-8)', color: 'var(--color-text-secondary)' }}>
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedData.map(row => {
                const keyVal = row[rowKey];
                const isSelected = selectedRows.has(keyVal);
                return (
                  <tr key={keyVal} className={isSelected ? 'selected' : ''}>
                    <td>
                      <span onClick={() => handleSelectRow(keyVal)} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                        {isSelected ? (
                          <CheckSquare size={16} style={{ color: 'var(--color-primary)' }} />
                        ) : (
                          <Square size={16} style={{ color: 'var(--color-border-dark)' }} />
                        )}
                      </span>
                    </td>
                    {columns.map(col => {
                      if (hiddenColumns.has(col.key)) return null;
                      return (
                        <td key={col.key}>
                          {typeof col.accessor === 'function'
                            ? col.accessor(row)
                            : String(row[col.accessor] ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-xs)', padding: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} records
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span style={{ alignSelf: 'center', padding: '0 8px', fontWeight: 'var(--font-weight-medium)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
export default DataTable;
