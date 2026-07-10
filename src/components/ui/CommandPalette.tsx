import React, { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../../core/stores/uiStore';
import { Search, Monitor, ShoppingCart, Package, DollarSign, Brain, Settings, Users, PlusCircle } from 'lucide-react';

interface CommandItem {
  id: string;
  name: string;
  category: string;
  icon: React.ReactNode;
  action: () => void;
  shortcut?: string;
}

export const CommandPalette: React.FC = () => {
  const isOpen = useUIStore(s => s.commandPaletteOpen);
  const setOpen = useUIStore(s => s.setCommandPaletteOpen);
  const setActiveModule = useUIStore(s => s.setActiveModule);
  
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global Keydown Listener for Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  // Focus Input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const commands: CommandItem[] = [
    // Navigation
    { id: 'nav-exec', name: 'Go to Executive Dashboard', category: 'Navigation', icon: <Monitor size={16} />, action: () => setActiveModule('dashboard-executive') },
    { id: 'nav-fin-dash', name: 'Go to Financial Dashboard', category: 'Navigation', icon: <DollarSign size={16} />, action: () => setActiveModule('dashboard-financial') },
    { id: 'nav-inv-dash', name: 'Go to Inventory Dashboard', category: 'Navigation', icon: <Package size={16} />, action: () => setActiveModule('dashboard-inventory') },
    { id: 'nav-ops-dash', name: 'Go to Operations Dashboard', category: 'Navigation', icon: <Monitor size={16} />, action: () => setActiveModule('dashboard-operations') },
    { id: 'nav-pos', name: 'Go to POS Cash Register', category: 'Navigation', icon: <ShoppingCart size={16} />, action: () => setActiveModule('pos') },
    { id: 'nav-inv', name: 'Go to Inventory & Warehouses', category: 'Navigation', icon: <Package size={16} />, action: () => setActiveModule('inventory') },
    { id: 'nav-fin', name: 'Go to Finance Ledger', category: 'Navigation', icon: <DollarSign size={16} />, action: () => setActiveModule('finance') },
    { id: 'nav-ai', name: 'Go to AI Business Advisor', category: 'Navigation', icon: <Brain size={16} />, action: () => setActiveModule('ai') },
    { id: 'nav-sett', name: 'Go to System Settings', category: 'Navigation', icon: <Settings size={16} />, action: () => setActiveModule('settings') },
    
    // Quick Actions
    { id: 'act-pos-new', name: 'New POS Cart Sale', category: 'Actions', icon: <PlusCircle size={16} />, action: () => { setActiveModule('pos'); }, shortcut: 'N' },
    { id: 'act-add-prod', name: 'Add New Product', category: 'Actions', icon: <PlusCircle size={16} />, action: () => { setActiveModule('inventory'); }, shortcut: 'P' },
    { id: 'act-add-cust', name: 'Add New Customer', category: 'Actions', icon: <Users size={16} />, action: () => { setActiveModule('crm'); }, shortcut: 'C' },
    { id: 'act-add-exp', name: 'Record New Expense', category: 'Actions', icon: <DollarSign size={16} />, action: () => { setActiveModule('finance'); }, shortcut: 'E' },
  ];

  // Filtering
  const filtered = commands.filter(cmd => 
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={() => setOpen(false)}
      style={{ alignItems: 'flex-start', paddingTop: '10vh' }}
    >
      <div 
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth: '560px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-4)', borderBottom: '1px solid var(--color-border)' }}>
          <Search size={18} style={{ color: 'var(--color-text-secondary)', marginRight: '12px' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search module..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            style={{
              border: 'none',
              padding: 0,
              fontSize: 'var(--font-size-base)',
              width: '100%',
              backgroundColor: 'transparent',
              outline: 'none',
              boxShadow: 'none'
            }}
          />
          <span style={{ fontSize: 'var(--font-size-xs)', padding: '2px 6px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg)' }}>
            ESC
          </span>
        </div>

        {/* Commands List */}
        <div 
          ref={listRef}
          style={{
            maxHeight: '280px',
            overflowY: 'auto',
            padding: 'var(--spacing-2) 0'
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 'var(--spacing-4)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              No commands found for "{query}"
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => { cmd.action(); setOpen(false); }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px var(--spacing-4)',
                    backgroundColor: isSelected ? 'var(--color-primary-light)' : 'transparent',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)', display: 'flex' }}>
                      {cmd.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)' }}>
                        {cmd.name}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)', opacity: isSelected ? 0.8 : 0.6 }}>
                        {cmd.category}
                      </div>
                    </div>
                  </div>
                  {cmd.shortcut && (
                    <span style={{ fontSize: '10px', padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
                      ⌥{cmd.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        
        {/* Footer */}
        <div style={{ padding: '8px var(--spacing-4)', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
          <span>Use ↑↓ keys to navigate, Enter to select</span>
          <span>Ctrl + K to toggle anywhere</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
