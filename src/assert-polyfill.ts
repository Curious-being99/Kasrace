/**
 * Browser Polyfill for Node 'assert' module.
 * Provides a callable assert function with all standard assertion methods.
 */
function assert(value: any, message?: string | Error): void {
  if (!value) {
    if (message instanceof Error) throw message;
    throw new Error(message || 'Assertion failed');
  }
}

export function ok(value: any, message?: string | Error): void {
  assert(value, message);
}

export function equal(actual: any, expected: any, message?: string): void {
  if (actual != expected) {
    throw new Error(message || `Assertion failed: ${actual} == ${expected}`);
  }
}

export function strictEqual(actual: any, expected: any, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Assertion failed: ${actual} === ${expected}`);
  }
}

export function notEqual(actual: any, expected: any, message?: string): void {
  if (actual == expected) {
    throw new Error(message || `Assertion failed: ${actual} != ${expected}`);
  }
}

export function notStrictEqual(actual: any, expected: any, message?: string): void {
  if (actual === expected) {
    throw new Error(message || `Assertion failed: ${actual} !== ${expected}`);
  }
}

export function deepEqual(actual: any, expected: any, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || 'Deep equal assertion failed');
  }
}

export function deepStrictEqual(actual: any, expected: any, message?: string): void {
  deepEqual(actual, expected, message);
}

export function throws(fn: () => void, message?: string): void {
  try {
    fn();
  } catch (e) {
    return;
  }
  throw new Error(message || 'Expected function to throw');
}

assert.ok = ok;
assert.equal = equal;
assert.strictEqual = strictEqual;
assert.notEqual = notEqual;
assert.notStrictEqual = notStrictEqual;
assert.deepEqual = deepEqual;
assert.deepStrictEqual = deepStrictEqual;
assert.throws = throws;

// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.assert = assert;
}
// @ts-ignore
if (typeof globalThis !== 'undefined') {
  // @ts-ignore
  globalThis.assert = assert;
}

export default assert;
