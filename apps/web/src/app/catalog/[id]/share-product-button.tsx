'use client';

import { useState } from 'react';

type Props = {
  url: string;
  name: string;
};

export function ShareProductButton({ url, name }: Props) {
  const [status, setStatus] = useState('');

  async function share() {
    setStatus('');

    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
        return;
      }

      await navigator.clipboard.writeText(url);
      setStatus('Link copied');
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        return;
      }

      setStatus('Unable to share. Copy the URL from your browser.');
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={share}
        className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--border)] px-6 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]"
      >
        Share product
      </button>

      {status && (
        <p role="status" className="text-xs text-[var(--muted)]">
          {status}
        </p>
      )}
    </div>
  );
}
