/** Categories service — mobile services/categories.ts parity (seed-on-empty, cache-paint). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Database } from "@/types/database.types";
import { seedDefaultCategories } from "./auth";

export async function listCategories(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  let rows = (data ?? []) as Category[];
  if (rows.length === 0) {
    // Seed-on-empty (mobile parity: first login may race the profile seed).
    await seedDefaultCategories(supabase, userId, false);
    const retry = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (!retry.error) rows = (retry.data ?? []) as Category[];
  }
  return rows;
}

/** Client-side write validation (mirrors the DB CHECKs; pages enforce the same caps in the UI). */
function validateCategoryInput(input: {
  name?: string;
  icon?: string;
  color?: string;
  budgetMonthly?: number | null;
}): void {
  if (input.name !== undefined && (!input.name.trim() || input.name.trim().length > 40)) {
    throw new Error("Name must be 1–40 characters");
  }
  if (input.icon !== undefined && (input.icon.length === 0 || input.icon.length > 8)) {
    throw new Error("Invalid icon");
  }
  if (input.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(input.color)) {
    throw new Error("Invalid color");
  }
  if (input.budgetMonthly != null && (!Number.isFinite(input.budgetMonthly) || input.budgetMonthly < 0)) {
    throw new Error("Budget must be zero or greater");
  }
}

export async function createCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { name: string; icon: string; color: string; type: "expense" | "income"; budgetMonthly?: number | null },
): Promise<Category> {
  validateCategoryInput(input);
  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      icon: input.icon,
      color: input.color,
      type: input.type,
      is_custom: true,
      budget_monthly: input.budgetMonthly ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Category;
}

/**
 * Audit P2-4: owner-scoped mutation. `type` stays settable — the category
 * editor's type toggle is documented mobile-parity UI — but the write can only
 * ever touch the caller's own row.
 */
export async function updateCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  update: { name?: string; icon?: string; color?: string; budget_monthly?: number | null; type?: "expense" | "income" },
): Promise<Category> {
  validateCategoryInput({
    name: update.name,
    icon: update.icon,
    color: update.color,
    budgetMonthly: update.budget_monthly,
  });
  const { data, error } = await supabase
    .from("categories")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Category;
}

/**
 * Delete with reassignment (mobile parity): category_id FKs are RESTRICT, so
 * referencing expenses must move to a fallback category first.
 */
export async function deleteCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  categoryId: string,
): Promise<void> {
  const { data: fallback, error: fbError } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "expense")
    .neq("id", categoryId)
    .limit(1)
    .maybeSingle();
  if (fbError || !fallback) {
    throw new Error("Create another category before deleting this one");
  }
  // Owner-scoped re-pointing + surfaced errors (audit P2-4): a silent failure
  // here would only resurface as an opaque FK RESTRICT on the delete below.
  const { error: expErr } = await supabase
    .from("expenses")
    .update({ category_id: fallback.id })
    .eq("category_id", categoryId)
    .eq("user_id", userId);
  if (expErr) throw expErr;
  // Mobile parity: recurring rules are reassigned as well (FK RESTRICT).
  const { error: ruleErr } = await supabase
    .from("recurring_rules")
    .update({ category_id: fallback.id })
    .eq("category_id", categoryId)
    .eq("user_id", userId);
  if (ruleErr) throw ruleErr;
  const { error } = await supabase.from("categories").delete().eq("id", categoryId).eq("user_id", userId);
  if (error) throw error;
}
