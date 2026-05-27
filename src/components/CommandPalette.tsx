import { useMemo } from 'react';
import { CommandPalette as LibCommandPalette, type CommandItem } from '@flowfolio/ui';

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

const CATEGORY_LABEL: Record<Command['category'], string> = {
  navigation: 'Navigation',
  action: 'Actions',
};

export function CommandPalette({ isOpen, onClose, commands }: Props) {
  const items = useMemo<CommandItem[]>(
    () =>
      commands.map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        description: cmd.shortcut,
        group: CATEGORY_LABEL[cmd.category],
        onSelect: cmd.action,
      })),
    [commands]
  );

  return (
    <LibCommandPalette
      open={isOpen}
      onClose={onClose}
      items={items}
      placeholder="Search commands…"
    />
  );
}
