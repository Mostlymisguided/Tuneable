import React from 'react';
import { Heart, Loader2 } from 'lucide-react';

export interface TipCtaLabelProps {
  /** Tip amount in pounds (number or numeric string). */
  amount?: number | string | null;
  /** When false, shows sign-in copy instead of amount. */
  signedIn?: boolean;
  loading?: boolean;
  /** Fallback when amount is missing/invalid while signed in. */
  fallback?: string;
  heartClassName?: string;
  amountClassName?: string;
}

/** Heart + £amount label for tip CTAs (or sign-in / loading states). */
const TipCtaLabel: React.FC<TipCtaLabelProps> = ({
  amount,
  signedIn = true,
  loading = false,
  fallback = 'Tip',
  heartClassName = 'h-4 w-4',
  amountClassName,
}) => {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2">
        <Loader2 className={`${heartClassName} animate-spin`} />
        <span>Placing...</span>
      </span>
    );
  }

  if (!signedIn) {
    return <span>Sign in to Tip</span>;
  }

  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(parsed) || (parsed as number) < 0) {
    return <span>{fallback}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Heart className={heartClassName} />
      <span className={amountClassName}>£{(parsed as number).toFixed(2)}</span>
    </span>
  );
};

export default TipCtaLabel;
