import { requireOwner } from '@/lib/auth/session';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import {
  getReport,
  KIGALI_TIME_ZONE,
  money,
} from '@/lib/reports/report-data';

export const runtime = 'nodejs';

type ReportPdfProps = {
  report: Awaited<
    ReturnType<
      typeof getReport
    >
  >;
};

const styles =
  StyleSheet.create({
    page: {
      padding: 30,
      backgroundColor:
        '#FAFAFC',
      color: '#222222',
      fontSize: 8,
      fontFamily:
        'Helvetica',
    },

    header: {
      backgroundColor:
        '#222222',
      color: '#FFFFFF',
      padding: 17,
      marginBottom: 14,
    },

    brand: {
      color: '#D3AA2F',
      fontSize: 8,
      letterSpacing: 1.6,
      marginBottom: 5,
    },

    title: {
      fontSize: 20,
      fontWeight: 700,
      marginBottom: 5,
    },

    period: {
      color: '#D1D5DB',
      fontSize: 9,
    },

    section: {
      marginBottom: 14,
    },

    eyebrow: {
      color: '#B68A00',
      fontSize: 7,
      letterSpacing: 1.2,
      marginBottom: 3,
    },

    sectionTitle: {
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 7,
    },

    table: {
      borderTop:
        '1 solid #D7D7D7',
      borderBottom:
        '1 solid #D7D7D7',
    },

    tableHeader: {
      flexDirection: 'row',
      backgroundColor:
        '#F0F0F1',
      borderBottom:
        '1 solid #D7D7D7',
      minHeight: 25,
      alignItems: 'center',
    },

    tableRow: {
      flexDirection: 'row',
      borderBottom:
        '1 solid #E4E4E4',
      minHeight: 28,
      alignItems: 'center',
    },

    finalRow: {
      flexDirection: 'row',
      minHeight: 28,
      alignItems: 'center',
    },

    headText: {
      color: '#6B7280',
      fontSize: 6.5,
      fontWeight: 700,
      letterSpacing: 0.8,
    },

    bodyText: {
      fontSize: 8,
      fontWeight: 700,
    },

    detailText: {
      color: '#6B7280',
      fontSize: 7,
    },

    numericText: {
      fontSize: 8,
      fontWeight: 700,
      textAlign: 'right',
    },

    negativeText: {
      color: '#D94949',
    },

    metricCol: {
      width: '28%',
      paddingHorizontal: 8,
    },

    valueCol: {
      width: '20%',
      paddingHorizontal: 8,
    },

    detailCol: {
      width: '52%',
      paddingHorizontal: 8,
    },

    stockMetricCol: {
      width: '26%',
      paddingHorizontal: 8,
    },

    stockQtyCol: {
      width: '18%',
      paddingHorizontal: 8,
    },

    stockValueCol: {
      width: '22%',
      paddingHorizontal: 8,
    },

    stockNotesCol: {
      width: '34%',
      paddingHorizontal: 8,
    },

    productCol: {
      width: '52%',
      paddingHorizontal: 8,
    },

    productQtyCol: {
      width: '20%',
      paddingHorizontal: 8,
    },

    productValueCol: {
      width: '28%',
      paddingHorizontal: 8,
    },

    note: {
      color: '#6B7280',
      fontSize: 7,
      lineHeight: 1.4,
      marginTop: 5,
    },

    footer: {
      marginTop: 5,
      textAlign: 'center',
      color: '#6B7280',
      fontSize: 6.5,
    },
  });

