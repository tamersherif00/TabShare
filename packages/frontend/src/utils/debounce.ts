/**
 * Debounce utility for optimizing frequent function calls
 */

export type DebouncedFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param immediate - If true, trigger the function on the leading edge instead of trailing
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): DebouncedFunction<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    const context = this;

    const later = () => {
      timeout = null;
      if (!immediate && lastArgs) {
        func.apply(context, lastArgs);
      }
    };

    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);

    if (callNow) {
      func.apply(context, args);
    }
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeout && lastArgs) {
      func.apply(null, lastArgs);
      debounced.cancel();
    }
  };

  return debounced as DebouncedFunction<T>;
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 * 
 * @param func - The function to throttle
 * @param wait - The number of milliseconds to throttle invocations to
 * @returns The throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;
  let lastArgs: Parameters<T> | null = null;

  const throttled = function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    const context = this;
    const now = Date.now();

    const remaining = wait - (now - lastRun);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastRun = now;
      func.apply(context, args);
      lastArgs = null;
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastRun = Date.now();
        timeout = null;
        if (lastArgs) {
          func.apply(context, lastArgs);
          lastArgs = null;
        }
      }, remaining);
    }
  };

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = null;
  };

  throttled.flush = () => {
    if (lastArgs) {
      func.apply(null, lastArgs);
      throttled.cancel();
    }
  };

  return throttled as DebouncedFunction<T>;
}
