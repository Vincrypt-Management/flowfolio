import { useAuth } from '../contexts/AuthContext';
import { User, Settings } from 'lucide-react';
import './UserProfileCard.css';

interface UserProfileCardProps {
  collapsed: boolean;
  onSettingsClick: () => void;
}

export function UserProfileCard({ collapsed, onSettingsClick }: UserProfileCardProps) {
  const { user } = useAuth();

  const displayName = user?.name || 'Investor';
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'I';

  return (
    <div className={`user-profile-card ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="user-profile-btn"
        onClick={onSettingsClick}
        title={collapsed ? `${displayName} — Settings` : ''}
        aria-label="Open account settings"
      >
        <div className="user-avatar">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={displayName} className="user-avatar-img" />
          ) : (
            <span className="user-avatar-initials">{initials || <User size={16} />}</span>
          )}
        </div>
        {!collapsed && (
          <div className="user-info">
            <span className="user-name">{displayName}</span>
          </div>
        )}
      </button>
      {!collapsed && (
        <div className="user-actions">
          <button className="user-action-btn" onClick={onSettingsClick} title="Settings" aria-label="Settings">
            <Settings size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
