'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  label: string;
  pendingLabel?: string;
  className?: string;
};

export function CashDrawerSubmit({
  label,
  pendingLabel = 'Saving...',
  className = '',
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
