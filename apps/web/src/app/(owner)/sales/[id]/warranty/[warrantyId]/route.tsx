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
import { and, eq } from 'drizzle-orm';

import { requirePermission } from '@/lib/auth/require-permission';
import { db } from '@mossetech/db/client';
import { businessSettings, warranties } from '@mossetech/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: '#172B42',
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 38,
    paddingBottom: 165,
    paddingHorizontal: 42,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '2 solid #006DBB',
    paddingBottom: 18,
    marginBottom: 23,
  },
  logo: {
    width: 155,
    height: 52,
    objectFit: 'contain',
  },
  business: {
    color: '#627488',
    fontSize: 8,
    marginTop: 5,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  meta: {
    fontSize: 8,
    color: '#627488',
    textAlign: 'right',
    marginTop: 6,
  },
  section: {
    marginBottom: 18,
  },
  label: {
    color: '#627488',
    fontSize: 8,
    marginBottom: 5,
  },
  value: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    lineHeight: 1.5,
  },
  text: {
    fontSize: 9,
    lineHeight: 1.6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  panel: {
    backgroundColor: '#EAF1F8',
    padding: 14,
    marginBottom: 18,
  },
  signatureArea: {
    position: 'absolute',
    bottom: 74,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signature: {
    width: '43%',
    height: 65,
    justifyContent: 'flex-end',
  },
  signatureLine: {
    borderTop: '1 solid #A8B5C2',
    paddingTop: 8,
    fontSize: 8,
    color: '#627488',
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

type WarrantyRecord = typeof warranties.$inferSelect;

function WarrantyPdf({
  record,
  business,
  logo,
}: {
  record: WarrantyRecord;
  business: {
    name: string;
    phone: string | null;
    address: string | null;
  };
  logo: { data: Buffer; format: 'png' } | null;
}) {
  return (
    <Document
      title={`Mosse Tech Warranty ${record.id.slice(0, 8)}`}
      author={business.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ width: '50%' }}>
            {logo ? (
              <Image src={logo} style={styles.logo} />
            ) : (
              <Text style={styles.value}>{business.name}</Text>
            )}
            {business.address ? (
              <Text style={styles.business}>{business.address}</Text>
            ) : null}
            {business.phone ? (
              <Text style={styles.business}>{business.phone}</Text>
            ) : null}
          </View>
          <View style={{ width: '48%' }}>
            <Text style={styles.title}>WARRANTY CERTIFICATE</Text>
            <Text style={styles.meta}>
              Reference: {record.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ width: '52%' }}>
            <Text style={styles.label}>CUSTOMER</Text>
            <Text style={styles.value}>{record.customerName}</Text>
            {record.customerPhone ? (
              <Text style={styles.text}>{record.customerPhone}</Text>
            ) : null}
          </View>
          <View style={{ width: '43%' }}>
            <Text style={styles.label}>SALE REFERENCE</Text>
            <Text style={styles.value}>
              {record.saleId.slice(0, 8).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>COVERED PRODUCT</Text>
          <Text style={styles.value}>{record.productName}</Text>
          <Text style={styles.text}>
            Quantity covered: {record.coveredQuantity}
          </Text>
          {record.serialNumber ? (
            <Text style={styles.text}>
              Serial number / IMEI: {record.serialNumber}
            </Text>
          ) : null}
        </View>

        <View style={styles.row}>
          <View>
            <Text style={styles.label}>START DATE</Text>
            <Text style={styles.value}>{record.startDate}</Text>
          </View>
          <View>
            <Text style={styles.label}>EXPIRY DATE</Text>
            <Text style={styles.value}>{record.expiryDate}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>WARRANTY COVERAGE</Text>
          <Text style={styles.text}>{record.coverage}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>TERMS AND CONDITIONS</Text>
          <Text style={styles.text}>{record.terms}</Text>
        </View>

        <View style={styles.signatureArea}>
          <View style={styles.signature}>
            <Text style={styles.signatureLine}>
              Authorized signature
            </Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureLine}>
              Company stamp (if applicable)
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {business.name} / Issued {record.issuedAt.toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  );
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string; warrantyId: string }>;
  },
) {
  await requirePermission('sales.view');

  const { id, warrantyId } = await context.params;

  if (!UUID.test(id) || !UUID.test(warrantyId)) {
    return new Response('Invalid warranty reference.', { status: 400 });
  }

  const [record] = await db
    .select()
    .from(warranties)
    .where(
      and(
        eq(warranties.id, warrantyId),
        eq(warranties.saleId, id),
      ),
    )
    .limit(1);

  if (!record) {
    return new Response('Warranty not found.', { status: 404 });
  }

  const [settings] = await db
    .select()
    .from(businessSettings)
    .limit(1);

  const logoPaths = [
    join(process.cwd(), 'public/brand/mossetech-logo-transparent-v2.png'),
    join(process.cwd(), 'apps/web/public/brand/mossetech-logo-transparent-v2.png'),
  ];

  const logoPath = logoPaths.find((p) => existsSync(p));
  const logo = logoPath
    ? { data: readFileSync(logoPath), format: 'png' as const }
    : null;

  const pdf = await renderToBuffer(
    <WarrantyPdf
      record={record}
      business={{
        name: settings?.businessName || 'Mosse Tech',
        phone: settings?.phone || null,
        address: settings?.address || null,
      }}
      logo={logo}
    />,
  );

  const mode = new URL(request.url).searchParams.get('mode') === 'download'
    ? 'attachment'
    : 'inline';

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        `${mode}; filename="mosse-tech-warranty-${warrantyId.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
