import { Sparkles } from 'lucide-react';

/** TuneBytes amount with the sparkles mark used on profiles and collective cards. */
export function TuneBytesMark({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 font-semibold tabular-nums text-purple-200 ${className}`}
      title="TuneBytes"
      aria-label={`${label} TuneBytes`}
    >
      <Sparkles className="h-3 w-3 text-purple-400" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
