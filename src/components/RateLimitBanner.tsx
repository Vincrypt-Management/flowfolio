import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '../services/apiClient';

export const RateLimitBanner: React.FC = () => {
  const [info, setInfo] = useState<{ provider: string; retryAfterSeconds: number } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setInfo(apiClient.getRateLimitInfo());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!info) return null;

  return (
    <div className="rate-limit-banner">
      <AlertTriangle size={16} />
      <span>Data may be delayed — rate limit reached. Refreshing in {info.retryAfterSeconds}s</span>
    </div>
  );
};
