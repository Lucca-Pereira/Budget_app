/**
 * storage.ts
 * All AsyncStorage read/write helpers for PiggyBudget.
 *
 * Each data type has a dedicated key and a get/save pair.
 * JSON serialisation is handled here so callers work with typed objects.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {Category, Expense, AppSettings, RolloverMap, Subscription, BankNotification, IncomeEvent} from '../types';

// ─── Storage keys ─────────────────────────────────────────────────────────────
const KEYS = {
  CATEGORIES:         '@budget_categories',
  EXPENSES:           '@budget_expenses',
  SETTINGS:           '@budget_settings',
  ROLLOVERS:          '@budget_rollovers',
  SUBSCRIPTIONS:      '@budget_subscriptions',
  ONBOARDED:          '@budget_onboarded',
  INCOME_EVENTS:      '@budget_income_events',
  // Bank
  BANK_NOTIFICATIONS: '@bank_notifications',
  BANK_MERCHANT_MAP:  '@bank_merchant_mappings',
  BANK_LAST_SYNC:     '@bank_last_sync_date',
  BANK_FIRST_SYNCED:  '@bank_first_synced',
  BANK_IMPORTED_TX:   '@bank_imported_tx_ids',
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const getSettings = async (): Promise<AppSettings> => {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  return raw
    ? JSON.parse(raw)
    : {currency: '€', incomeAmount: 0, notificationsEnabled: false, reminderHour: 20, reminderMinute: 0};
};
export const saveSettings = async (s: AppSettings): Promise<void> =>
  AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(s));

// ─── Categories ───────────────────────────────────────────────────────────────
export const getCategories = async (): Promise<Category[]> => {
  const raw = await AsyncStorage.getItem(KEYS.CATEGORIES);
  return raw ? JSON.parse(raw) : [];
};
export const saveCategories = async (cats: Category[]): Promise<void> =>
  AsyncStorage.setItem(KEYS.CATEGORIES, JSON.stringify(cats));

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const getExpenses = async (): Promise<Expense[]> => {
  const raw = await AsyncStorage.getItem(KEYS.EXPENSES);
  return raw ? JSON.parse(raw) : [];
};
export const saveExpenses = async (exps: Expense[]): Promise<void> =>
  AsyncStorage.setItem(KEYS.EXPENSES, JSON.stringify(exps));

// ─── Rollovers ────────────────────────────────────────────────────────────────
export const getRollovers = async (): Promise<RolloverMap> => {
  const raw = await AsyncStorage.getItem(KEYS.ROLLOVERS);
  return raw ? JSON.parse(raw) : {};
};
export const saveRollovers = async (map: RolloverMap): Promise<void> =>
  AsyncStorage.setItem(KEYS.ROLLOVERS, JSON.stringify(map));

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const getSubscriptions = async (): Promise<Subscription[]> => {
  const raw = await AsyncStorage.getItem(KEYS.SUBSCRIPTIONS);
  return raw ? JSON.parse(raw) : [];
};
export const saveSubscriptions = async (subs: Subscription[]): Promise<void> =>
  AsyncStorage.setItem(KEYS.SUBSCRIPTIONS, JSON.stringify(subs));

// ─── Onboarding flag ──────────────────────────────────────────────────────────
export const getHasOnboarded = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(KEYS.ONBOARDED);
  return raw === 'true';
};
export const setHasOnboarded = async (): Promise<void> =>
  AsyncStorage.setItem(KEYS.ONBOARDED, 'true');

// ─── Bank notifications ────────────────────────────────────────────────────────
export const getBankNotifications = async (): Promise<BankNotification[]> => {
  const raw = await AsyncStorage.getItem(KEYS.BANK_NOTIFICATIONS);
  return raw ? JSON.parse(raw) : [];
};
export const saveBankNotifications = async (notifs: BankNotification[]): Promise<void> =>
  AsyncStorage.setItem(KEYS.BANK_NOTIFICATIONS, JSON.stringify(notifs));

// ─── Merchant → category mapping ──────────────────────────────────────────────
// key: normalised merchant name (lowercase trimmed)
// value: {categoryId, subCategoryId?}
export type MerchantMap = Record<string, {categoryId: string; subCategoryId?: string}>;

export const getMerchantMap = async (): Promise<MerchantMap> => {
  const raw = await AsyncStorage.getItem(KEYS.BANK_MERCHANT_MAP);
  return raw ? JSON.parse(raw) : {};
};
export const saveMerchantMap = async (map: MerchantMap): Promise<void> =>
  AsyncStorage.setItem(KEYS.BANK_MERCHANT_MAP, JSON.stringify(map));

// Convenience: add a single mapping entry
export const saveMerchantEntry = async (
  merchant: string,
  categoryId: string,
  subCategoryId?: string,
): Promise<void> => {
  const map = await getMerchantMap();
  map[merchant.toLowerCase().trim()] = {categoryId, subCategoryId};
  await saveMerchantMap(map);
};

// ─── Bank sync metadata ────────────────────────────────────────────────────────
export const getBankLastSyncDate = async (): Promise<string | null> =>
  AsyncStorage.getItem(KEYS.BANK_LAST_SYNC);

export const saveBankLastSyncDate = async (isoDate: string): Promise<void> =>
  AsyncStorage.setItem(KEYS.BANK_LAST_SYNC, isoDate);

export const getBankFirstSynced = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(KEYS.BANK_FIRST_SYNCED);
  return raw === 'true';
};
export const setBankFirstSynced = async (): Promise<void> =>
  AsyncStorage.setItem(KEYS.BANK_FIRST_SYNCED, 'true');

// ─── Imported transaction ID set ─────────────────────────────────────────────
// Tracks which bank txIds have already been processed to prevent duplicates
// on re-sync. Stored as a JSON array, used as a Set at runtime.
export const getImportedTxIds = async (): Promise<Set<string>> => {
  const raw = await AsyncStorage.getItem(KEYS.BANK_IMPORTED_TX);
  return new Set(raw ? JSON.parse(raw) : []);
};
export const addImportedTxIds = async (ids: string[]): Promise<void> => {
  const existing = await getImportedTxIds();
  ids.forEach(id => existing.add(id));
  // Keep the set bounded — drop oldest entries beyond 2000 to avoid unbounded growth
  const arr = Array.from(existing);
  const trimmed = arr.length > 2000 ? arr.slice(arr.length - 2000) : arr;
  await AsyncStorage.setItem(KEYS.BANK_IMPORTED_TX, JSON.stringify(trimmed));
};

// ─── Income events ─────────────────────────────────────────────────────────────
export const getIncomeEvents = async (): Promise<IncomeEvent[]> => {
  const raw = await AsyncStorage.getItem(KEYS.INCOME_EVENTS);
  return raw ? JSON.parse(raw) : [];
};
export const saveIncomeEvents = async (events: IncomeEvent[]): Promise<void> =>
  AsyncStorage.setItem(KEYS.INCOME_EVENTS, JSON.stringify(events));
