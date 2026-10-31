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
  externalSales,
} from '@mossetech/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: '#172B42',
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 38,
    paddingBottom: 55,
    paddingHorizontal: 42,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 20,
    marginBottom: 25,
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
  title: {
    color: '#172B42',
    fontSize: 19,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  metadata: {
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
  label: {
    color: '#627488',
    fontSize: 8,
    marginBottom: 6,
  },
  customer: {
    color: '#172B42',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  description: {
    color: '#627488',
    fontSize: 9,
    lineHeight: 1.5,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#EAF1F8',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottom: '1 solid #D6E2ED',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottom: '1 solid #E5ECF2',
  },
  headText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#263C52',
  },
  item: {
    width: '75%',
    paddingRight: 12,
  },
  quantity: {
    width: '25%',
    textAlign: 'right',
  },
  notes: {
    marginTop: 28,
    paddingTop: 15,
    borderTop: '1 solid #DEE6ED',
  },
  signatureSection: {
    marginTop: 65,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBox: {
    width: '43%',
  },
  signatureLine: {
    borderTop: '1 solid #A8B5C2',
    paddingTop: 10,
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
    color: '#627488',
    fontSize: 8,
    textAlign: 'center',
  },
});

type DeliveryNoteData = {
  reference: string;
  date: Date;
  business: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kigali',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function DeliveryNotePdf({
  data,
  logoSource,
}: {
  data: DeliveryNoteData;
  logoSource: { data: Buffer; format: 'png' } | null;
}) {
  return (
    <Document
      title={`Mosse Tech Delivery Note ${data.reference}`}
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
            <Text style={styles.title}>DELIVERY NOTE</Text>
            <Text style={styles.metadata}>
              Reference: DN-{data.reference}
            </Text>
            <Text style={styles.metadata}>
              Sale: {data.reference}
            </Text>
            <Text style={styles.metadata}>
              Sale date: {formatDate(data.date)}
            </Text>
          </View>
        </View>

        <View style={styles.details}>
          <View style={{ width: '60%' }}>
            <Text style={styles.label}>DELIVER TO</Text>
            <Text style={styles.customer}>
              {data.customer.name}
            </Text>
            {data.customer.phone ? (
              <Text style={styles.description}>
                {data.customer.phone}
              </Text>
            ) : null}
          </View>

          <View style={{ width: '35%' }}>
            <Text style={styles.label}>DOCUMENT PURPOSE</Text>
            <Text style={styles.description}>
              Items listed for customer handover.
              Receipt of goods must be confirmed by signature.
            </Text>
          </View>
        </View>

        <View style={styles.tableHead} fixed>
          <Text style={{ ...styles.headText, ...styles.item }}>
            ITEM / DESCRIPTION
          </Text>
          <Text style={{ ...styles.headText, ...styles.quantity }}>
            QUANTITY
          </Text>
        </View>

        {data.items.map((item) => (
          <View key={item.id} style={styles.tableRow} wrap={false}>
            <Text style={styles.item}>{item.name}</Text>
            <Text style={styles.quantity}>{item.quantity}</Text>
          </View>
        ))}

        <View style={styles.notes} wrap={false}>
          <Text style={styles.label}>DELIVERY REMARKS</Text>
          <Text style={styles.description}>
            _______________________________________________________
          </Text>
          <Text style={styles.description}>
            _______________________________________________________
          </Text>
        </View>

        <View style={styles.signatureSection} wrap={false}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>
                Handed over by / signature / date
              </Text>
            </View>
          </View>

          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>
                Received by / signature / date
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {data.business.name} / Delivery documentation
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
    return new Response('Invalid sale reference.', { status: 400 });
  }

  const [sale] = await db
    .select()
    .from(externalSales)
    .where(eq(externalSales.id, id))
    .limit(1);

  if (!sale) {
    return new Response('External sale not found.', { status: 404 });
  }

  if (sale.status !== 'POSTED') {
    return new Response(
      'Documents are available only for completed sales.',
      { status: 409 },
    );
  }

  const [business] = await db
    .select()
    .from(businessSettings)
    .limit(1);

  const reference = sale.id.slice(0, 8).toUpperCase();

  const logoPaths = [
    join(process.cwd(), 'public/brand/mossetech-logo-transparent-v2.png'),
    join(process.cwd(), 'apps/web/public/brand/mossetech-logo-transparent-v2.png'),
  ];

  const logoPath = logoPaths.find((path) => existsSync(path));

  const logoSource = logoPath
    ? { data: readFileSync(logoPath), format: 'png' as const }
    : null;

  const pdf = await renderToBuffer(
    <DeliveryNotePdf
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
        items: [{
          id: sale.id,
          name: sale.productName,
          quantity: sale.quantity,
        }],
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
        `${mode}; filename="mosse-tech-external-delivery-note-${reference}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
