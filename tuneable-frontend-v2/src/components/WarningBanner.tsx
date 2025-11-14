import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Info, AlertCircle, Ban } from 'lucide-react';
import { userAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Warning {
  type: 'info' | 'warning' | 'final_warning' | 'suspension_notice';
  message: string;
  reason?: string;
  issuedBy?: {
    username: string;
    _id: string;
  };
  issuedAt: string;
  acknowledgedAt?: string;
  expiresAt?: string;
}

const WarningBanner: React.FC = () => {
  const { user } = useAuth();
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchWarnings = async () => {
      try {
        const data = await userAPI.getWarnings();
        // Filter to only unacknowledged warnings
        const unacknowledged = data.warnings.filter((w: Warning) => !w.acknowledgedAt);
        setWarnings(unacknowledged);
      } catch (error) {
        console.error('Error fetching warnings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWarnings();
  }, [user]);

  const handleAcknowledge = async (index: number) => {
    try {
      await userAPI.acknowledgeWarning(index);
      // Remove from local state
      setWarnings(prev => prev.filter((_, i) => i !== index));
      setDismissedWarnings(prev => new Set([...prev, index]));
    } catch (error) {
      console.error('Error acknowledging warning:', error);
    }
  };

  const handleDismiss = (index: number) => {
    setDismissedWarnings(prev => new Set([...prev, index]));
  };

  if (isLoading || !user || warnings.length === 0) {
    return null;
  }

  // Filter out dismissed warnings
  const visibleWarnings = warnings.filter((_, index) => !dismissedWarnings.has(index));

  if (visibleWarnings.length === 0) {
    return null;
  }

  // Get the most severe warning (prioritize suspension > final_warning > warning > info)
  const getSeverity = (type: string) => {
    switch (type) {
      case 'suspension_notice': return 4;
      case 'final_warning': return 3;
      case 'warning': return 2;
      case 'info': return 1;
      default: return 0;
    }
  };

  const topWarning = visibleWarnings.reduce((prev, current) => {
    return getSeverity(current.type) > getSeverity(prev.type) ? current : prev;
  }, visibleWarnings[0]);

  const getWarningConfig = (type: string) => {
    switch (type) {
      case 'info':
        return {
          icon: Info,
          bgColor: 'bg-blue-900/30',
          borderColor: 'border-blue-500',
          textColor: 'text-blue-300',
          iconColor: 'text-blue-400'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          bgColor: 'bg-yellow-900/30',
          borderColor: 'border-yellow-500',
          textColor: 'text-yellow-300',
          iconColor: 'text-yellow-400'
        };
      case 'final_warning':
        return {
          icon: AlertCircle,
          bgColor: 'bg-red-900/30',
          borderColor: 'border-red-500',
          textColor: 'text-red-300',
          iconColor: 'text-red-400'
        };
      case 'suspension_notice':
        return {
          icon: Ban,
          bgColor: 'bg-red-900/40',
          borderColor: 'border-red-600',
          textColor: 'text-red-200',
          iconColor: 'text-red-400'
        };
      default:
        return {
          icon: Info,
          bgColor: 'bg-gray-900/30',
          borderColor: 'border-gray-500',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
    }
  };

  const config = getWarningConfig(topWarning.type);
  const Icon = config.icon;

  return (
    <div className="fixed top-16 left-0 right-0 z-[9998] px-4 py-2" style={{ zIndex: 9998 }}>
      <div className={`max-w-7xl mx-auto ${config.bgColor} border-2 ${config.borderColor} rounded-lg shadow-lg p-4`}>
        <div className="flex items-start space-x-3">
          <Icon className={`h-5 w-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-semibold ${config.textColor} mb-1`}>
                {topWarning.type === 'info' && 'Information'}
                {topWarning.type === 'warning' && 'Warning'}
                {topWarning.type === 'final_warning' && 'Final Warning'}
                {topWarning.type === 'suspension_notice' && 'Account Suspension'}
              </h3>
              <button
                onClick={() => {
                  const index = warnings.findIndex(w => w === topWarning);
                  if (index !== -1) {
                    handleDismiss(index);
                  }
                }}
                className={`${config.textColor} hover:opacity-70 transition-opacity flex-shrink-0 ml-2`}
                aria-label="Dismiss warning"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className={`text-sm ${config.textColor} mb-2`}>
              {topWarning.message}
            </p>
            {topWarning.reason && (
              <p className={`text-xs ${config.textColor} opacity-80 mb-2`}>
                <strong>Reason:</strong> {topWarning.reason}
              </p>
            )}
            {visibleWarnings.length > 1 && (
              <p className={`text-xs ${config.textColor} opacity-70 mb-2`}>
                You have {visibleWarnings.length} active warning{visibleWarnings.length > 1 ? 's' : ''}
              </p>
            )}
            <button
              onClick={() => {
                const index = warnings.findIndex(w => w === topWarning);
                if (index !== -1) {
                  handleAcknowledge(index);
                }
              }}
              className={`text-xs ${config.textColor} underline hover:opacity-70 transition-opacity`}
            >
              I understand
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarningBanner;

