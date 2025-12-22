import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { searchAPI } from '../lib/api';

interface QuotaStatus {
  usage: number;
  limit: number;
  remaining: number;
  percentage: number;
  resetDate: string;
  resetTime: string;
  status: 'healthy' | 'caution' | 'warning' | 'critical';
  canSearch: boolean;
}

interface QuotaWarningBannerProps {
  onDismiss?: () => void;
  className?: string;
}

const QuotaWarningBanner: React.FC<QuotaWarningBannerProps> = ({ onDismiss, className = '' }) => {
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const fetchQuotaStatus = async () => {
      try {
        setIsLoading(true);
        const status = await searchAPI.getQuotaStatus();
        setQuotaStatus(status);
      } catch (error: any) {
        // Silently fail for 401 (not logged in) - quota status is not critical
        // For other errors, log but don't show to user
        if (error?.response?.status !== 401) {
          console.error('Error fetching quota status:', error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotaStatus();
    // Refresh every 2 minutes
    const interval = setInterval(fetchQuotaStatus, 120000);

    return () => clearInterval(interval);
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isLoading || !quotaStatus || isDismissed) {
    return null;
  }

  // Only show banner if status is warning or critical
  if (quotaStatus.status === 'healthy' || quotaStatus.status === 'caution') {
    return null;
  }

  const getStatusColor = () => {
    switch (quotaStatus.status) {
      case 'critical':
        return 'bg-red-600 border-red-500';
      case 'warning':
        return 'bg-yellow-600 border-yellow-500';
      default:
        return 'bg-yellow-600 border-yellow-500';
    }
  };

  const formatResetTime = (resetTime: string) => {
    try {
      const reset = new Date(resetTime);
      const now = new Date();
      const hoursUntilReset = Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60));
      
      if (hoursUntilReset <= 0) {
        return 'soon';
      } else if (hoursUntilReset < 24) {
        return `in ${hoursUntilReset} hour${hoursUntilReset > 1 ? 's' : ''}`;
      } else {
        return reset.toLocaleDateString();
      }
    } catch {
      return 'at midnight UTC';
    }
  };

  return (
    <div className={`${getStatusColor()} text-white p-4 rounded-lg shadow-lg border-l-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold mb-1">
              {quotaStatus.status === 'critical' 
                ? 'Critical: API Credits Nearly Exhausted'
                : 'Warning: API Credits Running Low'}
            </h3>
            <p className="text-sm opacity-90 mb-2">
              We've used {quotaStatus.percentage.toFixed(1)}% of today's API credits ({quotaStatus.usage.toLocaleString()} / {quotaStatus.limit.toLocaleString()}).
              {quotaStatus.remaining > 0 && (
                <span className="ml-1">Only {quotaStatus.remaining.toLocaleString()} credits remaining.</span>
              )}
            </p>
            <div className="bg-black/20 rounded p-2 mb-2">
              <p className="text-xs font-medium mb-1">💡 Tip: Save API Credits!</p>
              <p className="text-xs opacity-90">
                Instead of searching, <strong>paste a YouTube URL directly</strong>. URL pasting uses 100x fewer API credits!
                Quota resets {formatResetTime(quotaStatus.resetTime)}.
              </p>
            </div>
            <div className="w-full bg-black/20 rounded-full h-2 mb-1">
              <div 
                className={`h-2 rounded-full ${
                  quotaStatus.status === 'critical' ? 'bg-red-300' : 'bg-yellow-300'
                }`}
                style={{ width: `${Math.min(100, quotaStatus.percentage)}%` }}
              />
            </div>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="ml-4 text-white/80 hover:text-white transition-colors"
            aria-label="Dismiss warning"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default QuotaWarningBanner;
