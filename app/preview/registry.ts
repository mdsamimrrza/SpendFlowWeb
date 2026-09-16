/**
 * Screen registry for the /preview/[screen] design-preview routes.
 * Each entry is the mock-data-only page (no auth, no network) used by
 * scripts/shot-preview.mjs for the mobile-first overflow checks.
 * Every component here declares "use client" itself.
 */
import type { ComponentType } from "react";
import Accounts from "./screens/accounts";
import Analytics from "./screens/analytics";
import Bin from "./screens/bin";
import Bullion from "./screens/bullion";
import Categories from "./screens/categories";
import Dash from "./screens/dash";
import Expense from "./screens/expense";
import Export from "./screens/export";
import History from "./screens/history";
import Profile from "./screens/profile";
import ProfitLoss from "./screens/profit-loss";
import Recurring from "./screens/recurring";
import Settings from "./screens/settings";
import TransferLog from "./screens/transfer-log";
import Transfer from "./screens/transfer";

export const SCREENS: Record<string, ComponentType> = {
  accounts: Accounts,
  analytics: Analytics,
  bin: Bin,
  bullion: Bullion,
  categories: Categories,
  dash: Dash,
  expense: Expense,
  export: Export,
  history: History,
  profile: Profile,
  "profit-loss": ProfitLoss,
  recurring: Recurring,
  settings: Settings,
  "transfer-log": TransferLog,
  transfer: Transfer,
};
