'use client';

import { useMemo, useState } from 'react';

type SoldItem = {
  id: string;
  name: string;
  quantity: number;
};

export default function SoldProductSearch({
  items,
}: {
  items: SoldItem[];
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(false);

  const selected = items.find((item) => item.id === selectedId);

  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();

    return items.filter((item) =>
      item.name.toLowerCase().includes(search)
    );
  }, [items, query]);

  return (
    <div className="relative mt-2">
      <input
        type="hidden"
        name="saleItemId"
        value={selectedId}
      />

      <input
        type="search"
        autoComplete="off"
        value={query}
        required={!selectedId}
        placeholder="Search sold products"
        aria-label="Search sold products"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedId('');
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
      />

      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {matches.length > 0 ? (
            matches.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  setQuery(item.name);
                  setOpen(false);
                }}
                className="block w-full border-b border-[var(--border)] px-3 py-3 text-left text-sm text-[var(--text)] last:border-b-0 hover:bg-[var(--background)]"
              >
                <span className="block font-bold">
                  {item.name}
                </span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  Sold: {item.quantity}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-[var(--muted)]">
              No matching sold products.
            </p>
          )}
        </div>
      )}

      {selected ? (
        <button
          type="button"
          onClick={() => {
            setSelectedId('');
            setQuery('');
            setOpen(false);
          }}
          className="mt-2 text-xs font-bold text-[var(--muted)] underline"
        >
          Clear selection
        </button>
      ) : (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Select a product from this sale.
        </p>
      )}
    </div>
  );
}
