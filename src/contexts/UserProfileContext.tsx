import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

const STORAGE_KEY = 'flowfolio-user-profile';

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

function loadProfile(): UserProfile {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PROFILE, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore parse errors
    }
  }
  return DEFAULT_PROFILE;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(loadProfile);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    localStorage.removeItem(STORAGE_KEY);
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
