/**
 * BudgetContext.tsx
 *
 * Global state for PiggyBudget. Provides all data (categories, expenses,
 * settings, rollovers, subscriptions) and the actions to mutate them.
 *
 * All persistence is handled here via storage utils — screens never write
 * to AsyncStorage directly.
 *
 * Subscription injection: when subscriptions are loaded (or a new one is
 * added), expenses for the current month are automatically generated if
 * the billing day has already passed. A deterministic ID (sub_{id}_{month})
 * prevents duplicates on every reload.
 */

import React, {createContext, useContext, useEffect, useState, useCallback} from 'react';
import {Category, Expense, AppSettings, RolloverMap, Subscription, BankNotification, IncomeEvent} from '../types';
import * as storage from '../utils/storage';
import {currentMonth, computeRollover, prevMonth} from '../utils/helpers';

// ─── Built-in categories ───────────────────────────────────────────────────────

export const SUBSCRIPTIONS_CATEGORY_ID = '__subscriptions__';

const SUBSCRIPTIONS_CATEGORY: Category = {
  id: SUBSCRIPTIONS_CATEGORY_ID,
  name: 'Subscriptions',
  icon: '🔄',
  color: '#6366F1',
  budget: 0,
  isFixed: false,
  rollover: false,
  weeklyTracking: false,
  expectedAmount: 0,
  buffer: 0,
  subCategories: [],
};

// ─── Context shape ────────────────────────────────────────────────────────────

interface BudgetContextType {
  categories:        Category[];
  expenses:          Expense[];
  settings:          AppSettings;
  rollovers:         RolloverMap;
  subscriptions:     Subscription[];
  bankNotifications: BankNotification[];
  incomeEvents:      IncomeEvent[];
  isLoading:         boolean;

  addCategory:    (cat: Category) => void;
  updateCategory: (cat: Category) => void;
  deleteCategory: (id: string) => void;

  addExpense:    (exp: Expense) => void;
  updateExpense: (exp: Expense) => void;
  deleteExpense: (id: string) => void;

  updateSettings:  (s: AppSettings) => Promise<void>;
  updateRollovers: (map: RolloverMap) => Promise<void>;

  addSubscription:    (sub: Subscription) => void;
  updateSubscription: (sub: Subscription) => void;
  deleteSubscription: (id: string) => void;

  addIncomeEvent:    (event: IncomeEvent) => void;
  updateIncomeEvent: (event: IncomeEvent) => void;
  deleteIncomeEvent: (id: string) => void;

  /** Append new bank notifications (skips duplicates by txId) */
  addBankNotifications: (notifs: BankNotification[]) => Promise<void>;
  /** Confirm a notification: adds expense(s) then removes it from the queue */
  confirmBankNotification: (id: string, expensesToAdd: Expense[]) => void;
  /** Dismiss without adding an expense */
  removeBankNotification: (id: string) => void;
  /** Dismiss the entire queue */
  clearBankNotifications: () => Promise<void>;

  /** Budget for a category including any rollover credit from last month */
  effectiveBudget: (catId: string) => number;

