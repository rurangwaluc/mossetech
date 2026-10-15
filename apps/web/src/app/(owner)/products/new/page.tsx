import { requirePermission } from '@/lib/auth/require-permission';
import {
  randomUUID,
} from 'node:crypto';

import {
} from '@/lib/auth/session';

import {
  ProductForm,
} from '../product-form';

export default async function NewProductPage() {
  const user =
    await requirePermission('products.create');

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
