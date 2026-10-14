import type { CashDrawer, CashDrawerMovement } from '@mossetech/db/schema';

const ignoredMovementTypes = new Set(['OPENING_CASH', 'CLOSING_COUNT', 'CASH_DIFFERENCE']);

export function toNumber(value: string | number | null | undefined) {
  return Number(value || 0);
}

export function toMoney(value: number) {
  return value.toFixed(2);
}

export function getDrawerCashIn(movements: CashDrawerMovement[]) {
  return movements
    .filter((movement) => movement.direction === 'IN' && !ignoredMovementTypes.has(movement.movementType))
    .reduce((sum, movement) => sum + toNumber(movement.amount), 0);
}

export function getDrawerCashOut(movements: CashDrawerMovement[]) {
  return movements
    .filter((movement) => movement.direction === 'OUT' && !ignoredMovementTypes.has(movement.movementType))
    .reduce((sum, movement) => sum + toNumber(movement.amount), 0);
}

export function getExpectedDrawerCash(drawer: CashDrawer, movements: CashDrawerMovement[]) {
  return toNumber(drawer.openingCash) + getDrawerCashIn(movements) - getDrawerCashOut(movements);
}

export function getDifferenceType(difference: number) {
  if (difference > 0) {
    return 'EXTRA';
  }

  if (difference < 0) {
    return 'MISSING';
  }

  return 'NONE';
}
