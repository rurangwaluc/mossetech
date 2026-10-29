'use client';

import { RotateCcw } from 'lucide-react';
import { restoreProductAction } from '@/lib/products/actions';

type Props = {
  itemId: string;
  itemName: string;
};

export function RestoreItemButton({ itemId, itemName }: Props) {
  return (
    <form
      action={restoreProductAction}
      onSubmit={(event) => {
        if (!window.confirm(
          `Restore "${itemName}" to active products? Confirm its stock before selling.`
        )) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="productId" value={itemId} />
      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restore
      </button>
    </form>
  );
}
