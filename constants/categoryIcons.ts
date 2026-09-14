import {
  Banknote,
  Briefcase,
  Building,
  Car,
  CircleDollarSign,
  Coffee,
  Coins,
  CreditCard,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  type LucideIcon,
  Package,
  PiggyBank,
  Plane,
  Receipt,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Category icon catalog — direct port of the mobile app's
 * components/ui/CategoryIcon.tsx. The shared `categories.icon` column holds
 * these NAME strings on rows written by either client's manage modal
 * (e.g. "utensils"), and legacy emoji on older seeds — resolve both.
 */

/** Create default stored by the mobile modal (data value, not a theme token). */
export const DEFAULT_CATEGORY_COLOR = "#10B981";

/** Mobile ICON_MAP — stored name → Lucide component. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  car: Car,
  fuel: Fuel,
  coffee: Coffee,
  briefcase: Briefcase,
  gift: Gift,
  building: Building,
  receipt: Receipt,
  "heart-pulse": HeartPulse,
  plane: Plane,
  film: Film,
  "graduation-cap": GraduationCap,
  landmark: Landmark,
  wallet: Wallet,
  "credit-card": CreditCard,
  banknote: Banknote,
  coins: Coins,
  "piggy-bank": PiggyBank,
  "trending-up": TrendingUp,
  tag: Tag,
  "circle-dollar-sign": CircleDollarSign,
  zap: Zap,
  wifi: Wifi,
  home: Home,
  shield: Shield,
  package: Package,
  smartphone: Smartphone,
  wrench: Wrench,
  sparkles: Sparkles,
};

/** Mobile EMOJI_TO_ICON_MAP — legacy emoji rows normalize to names. */
export const EMOJI_TO_ICON_NAME: Record<string, string> = {
  "🍔": "utensils",
  "🍕": "utensils",
  "☕": "coffee",
  "🛒": "shopping-bag",
  "🛍️": "shopping-bag",
  "🚗": "car",
  "⛽": "fuel",
  "✈️": "plane",
  "🏠": "home",
  "💡": "zap",
  "⚡": "zap",
  "📱": "smartphone",
  "📶": "wifi",
  "💊": "heart-pulse",
  "🏥": "heart-pulse",
  "🎬": "film",
  "🎮": "film",
  "📚": "graduation-cap",
  "🎓": "graduation-cap",
  "💼": "briefcase",
  "💰": "circle-dollar-sign",
  "💵": "banknote",
  "🪙": "coins",
  "🏦": "landmark",
  "🏛️": "landmark",
  "💳": "credit-card",
  "👛": "wallet",
  "📈": "trending-up",
  "🎁": "gift",
  "🛠️": "wrench",
  "📌": "tag",
  "🏷️": "tag",
  "✨": "sparkles",
};

/** Mobile SELECTABLE_ICONS — the curated picker strip, same order. */
export const SELECTABLE_CATEGORY_ICONS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: "utensils", label: "Food & Dining", icon: Utensils },
  { name: "coffee", label: "Cafe & Drinks", icon: Coffee },
  { name: "shopping-bag", label: "Shopping", icon: ShoppingBag },
  { name: "shopping-cart", label: "Groceries", icon: ShoppingCart },
  { name: "car", label: "Transport", icon: Car },
  { name: "fuel", label: "Fuel", icon: Fuel },
  { name: "home", label: "Housing / Rent", icon: Home },
  { name: "zap", label: "Utilities / Electricity", icon: Zap },
  { name: "wifi", label: "Internet / Phone", icon: Wifi },
  { name: "heart-pulse", label: "Healthcare & Medical", icon: HeartPulse },
  { name: "film", label: "Entertainment", icon: Film },
  { name: "graduation-cap", label: "Education", icon: GraduationCap },
  { name: "plane", label: "Travel & Vacation", icon: Plane },
  { name: "briefcase", label: "Salary & Work", icon: Briefcase },
  { name: "trending-up", label: "Investments & Returns", icon: TrendingUp },
  { name: "gift", label: "Gift & Bonus", icon: Gift },
  { name: "landmark", label: "Bank Account", icon: Landmark },
  { name: "wallet", label: "Digital Wallet", icon: Wallet },
  { name: "credit-card", label: "Credit Card", icon: CreditCard },
  { name: "banknote", label: "Cash & Notes", icon: Banknote },
  { name: "coins", label: "Coins & Savings", icon: Coins },
  { name: "piggy-bank", label: "Savings Deposit", icon: PiggyBank },
  { name: "receipt", label: "Bills & Invoices", icon: Receipt },
  { name: "tag", label: "Other & Miscellaneous", icon: Tag },
];

/** Money-inflow icon names — the category picker shows only these when the
 *  key's type is income; everything else (the spending keys) shows for
 *  expense. */
export const INCOME_ICON_NAMES: ReadonlySet<string> = new Set([
  "briefcase",
  "trending-up",
  "gift",
  "landmark",
  "wallet",
  "credit-card",
  "banknote",
  "coins",
  "piggy-bank",
]);

/**
 * Web-only divergence (2026-09-14, user request): picking an icon in the
 * entry-form category modal auto-assigns a color that fits the icon, so new
 * categories land visually distinct instead of all at DEFAULT_CATEGORY_COLOR.
 * These are stored data values (categories.color), not theme tokens.
 */
const ICON_COLORS: Record<string, string> = {
  utensils: "#F97316", // orange
  coffee: "#A16207", // roast brown
  "shopping-bag": "#EC4899", // pink
  "shopping-cart": "#22C55E", // fresh green
  car: "#3B82F6", // blue
  fuel: "#06B6D4", // cyan
  home: "#8B5CF6", // violet
  zap: "#EAB308", // electric yellow
  wifi: "#14B8A6", // teal
  "heart-pulse": "#EF4444", // red
  film: "#A855F7", // purple
  "graduation-cap": "#6366F1", // indigo
  plane: "#0EA5E9", // sky
  briefcase: "#4F46E5", // deep indigo
  "trending-up": "#10B981", // emerald
  gift: "#F43F5E", // rose
  landmark: "#0F766E", // dark teal
  wallet: "#7C3AED", // violet
  "credit-card": "#2563EB", // blue
  banknote: "#16A34A", // green
  coins: "#CA8A04", // gold
  "piggy-bank": "#FB7185", // soft rose
  receipt: "#64748B", // slate
  tag: "#6B7280", // gray
};

/** Color to seed for a freshly picked icon; unknown names fall back to the
 *  mobile create default. */
export function categoryColorForIcon(name: string): string {
  return ICON_COLORS[name] ?? DEFAULT_CATEGORY_COLOR;
}
