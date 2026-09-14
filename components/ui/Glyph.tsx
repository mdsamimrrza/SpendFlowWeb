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
export function categoryGlyph(icon: string | null | undefined): LucideIcon {
  if (!icon) return Tag;
  const trimmed = icon.trim();
  const named = CATEGORY_ICONS[trimmed.toLowerCase()];
  if (named) return named;
  const viaEmojiName = EMOJI_TO_ICON_NAME[trimmed];
  if (viaEmojiName && CATEGORY_ICONS[viaEmojiName]) return CATEGORY_ICONS[viaEmojiName];
  return EMOJI_TO_LUCIDE[trimmed] ?? Tag;
}

/** Account icon → Lucide, falling back to the account_type. */
export function accountGlyph(icon: string | null | undefined, accountType?: string): LucideIcon {
  if (icon && EMOJI_TO_LUCIDE[icon.trim()]) return EMOJI_TO_LUCIDE[icon.trim()];
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
