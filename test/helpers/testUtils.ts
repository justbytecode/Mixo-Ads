/**
 * Test utility functions
 */

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

/**
 * Mock timer helpers
 */
export function mockTimers(): void {
  jest.useFakeTimers();
}

export function restoreTimers(): void {
  jest.useRealTimers();
}

export function advanceTimersByTime(ms: number): void {
  jest.advanceTimersByTime(ms);
}

export async function advanceTimersAsync(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
}

/**
 * Create spy function with call tracking
 */
export function createSpy<T extends (...args: unknown[]) => unknown>(
  implementation?: T
): jest.Mock<ReturnType<T>, Parameters<T>> {
  return jest.fn(implementation);
}

/**
 * Suppress console output during test
 */
export function suppressConsole(): {
  restore: () => void;
} {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();

  return {
    restore: () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
      console.debug = originalConsole.debug;
    },
  };
}

/**
 * Create mock fetch function
 */
export function createMockFetch(
  responses: Array<{
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }>
): jest.Mock {
  let callCount = 0;

  return jest.fn(async () => {
    const response = responses[Math.min(callCount, responses.length - 1)];
    callCount++;

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? 'OK' : 'Error',
      headers: new Map(Object.entries(response.headers || {})),
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    } as Response;
  });
}

/**
 * Expect async function to throw
 */
export async function expectToThrow(
  fn: () => Promise<unknown>,
  errorMatcher?: string | RegExp | jest.Constructable
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected function to throw but it did not');
  } catch (error) {
    if (typeof errorMatcher === 'string') {
      expect((error as Error).message).toContain(errorMatcher);
    } else if (errorMatcher instanceof RegExp) {
      expect((error as Error).message).toMatch(errorMatcher);
    } else if (errorMatcher) {
      expect(error).toBeInstanceOf(errorMatcher);
    }
  }
}

/**
 * Count function calls
 */
export function createCallCounter(): {
  count: () => number;
  increment: () => void;
  reset: () => void;
} {
  let count = 0;

  return {
    count: () => count,
    increment: () => { count++; },
    reset: () => { count = 0; },
  };
}

/**
 * Create promise that rejects after timeout
 */
export function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), ms)
  );
}