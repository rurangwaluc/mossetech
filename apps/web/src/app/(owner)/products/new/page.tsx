import {
  randomUUID,
} from 'node:crypto';

import {
  requireUser,
} from '@/lib/auth/session';

import {
  ProductForm,
} from '../product-form';

export default async function NewProductPage() {
  const user =
    await requireUser();

  return (
    <ProductForm
      backHref="/products"
      draftProductId={
        randomUUID()
      }
      userId={user.id}
      userRole={user.role}
    />
  );
}
