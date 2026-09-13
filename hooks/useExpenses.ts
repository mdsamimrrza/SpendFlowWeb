"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import {
  cacheExpenses,
  getCachedExpenses,
  listExpenses,
  type ExpenseFilters,
  type ExpenseRow,
  type ExpenseSort,
} from "@/services/expenses";
import { listCategories } from "@/services/categories";
import type { Category } from "@/types/database.types";

/**
 * In-memory cross-screen freshness (mobile parity: notifyExpensesChanged —
 * web has no realtime either; see docs/SYNC-STRATEGY.md).
 */
type Listener = () => void;
const listeners = new Set<Listener>();
export function notifyExpensesChanged(): void {
  listeners.forEach((l) => l());
}

/** Subscribe to cross-screen expense changes (used by pages with own fetches). */
export function subscribeToExpenseChanges(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const refetchThrottles = new Map<string, number>();

/**
 * Cache-paint then network: page-0 rows paint instantly from localStorage,
 * then refresh from Supabase (30 s throttle on remount/focus).
 */
export function useExpenses(userId: string | undefined, filters: ExpenseFilters = {}) {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const parsedFilters = JSON.parse(filterKey) as ExpenseFilters;
    const cacheable = Object.keys(parsedFilters).length === 0;

    if (cacheable) {
      const cached = getCachedExpenses(userId);
      if (cached.length > 0) {
        setRows(cached);
        setLoading(false);
      }
    }

    const throttleKey = `${userId}:${filterKey}`;
    const last = refetchThrottles.get(throttleKey) ?? 0;
    const throttled = Date.now() - last < 30_000;
    if (throttled && rows.length > 0) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setError(null);
        const { rows: fresh, count: total } = await listExpenses(
          getSupabaseBrowserClient(),
          userId,
          0,
          parsedFilters,
        );
        if (cancelled) return;
        setRows(fresh);
        setCount(total);
        if (cacheable) cacheExpenses(userId, fresh);
        refetchThrottles.set(throttleKey, Date.now());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, filterKey, tick]);

  return { rows, count, loading, error };
}

export function useCategories(userId: string | undefined) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await listCategories(getSupabaseBrowserClient(), userId);
      setCategories(rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { categories, loading, reload: load };
}

export function useRefreshExpenses(): () => void {
  return useCallback(() => {
    for (const key of Array.from(refetchThrottles.keys())) refetchThrottles.delete(key);
    notifyExpensesChanged();
  }, []);
}
