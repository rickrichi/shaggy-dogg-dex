// src/utils/guards.ts

/**
 * Ensures an array has at least two items.
 * Refines the type to a tuple with >=2 elements.
 */
export function assertHasAtLeastTwo<T>(
  arr: readonly T[]
): asserts arr is readonly [T, T, ...T[]] {
  if (arr.length < 2) {
    throw new Error('Expected at least two items.');
  }
}

/**
 * Ensures a value is defined (not null or undefined).
 * Useful when narrowing optional values.
 */
export function assertDefined<T>(
  value: T
): asserts value is Exclude<T, null | undefined> {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be defined.');
  }
}

/**
 * Ensures a value is of type string.
 */
export function assertString(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`Expected string, received ${typeof value}`);
  }
}

/**
 * Ensures a value is of type number.
 */
export function assertNumber(value: unknown): asserts value is number {
  if (typeof value !== 'number') {
    throw new Error(`Expected number, received ${typeof value}`);
  }
}

/**
 * Ensures a value is of type boolean.
 */
export function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean, received ${typeof value}`);
  }
}

/**
 * Type guard: check if unknown value is an object (non-null).
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Asserts that an object has a required key.
 */
export function assertHasKey<
  T extends object,
  K extends PropertyKey
>(
  obj: T,
  key: K
): asserts obj is T & Record<K, unknown> {
  if (!(key in obj)) {
    throw new Error(`Expected object to have key "${String(key)}".`);
  }
}

/**
 * Example: ensure an array is non-empty.
 */
export function assertNonEmpty<T>(
  arr: readonly T[]
): asserts arr is readonly [T, ...T[]] {
  if (arr.length === 0) {
    throw new Error('Expected non-empty array.');
  }
}
