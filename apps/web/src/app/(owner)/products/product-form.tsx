'use client';

import Link from 'next/link';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useRouter,
} from 'next/navigation';

import {
  createProductAction,
  updateProductAction,
} from '@/lib/products/actions';

import {
  prepareProductImage,
  uploadProductImage,
} from '@/lib/products/image-upload';

import {
  enqueueOfflineOperation,
} from '@/lib/offline/outbox';

import {
  deletePendingOfflineFile,
  savePendingOfflineFile,
} from '@/lib/offline/pending-files';

import {
  runOutboxSync,
} from '@/lib/offline/sync';

type ProductFormProps = {
  backHref?: string;
  draftProductId?: string;
  userId: string;
  userRole?:
    | 'OWNER'
    | 'EMPLOYEE';
  unitLocked?: boolean;
  hasPendingRequest?: boolean;

  product?: {
    id: string;
    name: string;
    category: string;
    unit: string;
    sellingPrice: string;
    minQuantity: number;
    imageKey: string | null;
    notes: string | null;
  };
};

const fieldClass =
  'h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 text-sm font-bold text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]';

const labelClass =
  'block text-[13px] font-black text-[var(--text)]';

const suggestedUnits = [
  'stem',
  'bouquet',
  'bunch',
  'piece',
  'pack',
  'box',
  'pot',
];

function fileSize(
  bytes: number,
) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(
      1,
      Math.round(bytes / 1024),
    )} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

