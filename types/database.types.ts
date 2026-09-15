/**
 * GENERATED-TYPES PLACEHOLDER — see docs/SCHEMA.md.
 *
 * The Supabase CLI is not linked in this environment yet, so these types are
 * hand-derived from the committed migrations (docs/SCHEMA.md) and cover the
 * tables the web app touches. Replace this file wholesale with the output of
 * `supabase gen types typescript` (scripts/sync-supabase-types.mjs) once the
 * CLI is available — the import surface (Tables/Insert/Updates) matches what
 * the generator emits.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * FK relationship metadata required by supabase-js ≥ 2.9x type resolution
 * (the `supabase gen types` output includes these; mirrored here by hand).
 * Literal tuple types so select-embed inference (e.g. `categories(...)`)
 * resolves correctly.
 */
interface Relationship {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

type RelationshipTuple = readonly [
  Relationship,
  ...Relationship[],
];

type UserRelationships = [
  {
    foreignKeyName: "users_id_fkey";
    columns: ["id"];
    referencedRelation: "users";
    referencedColumns: ["id"];
  },
];

type CategoryRelationships = [
  {
    foreignKeyName: "categories_user_id_fkey";
    columns: ["user_id"];
    referencedRelation: "users";
    referencedColumns: ["id"];
  },
];

type BankAccountRelationships = [
  {
    foreignKeyName: "bank_accounts_user_id_fkey";
    columns: ["user_id"];
    referencedRelation: "users";
    referencedColumns: ["id"];
  },
];

type ExpenseRelationships = [
  {
    foreignKeyName: "expenses_category_id_fkey";
    columns: ["category_id"];
    referencedRelation: "categories";
    referencedColumns: ["id"];
  },
  {
    foreignKeyName: "expenses_bank_account_id_fkey";
    columns: ["bank_account_id"];
    referencedRelation: "bank_accounts";
    referencedColumns: ["id"];
  },
  {
    foreignKeyName: "expenses_recurring_rule_id_fkey";
    columns: ["recurring_rule_id"];
    referencedRelation: "recurring_rules";
    referencedColumns: ["id"],
  },
];

type RecurringRuleRelationships = [
  {
    foreignKeyName: "recurring_rules_category_id_fkey";
    columns: ["category_id"];
    referencedRelation: "categories";
    referencedColumns: ["id"];
  },
  {
    foreignKeyName: "recurring_rules_user_id_fkey";
    columns: ["user_id"];
    referencedRelation: "users";
    referencedColumns: ["id"];
  },
];

type TransferRelationships = [
  {
    foreignKeyName: "transfers_from_account_id_fkey";
    columns: ["from_account_id"];
    referencedRelation: "bank_accounts";
    referencedColumns: ["id"];
  },
  {
    foreignKeyName: "transfers_to_account_id_fkey";
    columns: ["to_account_id"];
    referencedRelation: "bank_accounts";
    referencedColumns: ["id"];
  },
  {
    foreignKeyName: "transfers_user_id_fkey";
    columns: ["user_id"];
    referencedRelation: "users";
    referencedColumns: ["id"];
  },
];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      users: {
        Relationships: UserRelationships;
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          preferred_currency: string;
          theme_preference: "light" | "dark" | "system";
          monthly_budget: number | null;
          /** Live DB column (docs/SCHEMA.md §users) — the currency the stored
              monthly_budget figure is in; mobile writes it. */
          budget_currency: string | null;
          cycle_start_day: number;
          cycle_end_day: number | null;
          deletion_pending: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          preferred_currency?: string;
          theme_preference?: "light" | "dark" | "system";
          monthly_budget?: number | null;
          budget_currency?: string | null;
          cycle_start_day?: number;
          cycle_end_day?: number | null;
        };
        Update: {
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          preferred_currency?: string;
          theme_preference?: "light" | "dark" | "system";
          monthly_budget?: number | null;
          budget_currency?: string | null;
          cycle_start_day?: number;
          cycle_end_day?: number | null;
        };
      };
      categories: {
        Relationships: CategoryRelationships;
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          is_custom: boolean;
          budget_monthly: number | null;
          type: "expense" | "income";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          is_custom?: boolean;
          budget_monthly?: number | null;
          type?: "expense" | "income";
        };
        Update: {
          name?: string;
          icon?: string;
          color?: string;
          budget_monthly?: number | null;
          type?: "expense" | "income";
        };
      };
      expenses: {
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey",
            columns: ["category_id"],
            referencedRelation: "categories",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "expenses_bank_account_id_fkey",
            columns: ["bank_account_id"],
            referencedRelation: "bank_accounts",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "expenses_recurring_rule_id_fkey",
            columns: ["recurring_rule_id"],
            referencedRelation: "recurring_rules",
            referencedColumns: ["id"],
          },
        ];
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          amount: number;
          currency: string;
          description: string | null;
          date: string;
          time: string | null;
          payment_method: "Cash" | "Card" | "UPI" | "Other";
          notes: string | null;
          receipt_image_url: string | null;
          is_recurring: boolean;
          recurring_rule_id: string | null;
          /** Installment slot (chain position) this payment satisfies. */
          recurring_due_date: string | null;
          is_synced: boolean;
          deleted_at: string | null;
          bank_account_id: string | null;
          client_sync_id: string | null;
          exchange_rate_to_usd: number | null;
          base_currency: string | null;
          type: "expense" | "income";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          amount: number;
          currency: string;
          description?: string | null;
          date: string;
          time?: string | null;
          payment_method?: "Cash" | "Card" | "UPI" | "Other";
          notes?: string | null;
          receipt_image_url?: string | null;
          is_recurring?: boolean;
          recurring_rule_id?: string | null;
          recurring_due_date?: string | null;
          is_synced?: boolean;
          bank_account_id?: string | null;
          exchange_rate_to_usd?: number | null;
          base_currency?: string | null;
          type?: "expense" | "income";
        };
        Update: {
          category_id?: string;
          amount?: number;
          currency?: string;
          description?: string | null;
          date?: string;
          recurring_due_date?: string | null;
          time?: string | null;
          payment_method?: "Cash" | "Card" | "UPI" | "Other";
          notes?: string | null;
          receipt_image_url?: string | null;
          bank_account_id?: string | null;
          exchange_rate_to_usd?: number | null;
          base_currency?: string | null;
          type?: "expense" | "income";
          deleted_at?: string | null;
        };
      };
      bank_accounts: {
        Relationships: BankAccountRelationships;
        Row: {
          id: string;
          user_id: string;
          name: string;
          account_type:
            | "bank"
            | "wallet"
            | "cash"
            | "credit_card"
            | "savings"
            | "investment"
            | "other";
          currency: string;
          initial_balance: number;
          current_balance: number;
          color: string;
          icon: string;
          account_number_last4: string | null;
          is_default: boolean;
          country: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          account_type?:
            | "bank"
            | "wallet"
            | "cash"
            | "credit_card"
            | "savings"
            | "investment"
            | "other";
          currency?: string;
          initial_balance?: number;
          current_balance?: number;
          color?: string;
          icon?: string;
          account_number_last4?: string | null;
          is_default?: boolean;
          country?: string | null;
        };
        Update: Partial<Omit<BankAccountsInsert, "user_id">> & { deleted_at?: string | null };
      };
      recurring_rules: {
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey",
            columns: ["category_id"],
            referencedRelation: "categories",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "recurring_rules_user_id_fkey",
            columns: ["user_id"],
            referencedRelation: "users",
            referencedColumns: ["id"],
          },
        ];
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          amount: number;
          currency: string;
          description: string | null;
          payment_method: "Cash" | "Card" | "UPI" | "Other";
          frequency: "daily" | "weekly" | "monthly" | "custom";
          /** Used only when frequency === 'custom' (1–365 days). */
          interval_days: number | null;
          /** auto_charge posts itself; pay_on_due books only on an explicit tap. */
          mode: "auto_charge" | "pay_on_due";
          /** Chain anchor: due slots = plan_start_date + N × cycle. */
          plan_start_date: string | null;
          next_due_date: string;
          is_active: boolean;
          exchange_rate_to_usd: number | null;
          base_currency: string | null;
          created_at: string;
          updated_at: string;
          /** Bin trash column — set = in Bin, NULL = live (20260916 migration). */
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          amount: number;
          currency?: string;
          description?: string | null;
          payment_method?: "Cash" | "Card" | "UPI" | "Other";
          frequency: "daily" | "weekly" | "monthly" | "custom";
          interval_days?: number | null;
          mode?: "auto_charge" | "pay_on_due";
          plan_start_date?: string | null;
          next_due_date: string;
          is_active?: boolean;
          exchange_rate_to_usd?: number | null;
          base_currency?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<RecurringRulesInsert>;
      };
      transfers: {
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey",
            columns: ["from_account_id"],
            referencedRelation: "bank_accounts",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey",
            columns: ["to_account_id"],
            referencedRelation: "bank_accounts",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "transfers_user_id_fkey",
            columns: ["user_id"],
            referencedRelation: "users",
            referencedColumns: ["id"],
          },
        ];
        Row: {
          id: string;
          user_id: string;
          from_account_id: string;
          to_account_id: string;
          amount: number;
          from_currency: string;
          to_currency: string;
          exchange_rate: number;
          converted_amount: number;
          fee: number;
          date: string;
          time: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          from_account_id: string;
          to_account_id: string;
          amount: number;
          from_currency: string;
          to_currency: string;
          exchange_rate: number;
          converted_amount: number;
          fee?: number;
          date: string;
          time?: string | null;
          notes?: string | null;
        };
        Update: Partial<Omit<TransfersInsert, "user_id">> & { deleted_at?: string | null };
      };
      notifications: {
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          data: Json | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          data?: Json | null;
          is_read?: boolean;
        };
        Update: { is_read?: boolean; data?: Json | null };
      };
      user_settings_history: {
        Relationships: [
          {
            foreignKeyName: "user_settings_history_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
        Row: {
          id: string;
          user_id: string;
          effective_from: string;
          monthly_budget: number | null;
          cycle_start_day: number;
          cycle_end_day: number | null;
          budget_currency: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          effective_from: string;
          monthly_budget?: number | null;
          cycle_start_day?: number;
          cycle_end_day?: number | null;
          budget_currency?: string | null;
        };
        Update: {
          monthly_budget?: number | null;
          cycle_start_day?: number;
          cycle_end_day?: number | null;
          budget_currency?: string | null;
        };
      };
      category_budget_history: {
        Relationships: [
          {
            foreignKeyName: "category_budget_history_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          effective_from: string;
          budget_monthly: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          effective_from: string;
          budget_monthly?: number | null;
        };
        Update: { budget_monthly?: number | null };
      };
      exchange_rates: {
        Relationships: [];
        Row: {
          currency: string;
          date: string;
          rate_to_usd: number;
          fetched_at: string;
          source: string | null;
        };
        // Clients are read-only on this table (RLS revokes writes — docs/SUPABASE.md §1).
        Insert: never;
        Update: never;
      };
      bin_receipt_orphans: {
        Relationships: [
          {
            foreignKeyName: "bin_receipt_orphans_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
        Row: {
          user_id: string;
          path: string;
          purged_at: string;
        };
        // RLS with zero policies — only the SECURITY DEFINER functions touch it.
        Insert: never;
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Owner-scoped drain of the receipt-orphan queue (SECURITY DEFINER). */
      claim_bin_receipt_orphans: {
        Args: Record<string, never>;
        Returns: string[];
      };
    };
    Enums: Record<string, never>;
  };
};

type BankAccountsInsert = Database["public"]["Tables"]["bank_accounts"]["Insert"];
type RecurringRulesInsert = Database["public"]["Tables"]["recurring_rules"]["Insert"];
type TransfersInsert = Database["public"]["Tables"]["transfers"]["Insert"];

export type Profile = Database["public"]["Tables"]["users"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["users"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["users"]["Update"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];
export type ExpenseUpdate = Database["public"]["Tables"]["expenses"]["Update"];
export type BankAccount = Database["public"]["Tables"]["bank_accounts"]["Row"];
export type RecurringRule = Database["public"]["Tables"]["recurring_rules"]["Row"];
export type Transfer = Database["public"]["Tables"]["transfers"]["Row"];
