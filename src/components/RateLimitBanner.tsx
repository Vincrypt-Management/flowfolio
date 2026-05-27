import React, { useState, useEffect } from 'react';
import { Alert } from '@flowfolio/ui';
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
    <Alert
      variant="warning"
      className="rate-limit-banner"
      description={`Data may be delayed — rate limit reached. Refreshing in ${info.retryAfterSeconds}s`}
    />
  );
};
