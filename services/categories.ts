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

export async function createCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { name: string; icon: string; color: string; type: "expense" | "income"; budgetMonthly?: number | null },
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      name: input.name,
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

export async function updateCategory(
  supabase: SupabaseClient<Database>,
  id: string,
  update: { name?: string; icon?: string; color?: string; budget_monthly?: number | null },
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .update(update)
    .eq("id", id)
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
  await supabase.from("expenses").update({ category_id: fallback.id }).eq("category_id", categoryId);
  // Mobile parity: recurring rules are reassigned as well (FK RESTRICT).
  await supabase.from("recurring_rules").update({ category_id: fallback.id }).eq("category_id", categoryId);
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) throw error;
}
