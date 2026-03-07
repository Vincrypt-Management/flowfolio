import { useUserProfile } from '../contexts/UserProfileContext';
import { User, Settings } from 'lucide-react';
import './UserProfileCard.css';

interface UserProfileCardProps {
  collapsed: boolean;
  onSettingsClick: () => void;
}

export function UserProfileCard({ collapsed, onSettingsClick }: UserProfileCardProps) {
  const { profile } = useUserProfile();

  const initials = profile.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      className={`user-profile-card ${collapsed ? 'collapsed' : ''}`}
      onClick={onSettingsClick}
      title={collapsed ? `${profile.displayName} — Settings` : ''}
      aria-label="Open account settings"
    >
      <div className="user-avatar">
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt={profile.displayName} className="user-avatar-img" />
        ) : (
          <span className="user-avatar-initials">{initials || <User size={16} />}</span>
        )}
        {profile.accountType === 'professional' && (
          <span className="pro-badge" title="Professional Account">PRO</span>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="user-info">
            <span className="user-name">{profile.displayName}</span>
            <span className="user-account-type">
              {profile.accountType === 'professional' ? 'Professional' : 'Personal'} Account
            </span>
          </div>
          <Settings size={14} className="user-settings-icon" />
        </>
      )}
    </button>
  );
}
