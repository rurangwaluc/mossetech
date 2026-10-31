import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { eq } from 'drizzle-orm';

import { requirePermission } from '@/lib/auth/require-permission';
import { db } from '@mossetech/db/client';
import {
  businessSettings,
  externalCustomerPayments,
  externalSales,
} from '@mossetech/db/schema';

import {
  calculateExternalSaleBalances,
  parseMoney,
} from '@/lib/external-sales/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: '#172B42',
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 38,
    paddingBottom: 45,
    paddingHorizontal: 42,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 20,
    marginBottom: 22,
    borderBottom: '2 solid #006DBB',
  },
  logo: {
    width: 155,
    height: 52,
    objectFit: 'contain',
  },
  brand: {
    color: '#006DBB',
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },
  businessDetails: {
    color: '#627488',
    fontSize: 8,
    lineHeight: 1.5,
    marginTop: 5,
  },
  documentTitle: {
    color: '#172B42',
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  documentMeta: {
    color: '#627488',
    fontSize: 8.5,
    textAlign: 'right',
    marginTop: 6,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  detailsLabel: {
    color: '#627488',
    fontSize: 7.5,
    marginBottom: 6,
  },
  customerName: {
    color: '#172B42',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  customerPhone: {
    color: '#627488',
    fontSize: 9,
  },
  paymentStatus: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textAlign: 'right',
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#EAF1F8',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottom: '1 solid #D6E2ED',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderBottom: '1 solid #E5ECF2',
    alignItems: 'flex-start',
  },
  tableHeadText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#263C52',
  },
  item: {
    width: '43%',
    paddingRight: 8,
  },
  quantity: {
    width: '12%',
    textAlign: 'center',
  },
  price: {
    width: '22%',
    textAlign: 'right',
  },
  amount: {
    width: '23%',
    textAlign: 'right',
  },
  bottomSummary: {
    marginTop: 28,
    marginBottom: 36,
  },
  totals: {
    width: '56%',
    marginLeft: 'auto',
    marginTop: 18,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  totalDivider: {
    borderTop: '1 solid #CBD7E2',
    paddingTop: 12,
    marginTop: 5,
  },
  totalStrong: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  },
  totalAccent: {
    color: '#006DBB',
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  },
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  signatureBox: {
    width: '43%',
    height: 90,
    justifyContent: 'flex-end',
  },
  signatureLine: {
    borderTop: '1 solid #A8B5C2',
    paddingTop: 9,
  },
  signatureLabel: {
    color: '#627488',
    fontSize: 8.5,
  },
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 42,
    right: 42,
    borderTop: '1 solid #DEE6ED',
    paddingTop: 10,
    textAlign: 'center',
    color: '#627488',
    fontSize: 8,
  },
});


