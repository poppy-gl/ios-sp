type CacheEntry<TValue> = {
  expiresAt: number;
  value: TValue;
};

export type TtlCache<TValue> = {
  clear: () => void;
  get: (key: string) => TValue | undefined;
  set: (key: string, value: TValue) => void;
};

export const createTtlCache = <TValue>(options: {
  maxEntries: number;
  ttlMs: number;
}): TtlCache<TValue> => {
  const entries = new Map<string, CacheEntry<TValue>>();

  const pruneExpired = (now: number) => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
  };

  const trimOverflow = () => {
    while (entries.size > options.maxEntries) {
      const oldestKey = entries.keys().next().value;

      if (!oldestKey) {
        break;
      }

      entries.delete(oldestKey);
    }
  };

  return {
    clear: () => entries.clear(),
    get: (key) => {
      const now = Date.now();
      const entry = entries.get(key);

      if (!entry) {
        pruneExpired(now);
        return undefined;
      }

      if (entry.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }

      entries.delete(key);
      entries.set(key, entry);

      return entry.value;
    },
    set: (key, value) => {
      entries.set(key, {
        expiresAt: Date.now() + options.ttlMs,
        value,
      });
      trimOverflow();
    },
  };
};
