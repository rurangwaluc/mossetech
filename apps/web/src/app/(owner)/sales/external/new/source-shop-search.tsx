'use client';

import { useId, useMemo, useRef, useState } from 'react';

type Shop = {
  id: string;
  name: string;
};

type Props = {
  shops: Shop[];
  value: string;
  onChange: (id: string) => void;
};

export default function SourceShopSearch({
  shops,
  value,
  onChange,
}: Props) {
  const inputId = useId();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = shops.find((shop) => shop.id === value);

  const text = selected ? selected.name : query;

  const matches = useMemo(() => {
    const search = text.trim().toLocaleLowerCase();

    return shops
      .filter((shop) =>
        shop.name.toLocaleLowerCase().includes(search),
      )
      .slice(0, 8);
  }, [shops, text]);

  function choose(shop: Shop) {
    onChange(shop.id);
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(true);
    setActiveIndex(0);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (
          !rootRef.current?.contains(
            event.relatedTarget as Node | null,
          )
        ) {
          setOpen(false);
        }
      }}
    >
      <label
        htmlFor={inputId}
        className="block text-sm font-semibold text-[var(--text)]"
      >
        Source shop
      </label>

      <input type="hidden" name="supplierId" value={value} />

      <div className="relative mt-2">
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && matches.length
              ? `${listId}-${Math.min(activeIndex, matches.length - 1)}`
              : undefined
          }
          placeholder="Search source shop..."
          value={text}
          required={!value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange('');
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                Math.min(current + 1, matches.length - 1),
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) =>
                Math.max(current - 1, 0),
              );
            } else if (
              event.key === 'Enter' &&
              open &&
              matches.length > 0
            ) {
              event.preventDefault();
              choose(matches[Math.min(activeIndex, matches.length - 1)]);
            }
          }}
          className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 pr-16 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
        />

        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear source shop"
            className="absolute inset-y-0 right-3 text-xs font-bold text-[var(--primary)]"
          >
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Matching source shops"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm"
        >
          {matches.length ? (
            matches.map((shop, index) => (
              <button
                id={`${listId}-${index}`}
                key={shop.id}
                type="button"
                role="option"
                aria-selected={shop.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(shop)}
                className={`block w-full border-b border-[var(--border)] px-3 py-3 text-left text-sm last:border-b-0 ${
                  index === activeIndex
                    ? 'bg-[var(--surface)]'
                    : 'bg-[var(--card)]'
                } text-[var(--text)] hover:bg-[var(--surface)]`}
              >
                {shop.name}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-[var(--muted)]">
              No matching source shop. Use + Add new shop.
            </p>
          )}
        </div>
      ) : null}

      {!value ? (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Search and select an existing source shop.
        </p>
      ) : null}
    </div>
  );
}
