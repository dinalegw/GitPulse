export const OPTIONAL_STORAGE_TIMEOUT_MS = 300;

export class OptionalStorageTimeoutError extends Error {
  constructor(label) {
    super(`${label} timed out`);
    this.name = 'OptionalStorageTimeoutError';
  }
}

export async function withOptionalStorageTimeout(
  promise,
  label,
  milliseconds = OPTIONAL_STORAGE_TIMEOUT_MS
) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new OptionalStorageTimeoutError(label)),
          milliseconds
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
