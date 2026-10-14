import Image from 'next/image';
import Link from 'next/link';
import { PublicThemeToggle } from './public-theme-toggle';
import styles from './page.module.css';

const workspaceItems = [
  {
    number: '01',
    name: 'Sales',
    description: 'Daily sales and payments',
  },
  {
    number: '02',
    name: 'Products',
    description: 'Product catalogue',
  },
  {
    number: '03',
    name: 'Stock',
    description: 'Received, sold and remaining stock',
  },
  {
    number: '04',
    name: 'Customers',
    description: 'Customer records and balances',
  },
  {
    number: '05',
    name: 'Expenses',
    description: 'Business expense records',
  },
  {
    number: '06',
    name: 'Money & reports',
    description: 'Cash position and reporting',
  },
] as const;

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Bloom Kigali home"
        >
          <Image
            src="/brand/bloom-logo-horizontal.png"
            alt="Bloom Kigali"
            width={210}
            height={72}
            className={styles.brandLogo}
            priority
          />
        </Link>

        <div className={styles.headerActions}>
          <PublicThemeToggle />

          <Link
            href="/login"
            className={styles.headerSignIn}
          >
            Sign in
          </Link>
        </div>
      </header>

      <section
        className={styles.hero}
        aria-labelledby="landing-heading"
      >
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            Private business system
          </p>

          <h1 id="landing-heading">
            <span>One clear place to</span>
            <span>run Bloom Kigali.</span>
          </h1>

          <p className={styles.intro}>
            Manage sales, products, stock, customers,
            expenses and money records from one focused
            workspace built for daily operations.
          </p>

          <div className={styles.actions}>
            <Link
              href="/login"
              className={styles.primaryAction}
            >
              Sign in
            </Link>
          </div>

          <p className={styles.access}>
            Authorized owner and staff access only
          </p>
        </div>

        <aside
          className={styles.workspace}
          aria-label="Bloom Kigali daily operations"
        >
          <div className={styles.workspaceHeader}>
            <p className={styles.workspaceLabel}>
              Workspace
            </p>

            <h2>Daily operations</h2>
          </div>

          <div className={styles.workspaceList}>
            {workspaceItems.map((item) => (
              <div
                key={item.number}
                className={styles.workspaceRow}
              >
                <span className={styles.rowNumber}>
                  {item.number}
                </span>

                <span className={styles.rowName}>
                  {item.name}
                </span>

                <span className={styles.rowDescription}>
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <footer className={styles.footer}>
        <span>© {year} Bloom Kigali</span>

        <span>
          Developed by{' '}
          <a
            href="https://webimpactlab.com"
            target="_blank"
            rel="noreferrer"
          >
            WebImpact Lab
          </a>
        </span>
      </footer>
    </main>
  );
}