export function ProductForm({
  product,
  backHref = '/products',
  draftProductId,
  userId,
  userRole = 'OWNER',
  unitLocked = false,
  hasPendingRequest = false,
}: ProductFormProps) {
  const router =
    useRouter();

  const previewUrlRef =
    useRef<string | null>(
      null,
    );

  const handledCompletion =
    useRef<string | null>(
      null,
    );

  const [
    selectedImage,
    setSelectedImage,
  ] = useState<File | null>(
    null,
  );

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState<string | null>(
    null,
  );

  const [
    preparingPhoto,
    setPreparingPhoto,
  ] = useState(false);

  const [
    completing,
    setCompleting,
  ] = useState(false);

  const [
    clientError,
    setClientError,
  ] = useState<
    string | null
  >(null);

  const [
    reason,
    setReason,
  ] = useState('');

  const [
    draggingPhoto,
    setDraggingPhoto,
  ] = useState(false);

  const [
    savingLocally,
    setSavingLocally,
  ] = useState(false);

  const [
    queuedLocally,
    setQueuedLocally,
  ] = useState(false);

  const isEditing =
    Boolean(product);

  const isEmployeeEdit =
    isEditing &&
    userRole ===
      'EMPLOYEE';

  const action = product
    ? updateProductAction.bind(
        null,
        product.id,
      )
    : createProductAction;

  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    action,
    {},
  );

  const busy =
    pending ||
    preparingPhoto ||
    completing ||
    savingLocally ||
    queuedLocally;

  useEffect(() => {
    return () => {
      if (
        previewUrlRef.current
      ) {
        URL.revokeObjectURL(
          previewUrlRef.current,
        );
      }
    };
  }, []);

  useEffect(() => {
    if (
      !state.success ||
      !state.completionId ||
      !state.productId ||
      handledCompletion.current ===
        state.completionId
    ) {
      return;
    }

    handledCompletion.current =
      state.completionId;

    const timeout =
      window.setTimeout(
        () => {
          const finish =
            async () => {
              setCompleting(
                true,
              );

              setClientError(
                null,
              );

              try {
                if (
                  selectedImage
                ) {
                  await uploadProductImage(
                    state.productId!,
                    selectedImage,
                    product
                      ? reason.trim()
                      : undefined,
                  );
                }

                if (
                  state.requestSent
                ) {
                  router.replace(
                    '/products?request=1',
                  );

                  router.refresh();

                  return;
                }

                router.replace(
                  product
                    ? '/products?updated=1'
                    : '/products?created=1',
                );

                router.refresh();
              } catch (
                error
              ) {
                setClientError(
                  error instanceof
                    Error
                    ? error.message
                    : 'Product photo could not be saved.',
                );

                setCompleting(
                  false,
                );
              }
            };

          void finish();
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timeout,
      );
    };
  }, [
    product,
    reason,
    router,
    selectedImage,
    state.completionId,
    state.productId,
    state.requestSent,
    state.success,
  ]);

  async function prepareSelectedPhoto(
    file: File,
  ) {
    setPreparingPhoto(
      true,
    );

    setClientError(
      null,
    );

    try {
      const prepared =
        await prepareProductImage(
          file,
        );

      if (
        previewUrlRef.current
      ) {
        URL.revokeObjectURL(
          previewUrlRef.current,
        );
      }

      const url =
        URL.createObjectURL(
          prepared,
        );

      previewUrlRef.current =
        url;

      setPreviewUrl(
        url,
      );

      setSelectedImage(
        prepared,
      );
    } catch (error) {
      setClientError(
        error instanceof
          Error
          ? error.message
          : 'This photo could not be prepared.',
      );
    } finally {
      setPreparingPhoto(
        false,
      );
    }
  }

  async function onPhotoChange(
    event:
      React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    await prepareSelectedPhoto(
      file,
    );

    event.target.value =
      '';
  }

  async function onPhotoDrop(
    event:
      React.DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDraggingPhoto(
      false,
    );

    if (
      busy ||
      hasPendingRequest ||
      isEmployeeEdit
    ) {
      return;
    }

    const file =
      event.dataTransfer
        .files?.[0];

    if (!file) {
      return;
    }

    await prepareSelectedPhoto(
      file,
    );
  }

  function onPhotoDragOver(
    event:
      React.DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    if (
      busy ||
      hasPendingRequest ||
      isEmployeeEdit
    ) {
      return;
    }

    event.dataTransfer.dropEffect =
      'copy';

    setDraggingPhoto(
      true,
    );
  }

  function onPhotoDragLeave(
    event:
      React.DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDraggingPhoto(
      false,
    );
  }

  async function saveProductLocally(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      savingLocally ||
      queuedLocally
    ) {
      return;
    }

    const form =
      event.currentTarget;

    if (!form.reportValidity()) {
      return;
    }

    const data =
      new FormData(form);

    const name =
      String(
        data.get('name') || '',
      ).trim();

    const category =
      String(
        data.get('category') || '',
      ).trim();

    const unit =
      String(
        data.get('unit') || '',
      ).trim();

    const sellingPrice =
      Number(
        String(
          data.get(
            'sellingPrice',
          ) || '',
        ).trim(),
      );

    const minQuantity =
      Number(
        String(
          data.get(
            'minQuantity',
          ) || '',
        ).trim(),
      );

    const notesValue =
      String(
        data.get('notes') || '',
      ).trim();

    const notes =
      notesValue || null;

    if (
      name.length < 2
    ) {
      setClientError(
        'Product name is required.',
      );

      return;
    }

    if (
      category.length < 2
    ) {
      setClientError(
        'Category is required.',
      );

      return;
    }

    if (!unit) {
      setClientError(
        'Unit is required.',
      );

      return;
    }

    if (
      !Number.isFinite(
        sellingPrice,
      ) ||
      sellingPrice <= 0
    ) {
      setClientError(
        'Selling price must be more than zero.',
      );

      return;
    }

    if (
      !Number.isInteger(
        minQuantity,
      ) ||
      minQuantity < 0
    ) {
      setClientError(
        'Enter a valid low-stock level.',
      );

      return;
    }

    const productId =
      product?.id ||
      draftProductId;

    if (!productId) {
      setClientError(
        'Product could not be prepared. Refresh and try again.',
      );

      return;
    }

    const after = {
      name,
      category,
      unit,
      sellingPrice,
      minQuantity,
      notes,
    };

    let before:
      | typeof after
      | null =
      null;

    const reasonValue =
      product
        ? reason.trim()
        : '';

    if (product) {
      before = {
        name:
          product.name,

        category:
          product.category,

        unit:
          product.unit,

        sellingPrice:
          Number(
            product.sellingPrice,
          ),

        minQuantity:
          product.minQuantity,

        notes:
          product.notes
            ?.trim() ||
          null,
      };

      const detailsChanged =
        JSON.stringify(
          before,
        ) !==
        JSON.stringify(
          after,
        );

      if (
        !detailsChanged &&
        !selectedImage
      ) {
        setClientError(
          'Nothing was changed.',
        );

        return;
      }

      if (
        reasonValue.length < 3
      ) {
        setClientError(
          userRole ===
            'OWNER'
            ? 'Tell us why you are changing this.'
            : 'Tell the owner what needs changing.',
        );

        return;
      }

      if (
        userRole ===
          'EMPLOYEE' &&
        selectedImage
      ) {
        setClientError(
          'Only the owner can replace an existing product photo.',
        );

        return;
      }
    }

    setClientError(
      null,
    );

    setSavingLocally(
      true,
    );

    const operationId =
      crypto.randomUUID();

    let pendingFileId:
      | string
      | null =
      null;

    try {
      if (
        selectedImage
      ) {
        const pendingFile =
          await savePendingOfflineFile({
            userId,

            operationId,

            field:
              'productPhoto',

            file:
              selectedImage,
          });

        pendingFileId =
          pendingFile.id;
      }

      await enqueueOfflineOperation({
        operationId,

        userId,

        kind:
          product
            ? 'PRODUCT_UPDATE'
            : 'PRODUCT_CREATE',

        payload:
          product
            ? {
                productId,
                before,
                after,
                reason:
                  reasonValue,
                hasImageChange:
                  Boolean(
                    selectedImage,
                  ),
              }
            : {
                productId,

                values:
                  after,
              },
      });
    } catch (error) {
      if (
        pendingFileId
      ) {
        try {
          await deletePendingOfflineFile(
            pendingFileId,
          );
        } catch {
          // Preserve the original save error.
        }
      }

      setSavingLocally(
        false,
      );

      setClientError(
        error instanceof
          Error
          ? error.message
          : 'Product could not be saved on this device.',
      );

      return;
    }

    /*
     * Do not await synchronization here.
     * The user is free to continue immediately.
     */
    void runOutboxSync(
      userId,
    );

    if (
      navigator.onLine
    ) {
      router.replace(
        userRole ===
          'EMPLOYEE' &&
        product
          ? '/products?requestSaved=1'
          : '/products?saved=1',
      );

      return;
    }

    setQueuedLocally(
      true,
    );

    setSavingLocally(
      false,
    );
  }

  function clearSelectedPhoto() {
    if (
      previewUrlRef.current
    ) {
      URL.revokeObjectURL(
        previewUrlRef.current,
      );

      previewUrlRef.current =
        null;
    }

    setPreviewUrl(
      null,
    );

    setSelectedImage(
      null,
    );

    setClientError(
      null,
    );
  }

  const currentPhotoUrl =
    product?.imageKey
      ? `/api/media/product-image/${product.id}?v=${encodeURIComponent(
          product.imageKey,
        )}`
      : null;

  const displayPhoto =
    previewUrl ||
    currentPhotoUrl;

  return (
    <form
      action={formAction}
      onSubmit={
        saveProductLocally
      }
      className="mx-auto w-full max-w-6xl"
    >
      <input
        type="hidden"
        name="itemType"
        value="PRODUCT"
      />

      {!product &&
      draftProductId ? (
        <input
          type="hidden"
          name="productId"
          value={
            draftProductId
          }
        />
      ) : null}

      {product ? (
        <input
          type="hidden"
          name="hasImageChange"
          value={
            selectedImage
              ? '1'
              : '0'
          }
        />
      ) : null}

      {product &&
      hasPendingRequest ? (
        <div className="mb-4 rounded-lg border border-[var(--primary)] px-4 py-3 text-sm font-bold text-[var(--text)]">
          {userRole ===
          'OWNER' ? (
            <>
              A request is
              waiting for this
              product.{' '}
              <Link
                href="/requests"
                className="font-black text-[var(--primary)]"
              >
                Review request
              </Link>
            </>
          ) : (
            'A request for this product is already waiting for the owner.'
          )}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.45fr)] xl:items-start">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <header className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
              Product details
            </p>

            <h2 className="mt-1 text-xl font-black tracking-tight text-[var(--text)]">
              {product
                ? isEmployeeEdit
                  ? 'Ask owner to edit'
                  : 'Edit product'
                : 'Add product'}
            </h2>

            <p className="mt-1 text-sm font-bold leading-6 text-[var(--muted)]">
              {product
                ? isEmployeeEdit
                  ? 'Change what needs updating. The owner will review it before anything changes.'
                  : 'Update the details used across sales and stock.'
                : 'Add the product once. Stock quantities are managed separately from Stock.'}
            </p>
          </header>

          <div className="space-y-5 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-5">
            <div>
              <label
                className={
                  labelClass
                }
              >
                Product photo
              </label>

              {isEmployeeEdit ? (
                <div className="mt-2 grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center sm:p-4">
                  <div
                    className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] bg-cover bg-center"
                    style={
                      displayPhoto
                        ? {
                            backgroundImage:
                              `url("${displayPhoto}")`,
                          }
                        : undefined
                    }
                  >
                    {!displayPhoto ? (
                      <span className="text-2xl font-black text-[var(--primary)]">
                        {product?.name
                          ?.slice(
                            0,
                            1,
                          )
                          .toUpperCase() ||
                          'B'}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-sm font-black text-[var(--text)]">
                      Product photo
                    </p>

                    <p className="mt-1 max-w-lg text-xs font-bold leading-5 text-[var(--muted)]">
                      Existing product
                      photos can only be
                      replaced by the
                      owner.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  onDrop={
                    onPhotoDrop
                  }
                  onDragOver={
                    onPhotoDragOver
                  }
                  onDragLeave={
                    onPhotoDragLeave
                  }
                  className={`mt-2 overflow-hidden rounded-xl border transition ${
                    draggingPhoto
                      ? 'border-[var(--primary)] bg-[var(--surface)]'
                      : 'border-[var(--border)] bg-[var(--surface)]'
                  }`}
                >
                  <input
                    id="productPhoto"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={
                      busy ||
                      hasPendingRequest
                    }
                    onChange={
                      onPhotoChange
                    }
                    className="sr-only"
                  />

                  {displayPhoto ? (
                    <div className="grid min-h-[170px] sm:grid-cols-[220px_minmax(0,1fr)] sm:min-h-[190px]">
                      <div
                        className="min-h-[170px] bg-[var(--background)] bg-cover bg-center sm:min-h-[190px]"
                        style={{
                          backgroundImage:
                            `url("${displayPhoto}")`,
                        }}
                      />

                      <div className="flex flex-col justify-center px-4 py-4 sm:px-6 sm:py-5">
                        <p className="text-sm font-black text-[var(--text)]">
                          {selectedImage
                            ? 'New photo ready'
                            : 'Current product photo'}
                        </p>

                        <p className="mt-1 max-w-lg text-xs font-bold leading-5 text-[var(--muted)]">
                          Drag another image
                          here or choose one
                          from your device.
                        </p>

                        {selectedImage ? (
                          <p className="mt-2 text-xs font-black text-[var(--text)]">
                            {fileSize(
                              selectedImage.size,
                            )}
                            {' / '}
                            ready to upload
                          </p>
                        ) : null}

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <label
                            htmlFor="productPhoto"
                            className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 text-xs font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:w-auto"
                          >
                            {preparingPhoto
                              ? 'Preparing...'
                              : 'Change photo'}
                          </label>

                          {selectedImage ? (
                            <button
                              type="button"
                              onClick={
                                clearSelectedPhoto
                              }
                              disabled={
                                busy
                              }
                              className="h-10 w-full rounded-lg px-3 text-xs font-black text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-50 sm:w-auto"
                            >
                              Cancel change
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="productPhoto"
                      className="flex min-h-[170px] cursor-pointer flex-col items-center justify-center px-4 py-6 text-center sm:min-h-[190px] sm:px-5 sm:py-8"
                    >
                      <p className="text-base font-black text-[var(--text)]">
                        {draggingPhoto
                          ? 'Drop the photo here'
                          : 'Drop product photo here'}
                      </p>

                      <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                        or click to choose
                        a photo
                      </p>

                      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                        JPG / PNG / WebP
                      </p>

                      <p className="mt-2 max-w-md text-xs font-bold leading-5 text-[var(--muted)]">
                        Large photos are
                        prepared for the
                        web before upload.
                      </p>
                    </label>
                  )}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="name"
                className={
                  labelClass
                }
              >
                Product name
              </label>

              <input
                id="name"
                name="name"
                defaultValue={
                  product?.name ||
                  ''
                }
                placeholder="Classic Roses"
                required
                autoFocus={
                  !product
                }
                maxLength={180}
                className={`${fieldClass} mt-2`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="category"
                  className={
                    labelClass
                  }
                >
                  Category
                </label>

                <input
                  id="category"
                  name="category"
                  defaultValue={
                    product?.category ||
                    ''
                  }
                  placeholder="Enter category"
                  required
                  maxLength={120}
                  className={`${fieldClass} mt-2`}
                />
              </div>

              <div>
                <label
                  htmlFor="unit"
                  className={
                    labelClass
                  }
                >
                  Unit
                </label>

                {product &&
                unitLocked ? (
                  <input
                    type="hidden"
                    name="unit"
                    value={
                      product.unit
                    }
                  />
                ) : null}

                <input
                  id="unit"
                  name={
                    product &&
                    unitLocked
                      ? undefined
                      : 'unit'
                  }
                  list="product-units"
                  defaultValue={
                    product?.unit ||
                    'bouquet'
                  }
                  disabled={
                    Boolean(
                      product &&
                        unitLocked,
                    )
                  }
                  required={
                    !(
                      product &&
                      unitLocked
                    )
                  }
                  maxLength={40}
                  placeholder="Bouquet"
                  className={`${fieldClass} mt-2 disabled:cursor-not-allowed disabled:opacity-60`}
                />

                <datalist id="product-units">
                  {suggestedUnits.map(
                    (unit) => (
                      <option
                        key={unit}
                        value={
                          unit
                        }
                      />
                    ),
                  )}
                </datalist>

                {product &&
                unitLocked ? (
                  <p className="mt-2 text-xs font-bold leading-5 text-[var(--muted)]">
                    Unit cannot be
                    changed after stock
                    or sales have been
                    recorded.
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-bold leading-5 text-[var(--muted)]">
                    How this product is
                    counted in stock and
                    sales.
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="notes"
                  className={
                    labelClass
                  }
                >
                  Notes
                </label>

                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  Optional
                </span>
              </div>

              <textarea
                id="notes"
                name="notes"
                defaultValue={
                  product?.notes ||
                  ''
                }
                rows={4}
                maxLength={1000}
                placeholder="Anything useful to remember about this product"
                className="mt-2 min-h-[112px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold leading-6 text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              />
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <header className="border-b border-[var(--border)] px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
                Selling
              </p>

              <h2 className="mt-1 text-lg font-black text-[var(--text)]">
                Price & stock alert
              </h2>
            </header>

            <div className="grid gap-5 px-4 py-4 md:grid-cols-2 md:px-5 xl:grid-cols-1">
              <div>
                <label
                  htmlFor="sellingPrice"
                  className={
                    labelClass
                  }
                >
                  Selling price
                </label>

                <div className="mt-2 flex h-12 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] transition focus-within:border-[var(--primary)]">
                  <span className="flex items-center border-r border-[var(--border)] px-3 text-xs font-black text-[var(--muted)]">
                    RWF
                  </span>

                  <input
                    id="sellingPrice"
                    name="sellingPrice"
                    inputMode="decimal"
                    defaultValue={
                      Number(
                        product?.sellingPrice ||
                          '0',
                      ) > 0
                        ? Number(
                            product?.sellingPrice,
                          )
                        : ''
                    }
                    placeholder="25000"
                    required
                    className="min-w-0 flex-1 bg-transparent px-4 text-sm font-black text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="minQuantity"
                  className={
                    labelClass
                  }
                >
                  Low-stock level
                </label>

                <input
                  id="minQuantity"
                  name="minQuantity"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={
                    product?.minQuantity ??
                    5
                  }
                  required
                  className={`${fieldClass} mt-2`}
                />

                <p className="mt-2 text-xs font-bold leading-5 text-[var(--muted)]">
                  Warn when remaining
                  stock reaches this
                  quantity.
                </p>
              </div>
            </div>

            <div className="border-t border-[var(--border)] px-5 py-3.5">
              <p className="text-xs font-black text-[var(--text)]">
                Stock is managed from
                Stock
              </p>

              <p className="mt-1 text-xs font-bold leading-5 text-[var(--muted)]">
                {product
                  ? 'Receive stock or record stock changes from the Stock page.'
                  : 'New products start with zero stock. Receive stock from the Stock page.'}
              </p>
            </div>
          </section>
        </aside>
      </div>

      {product ? (
        <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 sm:px-6">
          <label
            htmlFor="reason"
            className={
              labelClass
            }
          >
            {isEmployeeEdit
              ? 'What needs changing?'
              : 'Why are you changing this?'}
          </label>

          <textarea
            id="reason"
            name="reason"
            rows={3}
            required
            value={reason}
            onChange={(event) =>
              setReason(
                event.target.value,
              )
            }
            disabled={
              hasPendingRequest
            }
            placeholder={
              isEmployeeEdit
                ? 'Example: The selling price should be RWF 30,000'
                : 'Example: Selling price changed'
            }
            className="mt-2 min-h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold leading-6 text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </section>
      ) : null}

      {queuedLocally ? (
        <div className="mt-4 rounded-lg border border-[var(--success)] px-4 py-3 text-sm font-bold text-[var(--success)]">
          Saved on this device. Bloom Kigali will sync it automatically when you are back online.
        </div>
      ) : null}

      {state.error ||
      clientError ? (
        <div className="mt-4 rounded-lg border border-[var(--danger)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
          {clientError ||
            state.error}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
        <Link
          href={backHref}
          prefetch
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm font-black text-[var(--text)] transition hover:border-[var(--primary)] sm:w-auto"
        >
          Back
        </Link>

        <button
          type="submit"
          disabled={
            busy ||
            Boolean(
              product &&
                hasPendingRequest,
            )
          }
          className="h-11 w-full rounded-lg bg-[var(--primary)] px-6 text-sm font-black text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {queuedLocally
            ? 'Saved offline'
            : savingLocally
              ? 'Saving...'
              : preparingPhoto
                ? 'Preparing photo...'
            : completing
              ? selectedImage
                ? 'Uploading photo...'
                : 'Finishing...'
              : pending
                ? isEmployeeEdit
                  ? 'Sending...'
                  : 'Saving...'
                : product
                  ? hasPendingRequest
                    ? userRole ===
                        'OWNER'
                      ? 'Review request'
                      : 'Request sent'
                    : isEmployeeEdit
                      ? 'Send request'
                      : 'Save changes'
                  : 'Save product'}
        </button>
      </div>
    </form>
  );
}