  reload: () => Promise<void>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic expense ID for a subscription in a given month — prevents duplicates on reload */
const subExpenseId = (subId: string, monthKey: string) => `sub_${subId}_${monthKey}`;

/**
 * Inject auto-generated subscription expenses for a given month.
 * Only adds an expense if the billing day has passed and it doesn't already exist.
 * Persists to storage when any new expenses are added.
 */
function injectSubscriptionExpenses(
  subs: Subscription[],
  currentExpenses: Expense[],
  monthKey: string,
): Expense[] {
  const [y, m] = monthKey.split('-').map(Number);
  const today = new Date();
  const isCurrentMonth =
    monthKey ===
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  let updated = [...currentExpenses];
  let changed = false;

  for (const sub of subs) {
    if (!sub.isActive) continue;

    const expId = subExpenseId(sub.id, monthKey);
    if (updated.some(e => e.id === expId)) continue;

    // Skip if we're in the current month and the billing day hasn't arrived yet
    if (isCurrentMonth && sub.dayOfMonth > today.getDate()) continue;

    // Clamp to last day of month (e.g. day 31 in February → 28/29)
    const day = Math.min(sub.dayOfMonth, new Date(y, m, 0).getDate());
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    updated.push({
      id: expId,
      categoryId: sub.categoryId,
      amount: sub.amount,
      note: sub.name,
      date,
      isRecurring: true,
      recurringDayOfMonth: sub.dayOfMonth,
    });
    changed = true;
  }

  if (changed) storage.saveExpenses(updated);
  return updated;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const BudgetProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [categories,        setCategories]        = useState<Category[]>([]);
  const [expenses,          setExpenses]          = useState<Expense[]>([]);
  const [settings,          setSettings]          = useState<AppSettings>({
    currency: '€', incomeAmount: 0,
    notificationsEnabled: false, reminderHour: 20, reminderMinute: 0,
  });
  const [rollovers,         setRollovers]         = useState<RolloverMap>({});
  const [subscriptions,     setSubscriptions]     = useState<Subscription[]>([]);
  const [bankNotifications, setBankNotifications] = useState<BankNotification[]>([]);
  const [incomeEvents,      setIncomeEvents]      = useState<IncomeEvent[]>([]);
  const [isLoading,         setIsLoading]         = useState(true);

  // Load all data from storage, then inject any due subscription expenses
  const load = useCallback(async () => {
    setIsLoading(true);
    const [cats, exps, sett, rolls, subs, bankNotifs, incomeEvs] = await Promise.all([
      storage.getCategories(),
      storage.getExpenses(),
      storage.getSettings(),
      storage.getRollovers(),
      storage.getSubscriptions(),
      storage.getBankNotifications(),
      storage.getIncomeEvents(),
    ]);
    const month = currentMonth();
    const injected = subs.length > 0 ? injectSubscriptionExpenses(subs, exps, month) : exps;
    // Ensure the built-in Subscriptions category always exists
    const ensuredCats = cats.some(c => c.id === SUBSCRIPTIONS_CATEGORY_ID)
      ? cats
      : [...cats, SUBSCRIPTIONS_CATEGORY];
    if (ensuredCats.length !== cats.length) storage.saveCategories(ensuredCats);
    setCategories(ensuredCats);
    setExpenses(injected);
    setSettings(sett);
    setRollovers(rolls);
    setSubscriptions(subs);
    setBankNotifications(bankNotifs);
    setIncomeEvents(incomeEvs);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Category actions ───────────────────────────────────────────────────────

  const addCategory = (cat: Category) =>
    setCategories(prev => { const u = [...prev, cat]; storage.saveCategories(u); return u; });

  const updateCategory = (cat: Category) =>
    setCategories(prev => { const u = prev.map(c => c.id === cat.id ? cat : c); storage.saveCategories(u); return u; });

  const deleteCategory = (id: string) =>
    setCategories(prev => { const u = prev.filter(c => c.id !== id); storage.saveCategories(u); return u; });

  // ── Expense actions ────────────────────────────────────────────────────────

  const addExpense = (exp: Expense) =>
    setExpenses(prev => { const u = [...prev, exp]; storage.saveExpenses(u); return u; });

  const updateExpense = (exp: Expense) =>
    setExpenses(prev => { const u = prev.map(e => e.id === exp.id ? exp : e); storage.saveExpenses(u); return u; });

  const deleteExpense = (id: string) =>
    setExpenses(prev => { const u = prev.filter(e => e.id !== id); storage.saveExpenses(u); return u; });

  // ── Settings / rollovers ───────────────────────────────────────────────────

  const updateSettings = async (s: AppSettings) => {
    setSettings(s);
    await storage.saveSettings(s);
  };

  const updateRollovers = async (map: RolloverMap) => {
    setRollovers(map);
    await storage.saveRollovers(map);
  };

  // ── Subscription actions ───────────────────────────────────────────────────

  const addSubscription = (sub: Subscription) => {
    setSubscriptions(prev => {
      const updated = [...prev, sub];
      storage.saveSubscriptions(updated);
      // Immediately inject expense if billing day has already passed this month
      setExpenses(exps => injectSubscriptionExpenses([sub], exps, currentMonth()));
      return updated;
    });
  };

  const updateSubscription = (sub: Subscription) =>
    setSubscriptions(prev => {
      const updated = prev.map(s => s.id === sub.id ? sub : s);
      storage.saveSubscriptions(updated);
      return updated;
    });

  const deleteSubscription = (id: string) => {
    setSubscriptions(prev => {
      const updated = prev.filter(s => s.id !== id);
      storage.saveSubscriptions(updated);
      return updated;
    });
    // Remove the auto-generated expense for the current month
    const expId = subExpenseId(id, currentMonth());
    setExpenses(prev => {
      const updated = prev.filter(e => e.id !== expId);
      storage.saveExpenses(updated);
      return updated;
    });
  };

  // ── Income event actions ───────────────────────────────────────────────────

  const addIncomeEvent = (event: IncomeEvent) =>
    setIncomeEvents(prev => { const u = [...prev, event]; storage.saveIncomeEvents(u); return u; });

  const updateIncomeEvent = (event: IncomeEvent) =>
    setIncomeEvents(prev => { const u = prev.map(e => e.id === event.id ? event : e); storage.saveIncomeEvents(u); return u; });

  const deleteIncomeEvent = (id: string) =>
    setIncomeEvents(prev => { const u = prev.filter(e => e.id !== id); storage.saveIncomeEvents(u); return u; });

  // ── Bank notification actions ──────────────────────────────────────────────

  const addBankNotifications = useCallback(async (notifs: BankNotification[]) => {
    setBankNotifications(prev => {
      const existingTxIds = new Set(prev.map(n => n.txId));
      const newOnes = notifs.filter(n => !existingTxIds.has(n.txId));
      if (newOnes.length === 0) return prev;
      const updated = [...prev, ...newOnes];
      storage.saveBankNotifications(updated);
      return updated;
    });
  }, []);

  const confirmBankNotification = useCallback((id: string, expensesToAdd: Expense[]) => {
    setExpenses(prev => {
      const u = [...prev, ...expensesToAdd];
      storage.saveExpenses(u);
      return u;
    });
    setBankNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      storage.saveBankNotifications(updated);
      return updated;
    });
  }, []);

  const removeBankNotification = useCallback((id: string) => {
    setBankNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      storage.saveBankNotifications(updated);
      return updated;
    });
  }, []);

  const clearBankNotifications = useCallback(async () => {
    setBankNotifications([]);
    await storage.saveBankNotifications([]);
  }, []);

  // ── Derived helpers ────────────────────────────────────────────────────────

  const effectiveBudget = useCallback(
    (catId: string): number => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || cat.budget === 0) return 0;
      const rollover = computeRollover(cat, prevMonth(currentMonth()), expenses, rollovers);
      return cat.budget + rollover;
    },
    [categories, expenses, rollovers],
  );

  return (
    <BudgetContext.Provider value={{
      categories, expenses, settings, rollovers, subscriptions, bankNotifications, incomeEvents, isLoading,
      addCategory, updateCategory, deleteCategory,
      addExpense, updateExpense, deleteExpense,
      updateSettings, updateRollovers,
      addSubscription, updateSubscription, deleteSubscription,
      addIncomeEvent, updateIncomeEvent, deleteIncomeEvent,
      addBankNotifications, confirmBankNotification, removeBankNotification, clearBankNotifications,
      effectiveBudget,
      reload: load,
    }}>
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudget = (): BudgetContextType => {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used inside BudgetProvider');
  return ctx;
};
