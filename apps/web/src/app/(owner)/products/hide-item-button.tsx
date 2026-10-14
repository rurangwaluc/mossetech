'use client';

import { Archive } from 'lucide-react';
import { archiveProductAction } from '@/lib/products/actions';

type HideItemButtonProps = {
  itemId: string;
  itemName: string;
};

export function HideItemButton({ itemId, itemName }: HideItemButtonProps) {
  return (
    <form
      action={archiveProductAction}
      onSubmit={(event) => {
        const shouldHide = window.confirm(`Hide "${itemName}" from the list?`);

        if (!shouldHide) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="productId" value={itemId} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-3 text-xs font-black text-[var(--muted)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
      >
        <Archive className="h-3.5 w-3.5" />
        Hide
      </button>
    </form>
  );
}
