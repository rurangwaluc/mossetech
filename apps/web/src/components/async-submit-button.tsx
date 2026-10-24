'use client';

import { useFormStatus } from 'react-dom';
import { LoaderCircle } from 'lucide-react';

type AsyncSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
};

export default function AsyncSubmitButton({
  idleLabel,
  pendingLabel,
  className = '',
  disabled = false,
}: AsyncSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={
        'inline-flex min-h-11 items-center justify-center gap-2 ' +
        'rounded-lg bg-[var(--primary-action)] px-6 py-3 ' +
        'text-sm font-black text-white transition ' +
        'hover:bg-[var(--primary-action-hover)] ' +
        'disabled:cursor-wait disabled:opacity-65 ' +
        className
      }
    >
      {pending ? (
        <>
          <LoaderCircle
            aria-hidden="true"
            className="h-4 w-4 animate-spin"
          />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <span>{idleLabel}</span>
      )}
    </button>
  );
}
