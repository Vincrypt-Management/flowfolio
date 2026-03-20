import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { createLogger } from '../core/logger';
import { invokeWithResilience } from '../services/apiClient';

const log = createLogger('UserProfileContext');

export type AccountType = 'personal' | 'professional';

export interface UserProfile {
  displayName: string;
  email: string;
  avatarUrl: string;
  accountType: AccountType;
  bio: string;
  company: string;
  location: string;
  website: string;
}

interface UserProfileContextType {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  resetProfile: () => void;
}

const LEGACY_STORAGE_KEY = 'flowfolio-user-profile';

const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Investor',
  email: '',
  avatarUrl: '',
  accountType: 'personal',
  bio: '',
  company: '',
  location: '',
  website: '',
};

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  // Load profile from SQLite on mount
  useEffect(() => {
    invokeWithResilience<string | null>('load_setting', { key: 'user_profile' })
      .then(value => {
        if (value) {
          try {
            setProfile(prev => ({ ...prev, ...JSON.parse(value) }));
          } catch { /* keep default */ }
        }
      })
      .catch(() => { /* keep default */ });
  }, []);

  // One-time migration from localStorage to SQLite
  useEffect(() => {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      invokeWithResilience('save_setting', { key: 'user_profile', value: legacy })
        .then(() => localStorage.removeItem(LEGACY_STORAGE_KEY))
        .catch(err => log.error('Failed to save user profile', err));
    }
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const updated = { ...prev, ...updates };
      invokeWithResilience('save_setting', { key: 'user_profile', value: JSON.stringify(updated) })
        .catch(err => log.error('Failed to save user profile', err));
      return updated;
    });
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    invokeWithResilience('save_setting', { key: 'user_profile', value: JSON.stringify(DEFAULT_PROFILE) })
      .catch(err => log.error('Failed to save user profile', err));
  }, []);

  return (
    <UserProfileContext.Provider value={{ profile, updateProfile, resetProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextType {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
}