function SummaryTable({
  report,
}: ReportPdfProps) {
  const rows = [
    {
      label: 'Sales',
      value:
        money(
          report.summary.salesTotal,
        ),
      detail: `${report.summary.salesCount} ${
        report.summary.salesCount ===
        1
          ? 'sale'
          : 'sales'
      }`,
      negative: false,
    },
    {
      label:
        'Money received',
      value:
        money(
          report.summary.moneyReceived,
        ),
      detail:
        'Customer payments received in this period',
      negative: false,
    },
    {
      label: 'Expenses',
      value:
        money(
          report.summary.expensesTotal,
        ),
      detail:
        'Business money spent in this period',
      negative:
        report.summary.expensesTotal >
        0,
    },
    {
      label:
        'Discounts',
      value:
        money(
          report.summary.discountTotal,
        ),
      detail:
        report.summary.discountTotal >
        0
          ? `Sales before discount: ${money(
              report.summary.salesBeforeDiscount,
            )}`
          : 'No discounts given',
      negative: false,
    },
  ];

  return (
    <View
      style={
        styles.section
      }
    >
      <Text
        style={
          styles.eyebrow
        }
      >
        SUMMARY
      </Text>

      <Text
        style={
          styles.sectionTitle
        }
      >
        Period activity
      </Text>

      <View
        style={
          styles.table
        }
      >
        <View
          style={
            styles.tableHeader
          }
        >
          <View
            style={
              styles.metricCol
            }
          >
            <Text
              style={
                styles.headText
              }
            >
              METRIC
            </Text>
          </View>

          <View
            style={
              styles.valueCol
            }
          >
            <Text
              style={[
                styles.headText,
                {
                  textAlign:
                    'right',
                },
              ]}
            >
              VALUE
            </Text>
          </View>

          <View
            style={
              styles.detailCol
            }
          >
            <Text
              style={
                styles.headText
              }
            >
              DETAIL
            </Text>
          </View>
        </View>

        {rows.map(
          (
            row,
            index,
          ) => (
            <View
              key={
                row.label
              }
              style={
                index ===
                rows.length -
                  1
                  ? styles.finalRow
                  : styles.tableRow
              }
            >
              <View
                style={
                  styles.metricCol
                }
              >
                <Text
                  style={
                    styles.bodyText
                  }
                >
                  {
                    row.label
                  }
                </Text>
              </View>

              <View
                style={
                  styles.valueCol
                }
              >
                <Text
                  style={[
                    styles.numericText,
                    row.negative
                      ? styles.negativeText
                      : {},
                  ]}
                >
                  {
                    row.value
                  }
                </Text>
              </View>

              <View
                style={
                  styles.detailCol
                }
              >
                <Text
                  style={
                    styles.detailText
                  }
                >
                  {
                    row.detail
                  }
                </Text>
              </View>
            </View>
          ),
        )}
      </View>
    </View>
  );
}

function MoneyTable({
  report,
}: ReportPdfProps) {
  const paymentRows =
    report.paymentRows.length >
    0
      ? report.paymentRows.map(
          (row) => ({
            key:
              `payment-${row.method}`,
            label:
              row.name,
            value:
              money(
                row.total,
              ),
            detail:
              row.later > 0
                ? `${money(
                    row.atSale,
                  )} at sale / ${money(
                    row.later,
                  )} later`
                : 'Customer payments received',
            negative: false,
          }),
        )
      : [
          {
            key:
              'payments-none',
            label:
              'Customer payments',
            value:
              money(0),
            detail:
              'No customer payments received in this period',
            negative: false,
          },
        ];

  const expenseRows =
    report.expenseCategoryRows.map(
      (row) => ({
        key:
          `expense-${row.category}`,
        label:
          `Expense / ${row.category}`,
        value:
          money(
            row.total,
          ),
        detail:
          'Business expense',
        negative: true,
      }),
    );

  const rows = [
    ...paymentRows,
    ...expenseRows,
    {
      key:
        'outstanding',
      label:
        'Outstanding',
      value:
        money(
          report.receivables.currentOutstanding,
        ),
      detail:
        'Current total across all unpaid sales',
      negative: false,
    },
    {
      key:
        'unpaid-sales',
      label:
        'Unpaid sales',
      value:
        String(
          report.receivables.unpaidSalesCount,
        ),
      detail:
        report.receivables.unpaidSalesCount ===
        0
          ? 'No customer balances are outstanding'
          : report.receivables.unpaidSalesCount ===
              1
            ? '1 sale still has money owed'
            : `${report.receivables.unpaidSalesCount} sales still have money owed`,
      negative: false,
    },
  ];

  return (
    <View
      style={
        styles.section
      }
    >
      <Text
        style={
          styles.eyebrow
        }
      >
        MONEY
      </Text>

      <Text
        style={
          styles.sectionTitle
        }
      >
        Money and receivables
      </Text>

      <View
        style={
          styles.table
        }
      >
        <View
          style={
            styles.tableHeader
          }
        >
          <View
            style={
              styles.metricCol
            }
          >
            <Text
              style={
                styles.headText
              }
            >
              CATEGORY
            </Text>
          </View>

          <View
            style={
              styles.valueCol
            }
          >
            <Text
              style={[
                styles.headText,
                {
                  textAlign:
                    'right',
                },
              ]}
            >
              VALUE
            </Text>
          </View>

          <View
            style={
              styles.detailCol
            }
          >
            <Text
              style={
                styles.headText
              }
            >
              DETAIL
            </Text>
          </View>
        </View>

        {rows.map(
          (
            row,
            index,
          ) => (
            <View
              key={
                row.key
              }
              style={
                index ===
                rows.length -
                  1
                  ? styles.finalRow
                  : styles.tableRow
              }
            >
              <View
                style={
                  styles.metricCol
                }
              >
                <Text
                  style={
                    styles.bodyText
                  }
                >
                  {
                    row.label
                  }
                </Text>
              </View>

              <View
                style={
                  styles.valueCol
                }
              >
                <Text
                  style={[
                    styles.numericText,
                    row.negative
                      ? styles.negativeText
                      : {},
                  ]}
                >
                  {
                    row.value
                  }
                </Text>
              </View>

              <View
                style={
                  styles.detailCol
                }
              >
                <Text
                  style={
                    styles.detailText
                  }
                >
                  {
                    row.detail
                  }
                </Text>
              </View>
            </View>
          ),
        )}
      </View>

      <Text
        style={
          styles.note
        }
      >
        Outstanding and unpaid
        sales show the current
        business position and are
        not limited to the selected
        report period.
      </Text>
    </View>
  );
}

