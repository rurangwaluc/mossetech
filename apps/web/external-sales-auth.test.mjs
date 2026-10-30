const currentUser = () => globalThis.__mossetechTestUser;

export async function requirePermission(permission) {
  const user = currentUser();

  if (
    !user ||
    user.status !== 'ACTIVE' ||
    (user.role !== 'OWNER' && !user.grants?.includes(permission))
  ) {
    throw new Error('TEST_FORBIDDEN');
  }

  return user;
}

export async function requireOwner() {
  const user = currentUser();

  if (
    !user ||
    user.status !== 'ACTIVE' ||
    user.role !== 'OWNER'
  ) {
    throw new Error('TEST_OWNER_REQUIRED');
  }

  return user;
}
