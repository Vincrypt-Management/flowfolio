import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search } from 'lucide-react';
import './CommandPalette.css';

export interface Command {
  id: string;
  label: string;
  category: 'navigation' | 'action';
  shortcut?: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ isOpen, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 12);
    return commands
      .filter(cmd => cmd.label.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, commands]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0);
      // Defer focus so the element is visible
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Keep selectedIndex in bounds when filtered list changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  const handleItemClick = (cmd: Command) => {
    cmd.action();
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={handleOverlayClick}
    >
      <div className="command-palette">
        <div className="command-input-wrapper">
          <Search className="command-search-icon" size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            className="command-input"
            type="text"
            placeholder="Search commands…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-controls="command-results-list"
            aria-activedescendant={
              filteredCommands[selectedIndex]
                ? `command-item-${filteredCommands[selectedIndex].id}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-esc-hint">ESC</kbd>
        </div>

        <div className="command-results" role="region" aria-label="Results">
          {filteredCommands.length === 0 ? (
            <div className="command-empty" role="status">
              No results found
            </div>
          ) : (
            <ul
              id="command-results-list"
              ref={listRef}
              className="command-results-list"
              role="listbox"
              aria-label="Commands"
            >
              {filteredCommands.map((cmd, index) => (
                <li
                  key={cmd.id}
                  id={`command-item-${cmd.id}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                >
                  <button
                    className={`command-item${index === selectedIndex ? ' selected' : ''}`}
                    onClick={() => handleItemClick(cmd)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    tabIndex={-1}
                  >
                    <div className="command-item-left">
                      <span className={`command-category command-category--${cmd.category}`}>
                        {cmd.category}
                      </span>
                      <span className="command-label">{cmd.label}</span>
                    </div>
                    {cmd.shortcut && (
                      <span className="command-shortcut">{cmd.shortcut}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