function StockTable({
  report,
}: ReportPdfProps) {
  const rows = [
    {
      label:
        'Current remaining',
      quantity:
        `${report.stock.remainingUnits} units`,
      value:
        money(
          report.stock.remainingValue,
        ),
      notes:
        'Current ledger / current selling prices',
    },
    {
      label:
        'Received',
      quantity:
        `${report.stock.receivedUnits} units`,
      value:
        money(
          report.stock.receivedValue,
        ),
      notes:
        'Selected period / selling price at receipt',
    },
    {
      label: 'Sold',
      quantity:
        `${report.stock.soldUnits} units`,
      value:
        money(
          report.stock.soldValue,
        ),
      notes:
        'Selected period / sale item value',
    },
    {
      label:
        'Damaged',
      quantity:
        `${report.stock.damagedUnits} units`,
      value: '—',
      notes:
        'Selected period / quantity only',
    },
  ];

  return (
    <View
      style={
        styles.section
      }
    >
      <Text
        style={
          styles.eyebrow
        }
      >
        STOCK
      </Text>

      <Text
        style={
          styles.sectionTitle
        }
      >
        Stock position
      </Text>

      <View
        style={
          styles.table
        }
      >
        <View
          style={
            styles.tableHeader
          }
        >
          <View
            style={
              styles.stockMetricCol
            }
          >
            <Text
              style={
                styles.headText
              }
            >
              METRIC
            </Text>
          </View>

          <View
            style={
              styles.stockQtyCol
            }
          >
            <Text
              style={[
                styles.headText,
                {
                  textAlign:
                    'right',
                },
              ]}
            >
              QUANTITY
            </Text>
          </View>

          <View
            style={
              styles.stockValueCol
            }
          >
            <Text
              style={[
                styles.headText,
                {
                  textAlign:
                    'right',
                },
              ]}
            >
              VALUE
            </Text>
          </View>

          <View
            style={
              styles.stockNotesCol
            }
          >
            <Text
              style={
                styles.headText
              }
            >
              NOTES
            </Text>
          </View>
        </View>

        {rows.map(
          (
            row,
            index,
          ) => (
            <View
              key={
                row.label
              }
              style={
                index ===
                rows.length -
                  1
                  ? styles.finalRow
                  : styles.tableRow
              }
            >
              <View
                style={
                  styles.stockMetricCol
                }
              >
                <Text
                  style={
                    styles.bodyText
                  }
                >
                  {
                    row.label
                  }
                </Text>
              </View>

              <View
                style={
                  styles.stockQtyCol
                }
              >
                <Text
                  style={
                    styles.numericText
                  }
                >
                  {
                    row.quantity
                  }
                </Text>
              </View>

              <View
                style={
                  styles.stockValueCol
                }
              >
                <Text
                  style={
                    styles.numericText
                  }
                >
                  {
                    row.value
                  }
                </Text>
              </View>

              <View
                style={
                  styles.stockNotesCol
                }
              >
                <Text
                  style={
                    styles.detailText
                  }
                >
                  {
                    row.notes
                  }
                </Text>
              </View>
            </View>
          ),
        )}
      </View>

      <Text
        style={
          styles.note
        }
      >
        Current remaining stock is
        a current-state figure.
        Received, sold and damaged
        follow the selected report
        period.
      </Text>
    </View>
  );
}

