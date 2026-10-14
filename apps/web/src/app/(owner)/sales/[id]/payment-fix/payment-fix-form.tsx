'use client';

import {
  useMemo,
  useState,
} from 'react';
import {
  useFormStatus,
} from 'react-dom';

import {
  submitAtSalePaymentFixAction,
} from '@/lib/sales/payment-fixes';


type PaymentMethod =
  | 'CASH'
  | 'MOBILE_MONEY'
  | 'BANK'
  | 'CARD';


type Props = {
  saleId: string;

  role:
    | 'OWNER'
    | 'EMPLOYEE';

  saleTotal: number;

  otherApplied: number;

  hasCustomer: boolean;

  pendingRequest: boolean;

  error:
    | string
    | null;

  initial: {
    paymentMethod:
      PaymentMethod;

    receivedAmount:
      number;

    returnedAmount:
      number;

    extraKeptAmount:
      number;

    extraReason:
      string;
  };
};


const methods:
  Array<{
    value:
      PaymentMethod;
    label:
      string;
  }> = [
    {
      value: 'CASH',
      label: 'Cash',
    },
    {
      value: 'MOBILE_MONEY',
      label: 'Mobile money',
    },
    {
      value: 'BANK',
      label: 'Bank',
    },
    {
      value: 'CARD',
      label: 'Card',
    },
  ];


function paymentMethodName(
  value: PaymentMethod,
) {
  return (
    methods.find(
      (method) =>
        method.value === value,
    )?.label ||
    value
  );
}


function roundMoney(
  value: number,
) {
  return Math.round(
    value * 100,
  ) / 100;
}


function money(
  value:
    | string
    | number,
) {
  return new Intl.NumberFormat(
    'en-RW',
    {
      maximumFractionDigits:
        0,
    },
  ).format(
    Number(
      value || 0,
    ),
  );
}


function numberValue(
  value: string,
) {
  const number =
    Number(
      value || 0,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}


function SubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={
        disabled ||
        pending
      }
      className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:border disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:opacity-100"
    >
      {pending
        ? 'Saving...'
        : label}
    </button>
  );
}


