import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';
import type { ExternalToast } from 'sonner';

/** react-toastify-compatible options used at existing call sites. */
export type ToastOptions = {
  autoClose?: number | false;
  pauseOnHover?: boolean;
  toastId?: string | number;
  onClick?: () => void;
  style?: CSSProperties;
};

const DEFAULT_DURATION = {
  success: 2800,
  info: 3200,
  warning: 4000,
  error: 4500,
} as const;

function mapOptions(
  options: ToastOptions | undefined,
  fallbackDuration: number | undefined,
): ExternalToast {
  const mapped: ExternalToast = {};

  if (options?.autoClose === false) {
    mapped.duration = Number.POSITIVE_INFINITY;
  } else if (typeof options?.autoClose === 'number') {
    mapped.duration = options.autoClose;
  } else if (fallbackDuration !== undefined) {
    mapped.duration = fallbackDuration;
  }

  if (options?.toastId !== undefined) {
    mapped.id = options.toastId;
  }

  if (options?.style) {
    mapped.style = options.style;
  }

  if (options?.onClick) {
    const handleClick = options.onClick;
    mapped.action = {
      label: 'Log in',
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        handleClick();
      },
    };
  }

  return mapped;
}

function show(
  kind: 'success' | 'info' | 'warning' | 'error' | 'loading',
  message: ReactNode,
  options?: ToastOptions,
  fallbackDuration?: number,
): string | number {
  return sonnerToast[kind](message, mapOptions(options, fallbackDuration));
}

export const toast = {
  success: (message: ReactNode, options?: ToastOptions) =>
    show('success', message, options, DEFAULT_DURATION.success),
  error: (message: ReactNode, options?: ToastOptions) =>
    show('error', message, options, DEFAULT_DURATION.error),
  info: (message: ReactNode, options?: ToastOptions) =>
    show('info', message, options, DEFAULT_DURATION.info),
  warning: (message: ReactNode, options?: ToastOptions) =>
    show('warning', message, options, DEFAULT_DURATION.warning),
  warn: (message: ReactNode, options?: ToastOptions) =>
    show('warning', message, options, DEFAULT_DURATION.warning),
  loading: (message: ReactNode, options?: ToastOptions) =>
    show('loading', message, options),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};