function ProductsTable({
  report,
}: ReportPdfProps) {
  if (
    report.productRows.length ===
    0
  ) {
    return null;
  }

  return (
    <View
      style={
        styles.section
      }
    >
      <Text
        style={
          styles.eyebrow
        }
      >
        PRODUCTS
      </Text>

      <Text
        style={
          styles.sectionTitle
        }
      >
        Best sellers
      </Text>

      <View
        style={
          styles.table
        }
      >
        <View
          style={
            styles.tableHeader
          }
        >
          <View
            style={
              styles.productCol
            }
          >
            <Text
              style={
                styles.headText
              }
            >
              PRODUCT
            </Text>
          </View>

          <View
            style={
              styles.productQtyCol
            }
          >
            <Text
              style={[
                styles.headText,
                {
                  textAlign:
                    'right',
                },
              ]}
            >
              QUANTITY
            </Text>
          </View>

          <View
            style={
              styles.productValueCol
            }
          >
            <Text
              style={[
                styles.headText,
                {
                  textAlign:
                    'right',
                },
              ]}
            >
              SALES VALUE
            </Text>
          </View>
        </View>

        {report.productRows.map(
          (
            row,
            index,
          ) => (
            <View
              key={
                row.id
              }
              style={
                index ===
                report.productRows.length -
                  1
                  ? styles.finalRow
                  : styles.tableRow
              }
            >
              <View
                style={
                  styles.productCol
                }
              >
                <Text
                  style={
                    styles.bodyText
                  }
                >
                  {
                    row.name
                  }
                </Text>
              </View>

              <View
                style={
                  styles.productQtyCol
                }
              >
                <Text
                  style={
                    styles.numericText
                  }
                >
                  {
                    row.quantity
                  }
                </Text>
              </View>

              <View
                style={
                  styles.productValueCol
                }
              >
                <Text
                  style={
                    styles.numericText
                  }
                >
                  {money(
                    row.salesValue,
                  )}
                </Text>
              </View>
            </View>
          ),
        )}
      </View>
    </View>
  );
}

function ReportPdf({
  report,
}: ReportPdfProps) {
  const generatedAt =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          KIGALI_TIME_ZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      },
    ).format(
      new Date(),
    );

  return (
    <Document>
      <Page
        size="A4"
        style={
          styles.page
        }
      >
        <View
          style={
            styles.header
          }
        >
          <Text
            style={
              styles.brand
            }
          >
            BLOOM KIGALI
          </Text>

          <Text
            style={
              styles.title
            }
          >
            Business report
          </Text>

          <Text
            style={
              styles.period
            }
          >
            {
              report.period
                .label
            }
          </Text>
        </View>

        <SummaryTable
          report={report}
        />

        <MoneyTable
          report={report}
        />

        <StockTable
          report={report}
        />

        <ProductsTable
          report={report}
        />

        <Text
          style={
            styles.footer
          }
        >
          Generated{' '}
          {generatedAt} /
          Africa/Kigali /
          Bloom Kigali
        </Text>
      </Page>
    </Document>
  );
}

export async function GET(
  request: Request,
) {
  await requireOwner();

  const url =
    new URL(
      request.url,
    );

  const report =
    await getReport({
      preset:
        url.searchParams.get(
          'preset',
        ),
      fromDate:
        url.searchParams.get(
          'fromDate',
        ),
      fromTime:
        url.searchParams.get(
          'fromTime',
        ),
      toDate:
        url.searchParams.get(
          'toDate',
        ),
      toTime:
        url.searchParams.get(
          'toTime',
        ),
    });

  if (
    report.period.error
  ) {
    return new Response(
      report.period.error,
      {
        status: 400,
        headers: {
          'Content-Type':
            'text/plain; charset=utf-8',
        },
      },
    );
  }

  const mode =
    url.searchParams.get(
      'mode',
    ) === 'inline'
      ? 'inline'
      : 'attachment';

  const pdf =
    await renderToBuffer(
      <ReportPdf
        report={report}
      />,
    );

  const filename =
    `bloom-kigali-report-${report.period.fileLabel}.pdf`;

  return new Response(
    new Uint8Array(pdf),
    {
      headers: {
        'Content-Type':
          'application/pdf',
        'Content-Disposition':
          `${mode}; filename="${filename}"`,
      },
    },
  );
}
