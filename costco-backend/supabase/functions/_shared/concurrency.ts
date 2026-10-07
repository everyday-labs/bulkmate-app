// Runs `fn` over `items` with at most `limit` calls in flight — enough
// parallelism to finish a sweep in time without bursting past a paid API's
// per-second rate limit. Results keep input order. `shouldStop` is checked
// before each new call; items never started resolve to `undefined`.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  shouldStop: () => boolean = () => false,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !shouldStop()) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
