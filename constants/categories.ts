/** Default category seeds — mirror mobile constants/categories.ts (9 expense + 6 income). */
export interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
  type: "expense" | "income";
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Food & Dining", icon: "🍔", color: "#EF6C00", type: "expense" },
  { name: "Groceries", icon: "🛒", color: "#2E7D32", type: "expense" },
  { name: "Transport", icon: "🚌", color: "#0277BD", type: "expense" },
  { name: "Shopping", icon: "🛍️", color: "#BA68C8", type: "expense" },
  { name: "Bills & Utilities", icon: "💡", color: "#FBC02D", type: "expense" },
  { name: "Health", icon: "🏥", color: "#E53935", type: "expense" },
  { name: "Education", icon: "📚", color: "#5C6BC0", type: "expense" },
  { name: "Rent", icon: "🏠", color: "#8D6E63", type: "expense" },
  { name: "Entertainment", icon: "🎬", color: "#EC407A", type: "expense" },
  { name: "Salary", icon: "💼", color: "#2E7D32", type: "income" },
  { name: "Freelance", icon: "💻", color: "#0277BD", type: "income" },
  { name: "Investment", icon: "📈", color: "#6D4C41", type: "income" },
  { name: "Rental Income", icon: "🔑", color: "#00897B", type: "income" },
  { name: "Gifts", icon: "🎁", color: "#D81B60", type: "income" },
  { name: "Other Income", icon: "➕", color: "#546E7A", type: "income" },
];

/** Fallback category names used when reassigning before a category delete (mobile parity). */
export const FALLBACK_EXPENSE_CATEGORY = "Other Income";
