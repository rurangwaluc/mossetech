import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db } from '@mossetech/db/client';
import { quotations } from '@mossetech/db/schema';
import { requirePermission } from '@/lib/auth/require-permission';
export default async function QuotationsPage() {
  await requirePermission('sales.view');
  const records = await db.select().from(quotations).orderBy(desc(quotations.issueDate)).limit(100);
  return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl font-black text-[var(--text)]">Proforma invoices</h1><p className="text-sm text-[var(--muted)]">Quotations are not recorded sales.</p></div><Link href="/quotations/new" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--primary-action)] px-4 font-black text-white">New proforma</Link></div><div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">{records.length === 0 ? <p className="p-6 text-sm text-[var(--muted)]">No proforma invoices yet.</p> : records.map(q => <Link key={q.id} href={`/quotations/${q.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-[var(--surface)] sm:px-6"><div className="min-w-0"><p className="text-sm font-black text-[var(--text)]">{q.customerName}</p><p className="text-xs text-[var(--muted)]">{q.reference.slice(0,12)} · {new Intl.DateTimeFormat('en-GB', {timeZone:'Africa/Kigali', dateStyle:'medium'}).format(q.issueDate)} · {q.status}</p></div><p className="text-sm font-black text-[var(--text)]">RWF {Number(q.totalAmount).toLocaleString('en-RW', {maximumFractionDigits:2})}</p></Link>)}</div></section>;
}