function money(value: string | number) {
  return new Intl.NumberFormat('en-RW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function saleDate(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kigali',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

type ReceiptData = {
  reference: string;
  date: Date;
  business: {
    name: string;
    phone: string | null;
    address: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  subtotal: string;
  discount: string;
  total: string;
  paid: string;
  balance: string;
  payments: Array<{
    method: string;
    amount: string;
  }>;
};

function ReceiptPdf({
  data,
  logoSource,
}: {
  data: ReceiptData;
  logoSource: { data: Buffer; format: 'png' } | null;
}) {
  const balance = Number(data.balance);
  const paid = Number(data.paid);

  const status =
    balance <= 0
      ? 'PAID'
      : paid > 0
        ? 'PART PAID'
        : 'UNPAID';

  return (
    <Document
      title={`Mosse Tech Sales Receipt ${data.reference}`}
      author={data.business.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ maxWidth: '52%' }}>
            {logoSource ? (
              <>
                {/* React PDF Image does not support HTML alt. */}
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={logoSource} style={styles.logo} />
              </>
            ) : (
              <Text style={styles.brand}>{data.business.name}</Text>
            )}

            {data.business.address ? (
              <Text style={styles.businessDetails}>
                {data.business.address}
              </Text>
            ) : null}

            {data.business.phone ? (
              <Text style={styles.businessDetails}>
                {data.business.phone}
              </Text>
            ) : null}
          </View>

          <View style={{ maxWidth: '45%' }}>
            <Text style={styles.documentTitle}>SALES RECEIPT</Text>
            <Text style={styles.documentMeta}>
              Sale reference: {data.reference}
            </Text>
            <Text style={styles.documentMeta}>
              {saleDate(data.date)}
            </Text>
          </View>
        </View>

        <View style={styles.details}>
          <View style={{ width: '55%' }}>
            <Text style={styles.detailsLabel}>BILLED TO</Text>
            <Text style={styles.customerName}>
              {data.customer.name}
            </Text>
            {data.customer.phone ? (
              <Text style={styles.customerPhone}>
                {data.customer.phone}
              </Text>
            ) : null}
          </View>

          <View style={{ width: '40%' }}>
            <Text style={{ ...styles.detailsLabel, textAlign: 'right' }}>
              PAYMENT STATUS
            </Text>
            <Text
              style={{
                ...styles.paymentStatus,
                color: balance <= 0 ? '#167047' : '#9A6317',
              }}
            >
              {status}
            </Text>
          </View>
        </View>

        <View style={styles.tableHead} fixed>
          <Text style={{ ...styles.tableHeadText, ...styles.item }}>
            ITEM / DESCRIPTION
          </Text>
          <Text style={{ ...styles.tableHeadText, ...styles.quantity }}>
            QTY
          </Text>
          <Text style={{ ...styles.tableHeadText, ...styles.price }}>
            UNIT PRICE
          </Text>
          <Text style={{ ...styles.tableHeadText, ...styles.amount }}>
            TOTAL
          </Text>
        </View>

        {data.items.map((item) => (
          <View key={item.id} style={styles.tableRow} wrap={false}>
            <Text style={styles.item}>{item.name}</Text>
            <Text style={styles.quantity}>{item.quantity}</Text>
            <Text style={styles.price}>
              {item.unitPrice === 'See line total'
                ? 'See line total'
                : `RWF ${money(item.unitPrice)}`}
            </Text>
            <Text style={styles.amount}>
              RWF {money(item.lineTotal)}
            </Text>
          </View>
        ))}

        <View style={styles.bottomSummary}>
        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>RWF {money(data.subtotal)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text>Discount</Text>
            <Text>
              {Number(data.discount) > 0 ? '- ' : ''}
              RWF {money(data.discount)}
            </Text>
          </View>

          <View style={[styles.totalRow, styles.totalDivider]}>
            <Text style={styles.totalStrong}>Total</Text>
            <Text style={styles.totalStrong}>
              RWF {money(data.total)}
            </Text>
          </View>

          <View style={styles.totalRow}>
            <Text>Amount paid</Text>
            <Text>RWF {money(data.paid)}</Text>
          </View>

          {data.payments.map((payment) => (
            <View key={payment.method} style={styles.totalRow}>
              <Text>{payment.method}</Text>
              <Text>RWF {money(payment.amount)}</Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalStrong}>Balance due</Text>
            <Text style={styles.totalAccent}>
              RWF {money(data.balance)}
            </Text>
          </View>
        </View>

        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>
                Authorized signature
              </Text>
            </View>
          </View>

          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>
                Company stamp (if applicable)
              </Text>
            </View>
          </View>
        </View>

        </View>

        <Text style={styles.footer} fixed>
          Thank you for choosing {data.business.name}.
        </Text>
      </Page>
    </Document>
  );
}


export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requirePermission('sales.view');

  const { id } = await context.params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return new Response('Invalid sale reference.', {
      status: 400,
    });
  }

  const [sale] = await db
    .select()
    .from(externalSales)
    .where(eq(externalSales.id, id))
    .limit(1);

  if (!sale) {
    return new Response('External sale not found.', {
      status: 404,
    });
  }

  if (sale.status !== 'POSTED') {
    return new Response(
      'Documents are available only for completed sales.',
      { status: 409 },
    );
  }

  const [payments, settings] = await Promise.all([
    db
      .select()
      .from(externalCustomerPayments)
      .where(eq(externalCustomerPayments.externalSaleId, id)),
    db.select().from(businessSettings).limit(1),
  ]);

  const totalCents = parseMoney(sale.customerTotal);
  const paymentTotals = new Map<string, number>();

  for (const payment of payments) {
    paymentTotals.set(
      payment.paymentMethod,
      (paymentTotals.get(payment.paymentMethod) ?? 0)
        + parseMoney(payment.amount),
    );
  }

  const paidCents = Array.from(paymentTotals.values())
    .reduce((sum, amount) => sum + amount, 0);

  if (paidCents <= 0) {
    return new Response(
      'A customer payment is required before issuing a receipt.',
      { status: 409 },
    );
  }

  const balances = calculateExternalSaleBalances({
    customerTotalCents: totalCents,
    supplierTotalCents: parseMoney(sale.agreedSupplierTotal),
    customerPaidCents: paidCents,
    supplierPaidCents: 0,
  });

  const paymentNames: Record<string, string> = {
    CASH: 'Cash',
    MOBILE_MONEY: 'Mobile Money',
    BANK: 'Bank',
    CARD: 'Card',
  };

  const paymentBreakdown = Array.from(paymentTotals.entries())
    .filter(([, amount]) => amount > 0)
    .map(([method, amount]) => ({
      method: paymentNames[method] ?? method,
      amount: (amount / 100).toFixed(2),
    }));

  const business = settings[0];
  const reference = sale.id.slice(0, 8).toUpperCase();

  const logoPaths = [
    join(process.cwd(), 'public/brand/mossetech-logo-transparent-v2.png'),
    join(process.cwd(), 'apps/web/public/brand/mossetech-logo-transparent-v2.png'),
  ];

  const logoPath = logoPaths.find((path) => existsSync(path));

  const logoSource = logoPath
    ? { data: readFileSync(logoPath), format: 'png' as const }
    : null;

  const items = [{
    id: sale.id,
    name: sale.productName,
    quantity: sale.quantity,
    unitPrice: (
      totalCents % sale.quantity === 0
        ? (totalCents / sale.quantity / 100).toFixed(2)
        : 'See line total'
    ),
    lineTotal: sale.customerTotal,
  }];

  const pdf = await renderToBuffer(
    <ReceiptPdf
      logoSource={logoSource}
      data={{
        reference,
        date: sale.createdAt,
        business: {
          name: business?.businessName || 'Mosse Tech',
          phone: business?.phone || null,
          address: business?.address || null,
        },
        customer: {
          name: sale.customerName || 'Walk-in customer',
          phone: null,
        },
        items,
        subtotal: sale.customerTotal,
        discount: '0.00',
        total: sale.customerTotal,
        paid: (paidCents / 100).toFixed(2),
        balance: (balances.customerBalanceCents / 100).toFixed(2),
        payments: paymentBreakdown,
      }}
    />,
  );

  const mode =
    new URL(request.url).searchParams.get('mode') === 'inline'
      ? 'inline'
      : 'attachment';

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        `${mode}; filename="mosse-tech-external-receipt-${reference}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
