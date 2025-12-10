import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BetaWarningBannerProps {
  variant?: 'full' | 'compact' | 'inline';
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const BetaWarningBanner: React.FC<BetaWarningBannerProps> = ({ 
  variant = 'full', 
  dismissible = false,
  onDismiss,
  className = ''
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  if (isDismissed) {
    return null;
  }

  // Check if beta mode is enabled (via environment variable)
  const isBetaMode = import.meta.env.VITE_BETA_MODE === 'true' || import.meta.env.VITE_BETA_MODE === true;

  if (!isBetaMode) {
    return null;
  }

  const baseClasses = "bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg p-4 text-yellow-100";

  if (variant === 'compact') {
    return (
      <div className={`${baseClasses} ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium">Beta Testing Mode</span>
          </div>
          {dismissible && (
            <button
              onClick={handleDismiss}
              className="text-yellow-300 hover:text-yellow-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={`${baseClasses} ${className}`}>
        <div className="flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-center font-semibold text-yellow-200 mb-1">
              🚧 Tuneable is in Beta 🚧
            </p>
            <p className="text-xs text-center text-yellow-100/90 leading-relaxed"> 
              Please report any features not working
            </p>
          </div>  
          {dismissible && (
            <button
              onClick={handleDismiss}
              className="text-yellow-300 hover:text-yellow-100 transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Full variant (default)
  return (
    <div className={`${baseClasses} ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertTriangle className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-lg font-bold text-yellow-200 mb-2">
            🚧 Tuneable is in Beta Testing 🚧
          </h3>
            <div className="flex items-center space-x-4 mt-3">
              <Link 
                to="/about" 
                className="text-yellow-300 hover:text-yellow-100 underline inline-flex items-center"
              >
                Learn More
              </Link>
            </div>
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="text-yellow-300 hover:text-yellow-100 transition-colors flex-shrink-0"
          >
            <X className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default BetaWarningBanner;

