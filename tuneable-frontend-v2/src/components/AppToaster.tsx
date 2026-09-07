import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';

/** Glass toasts, stacked above the persistent player. */
export default function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-center"
      duration={3000}
      visibleToasts={3}
      gap={8}
      offset={{ bottom: '10.75rem' }}
      mobileOffset={{ bottom: '10.75rem' }}
      toastOptions={{
        style: {
          background: 'rgba(31, 41, 55, 0.92)',
          border: '1px solid rgba(75, 85, 99, 0.55)',
          color: '#e5e7eb',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        },
        classNames: {
          toast: 'tuneable-toast',
          title: 'tuneable-toast-title',
          actionButton: 'tuneable-toast-action',
        },
      }}
      icons={{
        success: <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />,
        error: <AlertTriangle className="h-4 w-4 text-red-400" strokeWidth={2.5} />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-400" strokeWidth={2.5} />,
        info: <Info className="h-4 w-4 text-purple-300" strokeWidth={2.5} />,
        loading: <Loader2 className="h-4 w-4 animate-spin text-purple-300" />,
      }}
    />
  );
}
