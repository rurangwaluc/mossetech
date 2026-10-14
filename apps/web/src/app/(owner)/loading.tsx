export default function OwnerLoading() {
  return (
    <section className="space-y-4">
      <div className="border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
        <div className="h-5 w-44 animate-pulse bg-[var(--surface)]" />
        <div className="mt-3 h-4 w-full max-w-xl animate-pulse bg-[var(--surface)]" />
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="h-28 animate-pulse border border-[var(--border)] bg-[var(--card)]" />
        <div className="h-28 animate-pulse border border-[var(--border)] bg-[var(--card)]" />
        <div className="h-28 animate-pulse border border-[var(--border)] bg-[var(--card)]" />
        <div className="h-28 animate-pulse border border-[var(--border)] bg-[var(--card)]" />
      </section>

      <div className="h-64 animate-pulse border border-[var(--border)] bg-[var(--card)]" />
    </section>
  );
}
