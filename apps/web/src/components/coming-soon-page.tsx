type ComingSoonPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  nextStep: string;
};

export function ComingSoonPage({ title, description, nextStep }: ComingSoonPageProps) {
  return (
    <section className="border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm  sm:p-6">
      <div className="max-w-2xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)] dark:text-[var(--primary)]">
          Coming next
        </p>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--text)]">
          {title}
        </h2>
        <p className="mt-3 text-sm font-medium leading-7 text-[var(--muted)]">
          {description}
        </p>

        <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-4 ">
          <p className="text-sm font-black text-[var(--text)]">
            Next work
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted)]">
            {nextStep}
          </p>
        </div>
      </div>
    </section>
  );
}
