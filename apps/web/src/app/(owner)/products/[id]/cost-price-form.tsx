import {
  updateProductCostAction,
  updateProductMinimumPriceAction,
} from '@/lib/products/actions';

type CostPriceFormProps = {
  productId: string;
  buyingPrice: string;
  minimumSellingPrice: string | null;
};

export function CostPriceForm({
  productId,
  buyingPrice,
  minimumSellingPrice,
}: CostPriceFormProps) {
  const recordedCost = Number(buyingPrice);
  const recordedMinimum =
    minimumSellingPrice === null
      ? null
      : Number(minimumSellingPrice);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="text-lg font-black text-[var(--text)]">
        Private Product Pricing
      </h2>

      <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
        Only the owner can view or change these prices. They are never shown to customers.
      </p>

      <p className="mt-4 text-sm font-bold text-[var(--text)]">
        Current cost:{' '}
        {recordedCost > 0
          ? `RWF ${recordedCost.toLocaleString('en-US')}`
          : 'Not recorded'}
      </p>

      <form
        action={updateProductCostAction}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <input
          type="hidden"
          name="productId"
          value={productId}
        />

        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="buyingPrice"
            className="block text-sm font-bold text-[var(--text)]"
          >
            Cost price (RWF)
          </label>

          <input
            id="buyingPrice"
            name="buyingPrice"
            type="number"
            min="0.01"
            max="9999999999.99"
            step="0.01"
            required
            defaultValue={
              recordedCost > 0 ? recordedCost : ''
            }
            placeholder="Enter purchase cost"
            className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-bold text-[var(--text)]"
          />
        </div>

        <button
          type="submit"
          className="h-11 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-bold text-white"
        >
          Save cost
        </button>
      </form>

      <div className="mt-6 border-t border-[var(--border)] pt-5">
        <h3 className="text-base font-black text-[var(--text)]">
          Minimum selling price
        </h3>

        <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
          The lowest price staff can accept, including discounts.
          Only Moses can change the limit.
        </p>

        <p className="mt-3 text-sm font-bold text-[var(--text)]">
          Current minimum:{' '}
          {recordedMinimum !== null && recordedMinimum > 0
            ? `RWF ${recordedMinimum.toLocaleString('en-US')}`
            : 'Not configured'}
        </p>

        <form
          action={updateProductMinimumPriceAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            type="hidden"
            name="productId"
            value={productId}
          />

          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="minimumSellingPrice"
              className="block text-sm font-bold text-[var(--text)]"
            >
              Minimum selling price (RWF)
            </label>

            <input
              id="minimumSellingPrice"
              name="minimumSellingPrice"
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              required
              defaultValue={
                recordedMinimum !== null && recordedMinimum > 0
                  ? recordedMinimum
                  : ''
              }
              placeholder="Enter minimum price"
              className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-bold text-[var(--text)]"
            />
          </div>

          <button
            type="submit"
            className="h-11 rounded-lg bg-[var(--primary-action)] px-5 text-sm font-bold text-white"
          >
            Save minimum
          </button>
        </form>
      </div>
    </section>
  );
}
