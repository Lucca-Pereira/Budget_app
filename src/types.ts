/**
 * types.ts
 * Central type definitions for PiggyBudget.
 * All data models used across the app are defined here.
 */

// ─── Sub-category ─────────────────────────────────────────────────────────────
export interface SubCategory {
  id: string;
  name: string;
  icon: string;
  budget: number; // 0 = no limit
}

// ─── Category ─────────────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  budget: number;          // Monthly budget cap; 0 = no limit
  isFixed: boolean;        // True if amount never changes (e.g. rent)
  rollover: boolean;       // Carry unspent budget to next month
  weeklyTracking: boolean; // Show in weekly breakdown on dashboard
  expectedAmount: number;  // For variable bills — expected charge; 0 = not set
  buffer: number;          // Extra tolerance on top of expectedAmount; 0 = not set
  subCategories: SubCategory[];
}

// ─── Expense ──────────────────────────────────────────────────────────────────
export interface Expense {
  id: string;
  categoryId: string;
  subCategoryId?: string;
  amount: number;
  note: string;
  date: string;            // Format: "YYYY-MM-DD" (local time)
  isRecurring: boolean;
  recurringDayOfMonth?: number;
}

// ─── Income event ─────────────────────────────────────────────────────────────
export interface IncomeEvent {
  id: string;
  amount: number;
  note: string;
  date: string;  // "YYYY-MM-DD"
  type: 'reimbursement' | 'freelance' | 'gift' | 'other';
}

// ─── App settings ─────────────────────────────────────────────────────────────
export interface AppSettings {
  currency: string;
  incomeAmount: number;
  notificationsEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
}

// ─── Rollover map ─────────────────────────────────────────────────────────────
// Structure: { "YYYY-MM": { categoryId: rolloverAmount } }
export type RolloverMap = Record<string, Record<string, number>>;

// ─── Subscription ─────────────────────────────────────────────────────────────
export interface Subscription {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;   // Billing day (1–28)
  categoryId: string;
  subCategoryId?: string;
  isActive: boolean;
}

// ─── Bank notifications ───────────────────────────────────────────────────────
// A pending bank transaction sitting in the in-app notification centre.
// Splits are ephemeral UI state; only raw tx data is persisted.
export interface BankNotification {
  id: string;            // uuid – stable reference for the notification entry
  txId: string;          // Original bank transaction ID (dedup key)
  date: string;          // "YYYY-MM-DD"
  amount: number;        // Always positive
  type: 'debit' | 'credit'; // debit = spending, credit = income/refund
  merchantName: string;
  description: string;
  suggestedCategoryId: string | null;
  suggestedSubCategoryId: string | null;
  // Set when a credit is flagged as a probable reimbursement
  reimbursementReason?: string;
  suggestedIncomeType?: IncomeEvent['type'];
}