export default function PaymentFixForm({
  saleId,
  role,
  saleTotal,
  otherApplied,
  hasCustomer,
  pendingRequest,
  error,
  initial,
}: Props) {
  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<
      PaymentMethod
    >(
      initial
        .paymentMethod,
    );

  const [
    receivedAmount,
    setReceivedAmount,
  ] =
    useState(
      String(
        initial
          .receivedAmount,
      ),
    );

  const [
    returnedAmount,
    setReturnedAmount,
  ] =
    useState(
      String(
        initial
          .returnedAmount,
      ),
    );

  const [
    extraKeptAmount,
    setExtraKeptAmount,
  ] =
    useState(
      String(
        initial
          .extraKeptAmount,
      ),
    );

  const [
    extraReason,
    setExtraReason,
  ] =
    useState(
      initial
        .extraReason,
    );

  const [
    reason,
    setReason,
  ] =
    useState('');

  const received =
    numberValue(
      receivedAmount,
    );

  const returned =
    numberValue(
      returnedAmount,
    );

  const extra =
    numberValue(
      extraKeptAmount,
    );

  const applied =
    roundMoney(
      received -
      returned -
      extra,
    );

  const totalPaid =
    roundMoney(
      otherApplied +
      Math.max(
        applied,
        0,
      ),
    );

  const balance =
    roundMoney(
      saleTotal -
      totalPaid,
    );

  const changed =
    paymentMethod !==
      initial
        .paymentMethod ||
    roundMoney(
      received,
    ) !==
      roundMoney(
        initial
          .receivedAmount,
      ) ||
    roundMoney(
      returned,
    ) !==
      roundMoney(
        initial
          .returnedAmount,
      ) ||
    roundMoney(
      extra,
    ) !==
      roundMoney(
        initial
          .extraKeptAmount,
      ) ||
    (
      extra > 0
        ? extraReason
            .trim()
        : ''
    ) !==
      (
        initial
          .extraKeptAmount >
        0
          ? initial
              .extraReason
              .trim()
          : ''
      );

  const problems =
    useMemo(
      () => {
        const list:
          string[] = [];

        if (
          received < 0 ||
          returned < 0 ||
          extra < 0
        ) {
          list.push(
            'Money amounts cannot be below zero.',
          );
        }

        if (
          applied < 0
        ) {
          list.push(
            'Returned money and extra kept are more than money received.',
          );
        }

        if (
          totalPaid >
          saleTotal
        ) {
          list.push(
            'This would make the sale overpaid.',
          );
        }

        if (
          (
            returned > 0 ||
            extra > 0
          ) &&
          balance > 0
        ) {
          list.push(
            'Returned money or extra kept can only be used when the sale is fully paid.',
          );
        }

        if (
          extra > 0 &&
          !extraReason
            .trim()
        ) {
          list.push(
            'Enter why the extra customer money was kept.',
          );
        }

        if (
          balance > 0 &&
          !hasCustomer
        ) {
          list.push(
            'This would leave unpaid money. Add the customer to the sale first.',
          );
        }

        return list;
      },
      [
        applied,
        balance,
        extra,
        extraReason,
        hasCustomer,
        received,
        returned,
        saleTotal,
        totalPaid,
      ],
    );

  const canSave =
    changed &&
    reason
      .trim()
      .length > 0 &&
    problems.length ===
      0 &&
    !pendingRequest;

  return (
    <form
      action={
        submitAtSalePaymentFixAction
      }
      className="space-y-4"
    >
      <input
        type="hidden"
        name="saleId"
        value={
          saleId
        }
      />

      <input
        type="hidden"
        name="paymentMethod"
        value={
          paymentMethod
        }
      />

      {error ? (
        <div className="rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {pendingRequest ? (
        <div className="rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          This payment fix is already waiting for the owner.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Correction review
          </p>

          <h3 className="mt-1 text-lg font-black text-[var(--text)]">
            Recorded and corrected payment
          </h3>
        </div>

        <div className="grid lg:grid-cols-2">
          <div className="px-5 py-5 sm:px-6">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Recorded
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Method
                </span>

                <strong className="text-right text-[var(--text)]">
                  {paymentMethodName(
                    initial.paymentMethod,
                  )}
                </strong>
              </div>

              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Received
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    initial.receivedAmount,
                  )}
                </strong>
              </div>

              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  {initial.paymentMethod ===
                  'CASH'
                    ? 'Change returned'
                    : 'Refunded'}
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    initial.returnedAmount,
                  )}
                </strong>
              </div>

              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Extra kept
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    initial.extraKeptAmount,
                  )}
                </strong>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] px-5 py-5 sm:px-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">
              Corrected
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Method
                </span>

                <strong className="text-right text-[var(--text)]">
                  {paymentMethodName(
                    paymentMethod,
                  )}
                </strong>
              </div>

              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Received
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    received,
                  )}
                </strong>
              </div>

              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  {paymentMethod ===
                  'CASH'
                    ? 'Change returned'
                    : 'Refunded'}
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    returned,
                  )}
                </strong>
              </div>

              <div className="flex items-center justify-between gap-5 text-sm">
                <span className="font-semibold text-[var(--muted)]">
                  Extra kept
                </span>

                <strong className="tabular-nums text-[var(--text)]">
                  {money(
                    extra,
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
          Correction
        </p>

        <h3 className="mt-1 text-xl font-black text-[var(--text)]">
          Correct the payment
        </h3>

        <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
          Edit only the payment values that were recorded incorrectly.
        </p>

        <div className="mt-5">
          <p className="text-xs font-black text-[var(--muted)]">
            Payment method
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {methods.map(
              (method) => (
                <button
                  key={
                    method.value
                  }
                  type="button"
                  onClick={() =>
                    setPaymentMethod(
                      method.value,
                    )
                  }
                  className={
                    paymentMethod ===
                    method.value
                      ? 'h-10 rounded-lg border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-3 text-sm font-black text-[var(--text)]'
                      : 'h-10 rounded-lg border border-[var(--border)] px-3 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)]'
                  }
                >
                  {
                    method.label
                  }
                </button>
              ),
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-black text-[var(--muted)]">
              Amount received
            </span>

            <input
              name="receivedAmount"
              inputMode="decimal"
              value={
                receivedAmount
              }
              onChange={(
                event,
              ) =>
                setReceivedAmount(
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-black text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black text-[var(--muted)]">
              {paymentMethod ===
              'CASH'
                ? 'Change returned'
                : 'Refunded'}
            </span>

            <input
              name="returnedAmount"
              inputMode="decimal"
              value={
                returnedAmount
              }
              onChange={(
                event,
              ) =>
                setReturnedAmount(
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-black text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black text-[var(--muted)]">
              Extra kept
            </span>

            <input
              name="extraKeptAmount"
              inputMode="decimal"
              value={
                extraKeptAmount
              }
              onChange={(
                event,
              ) =>
                setExtraKeptAmount(
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-black text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            />
          </label>
        </div>

        {extra > 0 ? (
          <label className="mt-4 block">
            <span className="text-xs font-black text-[var(--muted)]">
              Why was the extra money kept?
            </span>

            <input
              name="extraReason"
              value={
                extraReason
              }
              onChange={(
                event,
              ) =>
                setExtraReason(
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            />
          </label>
        ) : (
          <input
            type="hidden"
            name="extraReason"
            value=""
          />
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
          After the fix
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold text-[var(--muted)]">
              Applied by this payment
            </p>
            <p className="mt-1 text-lg font-black text-[var(--text)]">
              {money(
                Math.max(
                  applied,
                  0,
                ),
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-[var(--muted)]">
              Total paid
            </p>
            <p className="mt-1 text-lg font-black text-[var(--text)]">
              {money(
                totalPaid,
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-[var(--muted)]">
              Still unpaid
            </p>
            <p className="mt-1 text-lg font-black text-[var(--text)]">
              {money(
                Math.max(
                  balance,
                  0,
                ),
              )}
            </p>
          </div>
        </div>

        {otherApplied > 0 ? (
          <p className="mt-3 text-xs font-bold text-[var(--muted)]">
            Other payments already applied: {money(
              otherApplied,
            )}
          </p>
        ) : null}

        {problems.length >
        0 ? (
          <div className="mt-4 rounded-lg border border-[var(--danger)] px-4 py-3">
            {problems.map(
              (problem) => (
                <p
                  key={
                    problem
                  }
                  className="text-sm font-bold text-[var(--danger)]"
                >
                  {problem}
                </p>
              ),
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <label className="block">
          <span className="text-xs font-black text-[var(--muted)]">
            Why is this correction needed?
          </span>

          <textarea
            name="reason"
            rows={3}
            value={
              reason
            }
            onChange={(
              event,
            ) =>
              setReason(
                event.target
                  .value,
              )
            }
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-semibold text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
            placeholder="Explain the payment mistake"
          />
        </label>

        <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-[var(--muted)]">
            This changes the payment only. Items and stock are not changed.
          </p>

          <SubmitButton
            disabled={
              !canSave
            }
            label={
              role ===
              'OWNER'
                ? 'Save correction'
                : 'Send request'
            }
          />
        </div>
      </section>
    </form>
  );
}
