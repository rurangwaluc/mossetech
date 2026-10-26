'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createQuotationAction } from '@/lib/quotations/actions';
type Product = { id: string; name: string; sellingPrice: string; minimumSellingPrice: string | null };
type Customer = { id: string; name: string; phone: string | null };
type Line = { productId: string; quantity: number; unitPrice: string };
const field = 'min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)]';
type SearchOption = { id: string; label: string; detail?: string };
function SearchPicker({ label, placeholder, value, options, onSelect, required = false, emptyLabel }: {
  label: string;
  placeholder: string;
  value: string;
  options: SearchOption[];
  onSelect: (id: string) => void;
  required?: boolean;
  emptyLabel?: string;
}) {
  const selected = options.find(option => option.id === value);
  const [search, setSearch] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = search ?? (selected?.label || '');
  const normalized = query.trim().toLocaleLowerCase();
  const matches = options.filter(option =>
    !normalized || `${option.label} ${option.detail || ''}`.toLocaleLowerCase().includes(normalized)
  ).slice(0, 8);
  const choose = (id: string) => {
    onSelect(id);
    setSearch(null);
    setOpen(false);
    setActive(0);
  };
  return <div className="relative min-w-0">
    <label className="block text-sm font-bold text-[var(--text)]">{label}
      <input
        type="search" autoComplete="off" required={required}
        placeholder={placeholder} className={`${field} mt-1`}

        value={query}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onChange={event => { setSearch(event.target.value); onSelect(''); setOpen(true); setActive(0); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { setOpen(false); return; }
          if (event.key === 'ArrowDown' && open && matches.length > 0) { event.preventDefault(); setActive(index => Math.min(index + 1, matches.length - 1)); }
          if (event.key === 'ArrowUp' && open) { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
          if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); choose(matches[active].id); }
        }}
      />
    </label>
    {open && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl">
      {!required && <button type="button" className="block min-h-10 w-full rounded-md px-3 text-left text-sm text-[var(--text)] hover:bg-[var(--surface)]" onMouseDown={e => e.preventDefault()} onClick={() => choose('')}>{emptyLabel || 'Clear selection'}</button>}
      {matches.map((option, index) => <button key={option.id} type="button"
        className={`block min-h-10 w-full rounded-md px-3 py-2 text-left text-sm text-[var(--text)] ${index === active ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]'}`}
        onMouseDown={e => e.preventDefault()} onClick={() => choose(option.id)}>
        <span className="block font-bold">{option.label}</span>
        {option.detail && <span className="block text-xs text-[var(--muted)]">{option.detail}</span>}
      </button>)}
      {matches.length === 0 && <p className="px-3 py-3 text-sm text-[var(--muted)]">No matches found</p>}
    </div>}
  </div>;
}

export function QuotationForm({ products, customers }: { products: Product[]; customers: Customer[] }) {
  const [state, action, pending] = useActionState(createQuotationAction, {});
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1, unitPrice: '' }]);
  const [discount, setDiscount] = useState('0');
  const chosen = customers.find(c => c.id === customerId);
  const subtotal = lines.reduce((n, l) => n + (Number(l.unitPrice) || 0) * l.quantity, 0);
  const validLines = lines.filter(l => l.productId && l.quantity > 0 && Number(l.unitPrice) > 0);
  const update = (index: number, patch: Partial<Line>) => setLines(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <form action={action} className="space-y-5">
    <input type="hidden" name="customerId" value={customerId} />
    <input type="hidden" name="itemsJson" value={JSON.stringify(validLines)} />
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6 space-y-4">
      <h2 className="text-lg font-black text-[var(--text)]">Customer</h2>
      <SearchPicker label="Existing customer (optional)" placeholder="Search by customer name or phone" value={customerId} options={customers.map(c => ({ id: c.id, label: c.name, detail: c.phone || '' }))} onSelect={setCustomerId} emptyLabel="Enter customer manually" />
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold text-[var(--text)]">Customer name<input required maxLength={160} className={`${field} mt-1`} name="customerName" key={customerId + '-name'} defaultValue={chosen?.name || ''} readOnly={!!chosen} /></label><label className="block text-sm font-bold text-[var(--text)]">Phone (optional)<input maxLength={40} className={`${field} mt-1`} name="customerPhone" key={customerId + '-phone'} defaultValue={chosen?.phone || ''} readOnly={!!chosen} /></label></div>
    </section>
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6 space-y-4"><h2 className="text-lg font-black text-[var(--text)]">Products and prices</h2>
      {lines.map((line, i) => <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[minmax(0,1fr)_100px_150px_auto] sm:items-end">
        <div className="col-span-2 min-w-0 sm:col-span-1"><SearchPicker label="Product" placeholder="Search products by name" value={line.productId} options={products.map(p => ({ id: p.id, label: p.name }))} onSelect={id => { const p = products.find(p => p.id === id); update(i, { productId: id, unitPrice: p?.sellingPrice || '' }); }} required /></div>
        <label className="text-sm font-bold text-[var(--text)]">Qty<input className={`${field} mt-1`} type="number" min="1" max="100000" step="1" required value={line.quantity} onChange={e => update(i, { quantity: Number(e.target.value) })}/></label>
        <label className="text-sm font-bold text-[var(--text)]">Price (RWF)<input className={`${field} mt-1`} type="number" min="0.01" step="0.01" required value={line.unitPrice} onChange={e => update(i, { unitPrice: e.target.value })}/></label>
        <button type="button" className="col-span-2 sm:col-span-1 min-h-11 rounded-lg border border-[var(--border)] px-3 font-bold text-[var(--text)]" onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [{productId:'', quantity:1, unitPrice:''}])}>Remove</button>
      </div>)}
      <button type="button" onClick={() => setLines(ls => [...ls, { productId: '', quantity: 1, unitPrice: '' }])} className="min-h-11 rounded-lg border border-[var(--primary)] px-4 font-bold text-[var(--primary)]">+ Add product</button>
    </section>
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6 space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-[var(--text)]">Valid until (optional)<input name="validUntil" type="date" className={`${field} mt-1`} /></label><label className="text-sm font-bold text-[var(--text)]">Discount (RWF)<input name="discount" type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className={`${field} mt-1`} /></label></div>
      <label className="block text-sm font-bold text-[var(--text)]">Notes (optional)<textarea name="notes" maxLength={1000} rows={3} className={`${field} mt-1 py-3`} /></label>
      <div className="border-t border-[var(--border)] pt-4 text-sm text-[var(--text)]"><p>Subtotal: <strong>RWF {subtotal.toLocaleString('en-RW', {maximumFractionDigits:2})}</strong></p><p className="mt-2 text-lg font-black">Total: RWF {Math.max(0, subtotal - (Number(discount) || 0)).toLocaleString('en-RW', {maximumFractionDigits:2})}</p></div>
      {state.error && <p role="alert" className="text-sm font-bold text-red-600">{state.error}</p>}
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={pending || validLines.length !== lines.length || validLines.length === 0} className="min-h-11 rounded-lg bg-[var(--primary-action)] px-5 font-black text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save proforma'}</button><Link href="/quotations" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 font-bold text-[var(--text)]">Cancel</Link></div>
    </section>
  </form>;
}
