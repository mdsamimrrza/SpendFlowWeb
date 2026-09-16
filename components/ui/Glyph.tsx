"use client";

import {
  Banknote,
  Beer,
  BookOpen,
  Briefcase,
  Bus,
  Baby,
  Car,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  CupSoda,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  HelpCircle,
  Home,
  KeyRound,
  Laptop,
  Landmark,
  Lightbulb,
  type LucideIcon,
  Music,
  PawPrint,
  Pencil,
  PiggyBank,
  Pill,
  Plane,
  Plus,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { CATEGORY_ICONS, EMOJI_TO_ICON_NAME } from "@/constants/categoryIcons";

/**
 * Web icon layer: the shared DB stores category/account icons as emoji
 * (mobile writes them), but the web UI renders Lucide everywhere — this
 * resolves a stored glyph to the matching Lucide icon, with a type-aware
 * fallback so custom emoji never leak into the interface.
 */
const EMOJI_TO_LUCIDE: Record<string, LucideIcon> = {
  "🍔": UtensilsCrossed,
  "🍕": UtensilsCrossed,
  "🍽️": UtensilsCrossed,
  "🛒": ShoppingCart,
  "🛍️": ShoppingBag,
  "👜": ShoppingBag,
  "🚌": Bus,
  "🚗": Car,
  "🚕": Car,
  "✈️": Plane,
  "⛽": Fuel,
  "💡": Lightbulb,
  "🏥": HeartPulse,
  "❤️": HeartPulse,
  "📚": BookOpen,
  "🎓": GraduationCap,
  "🏠": Home,
  "🔑": KeyRound,
  "🎬": Clapperboard,
  "🎵": Music,
  "🎮": Gamepad2,
  "⚽": Dumbbell,
  "🏋️": Dumbbell,
  "🍺": Beer,
  "🥤": CupSoda,
  "☕": Coffee,
  "💊": Pill,
  "🐾": PawPrint,
  "👶": Baby,
  "💼": Briefcase,
  "💻": Laptop,
  "📈": TrendingUp,
  "🎁": Gift,
  "➕": Plus,
  "🎯": Target,
  "🧾": Receipt,
  "💰": Coins,
  "🪙": Coins,
  "💵": Banknote,
  "👛": Wallet,
  "💳": CreditCard,
  "📱": Smartphone,
  "🏦": Landmark,
  "👤": Pencil,
  "❓": HelpCircle,
  "✨": Sparkles,
  "🔧": Pencil,
  "📦": ShoppingBag,
  "🚿": Home,
  "📞": Smartphone,
};

/**
 * Category icon (stored value) → Lucide component. Mirrors the mobile
 * CategoryIcon resolution order: modern name ("utensils"), legacy emoji
 * normalized through the same EMOJI_TO_ICON_MAP mobile uses, then the local
 * emoji table, then a neutral fallback.
 */
/**
 * Own-property lookup for stored-value maps (NV hardening): a stored icon of
 * 'constructor'/'toString'/'__proto__' must never resolve an inherited member
 * to a non-component 'icon' — fall through to the neutral fallback instead.
 */
function ownIcon<K extends string | number | symbol, V>(map: Record<K, V>, key: string): V | undefined {
  return Object.hasOwn(map, key) ? map[key as K] : undefined;
}

export function categoryGlyph(icon: string | null | undefined): LucideIcon {
  if (!icon) return Tag;
  const trimmed = icon.trim();
  const named = ownIcon(CATEGORY_ICONS, trimmed.toLowerCase());
  if (named) return named;
  const viaEmojiName = ownIcon(EMOJI_TO_ICON_NAME, trimmed);
  if (viaEmojiName) {
    const resolved = ownIcon(CATEGORY_ICONS, viaEmojiName);
    if (resolved) return resolved;
  }
  return ownIcon(EMOJI_TO_LUCIDE, trimmed) ?? Tag;
}

/** Lucide names the mobile account presets store in `bank_accounts.icon`. */
const ACCOUNT_NAME_TO_LUCIDE: Record<string, LucideIcon> = {
  landmark: Landmark,
  smartphone: Smartphone,
  banknote: Banknote,
  "credit-card": CreditCard,
  "piggy-bank": PiggyBank,
  "trending-up": TrendingUp,
  tag: Tag,
  wallet: Wallet,
  coins: Coins,
};

/** Account icon → Lucide, falling back to the account_type. */
export function accountGlyph(icon: string | null | undefined, accountType?: string): LucideIcon {
  if (icon) {
    const byEmoji = ownIcon(EMOJI_TO_LUCIDE, icon.trim());
    if (byEmoji) return byEmoji;
    // Newer mobile rows store Lucide NAMES (e.g. 'landmark' from the account
    // type presets) rather than emoji — resolve those too.
    const byName = ownIcon(ACCOUNT_NAME_TO_LUCIDE, icon.trim());
    if (byName) return byName;
  }
  switch (accountType) {
    case "bank":
      return Landmark;
    case "wallet":
      return Wallet;
    case "cash":
      return Banknote;
    case "credit_card":
      return CreditCard;
    case "savings":
      return PiggyBank;
    case "investment":
      return TrendingUp;
    default:
      return Coins;
  }
}
