import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {Category, Expense, AppSettings, RolloverMap, Subscription} from '../types';
import * as storage from '../utils/storage';
import {currentMonth, computeRollover, prevMonth} from '../utils/helpers';

interface BudgetContextType {
  categories: Category[];
  expenses: Expense[];
  settings: AppSettings;
  rollovers: RolloverMap;
  subscriptions: Subscription[];
  isLoading: boolean;
  addCategory: (cat: Category) => void;
  updateCategory: (cat: Category) => void;
  deleteCategory: (id: string) => void;
  addExpense: (exp: Expense) => void;
  updateExpense: (exp: Expense) => void;
  deleteExpense: (id: string) => void;
  updateSettings: (s: AppSettings) => Promise<void>;
  updateRollovers: (map: RolloverMap) => Promise<void>;
  addSubscription: (sub: Subscription) => void;
  updateSubscription: (sub: Subscription) => void;
  deleteSubscription: (id: string) => void;
  effectiveBudget: (catId: string) => number;
  reload: () => Promise<void>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

/** Generate a subscription expense ID for a given month — deterministic so we never duplicate */
const subExpenseId = (subId: string, monthKey: string) => `sub_${subId}_${monthKey}`;

export const BudgetProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    currency: '€',
    incomeAmount: 0,
    notificationsEnabled: false,
    reminderHour: 20,
    reminderMinute: 0,
  });
  const [rollovers, setRollovers] = useState<RolloverMap>({});
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /** Inject subscription expenses for current month if not already present */
  const injectSubscriptionExpenses = useCallback(
    (subs: Subscription[], currentExpenses: Expense[], monthKey: string): Expense[] => {
      const [y, m] = monthKey.split('-').map(Number);
      const today = new Date();
      const todayDay = today.getDate();
      const isCurrentMonth = monthKey === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

      let updated = [...currentExpenses];
      let changed = false;

      for (const sub of subs) {
        if (!sub.isActive) continue;
        const expId = subExpenseId(sub.id, monthKey);
        const alreadyExists = updated.some(e => e.id === expId);
        if (alreadyExists) continue;

        // Only inject if billing day has passed (or it's a past month)
        if (isCurrentMonth && sub.dayOfMonth > todayDay) continue;

        const day = Math.min(sub.dayOfMonth, new Date(y, m, 0).getDate());
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        updated.push({
          id: expId,
          categoryId: sub.categoryId,
          amount: sub.amount,
          note: sub.name,
          date: dateStr,
          isRecurring: true,
          recurringDayOfMonth: sub.dayOfMonth,
        });
        changed = true;
      }

      if (changed) storage.saveExpenses(updated);
      return updated;
    },
    [],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    const [cats, exps, sett, rolls, subs] = await Promise.all([
      storage.getCategories(),
      storage.getExpenses(),
      storage.getSettings(),
      storage.getRollovers(),
      storage.getSubscriptions(),
    ]);
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const injected = subs.length > 0 ? (() => {
      const [y, mo] = month.split('-').map(Number);
      const today = new Date().getDate();
      let updated = [...exps];
      let changed = false;
      for (const sub of subs) {
        if (!sub.isActive) continue;
        const expId = subExpenseId(sub.id, month);
        if (updated.some(e => e.id === expId)) continue;
        if (sub.dayOfMonth > today) continue;
        const day = Math.min(sub.dayOfMonth, new Date(y, mo, 0).getDate());
        const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        updated.push({id: expId, categoryId: sub.categoryId, amount: sub.amount, note: sub.name, date: dateStr, isRecurring: true, recurringDayOfMonth: sub.dayOfMonth});
        changed = true;
      }
      if (changed) storage.saveExpenses(updated);
      return updated;
    })() : exps;

    setCategories(cats);
    setExpenses(injected);
    setSettings(sett);
    setRollovers(rolls);
    setSubscriptions(subs);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCategory = (cat: Category) => {
    setCategories(prev => { const u = [...prev, cat]; storage.saveCategories(u); return u; });
  };
  const updateCategory = (cat: Category) => {
    setCategories(prev => { const u = prev.map(c => c.id === cat.id ? cat : c); storage.saveCategories(u); return u; });
  };
  const deleteCategory = (id: string) => {
    setCategories(prev => { const u = prev.filter(c => c.id !== id); storage.saveCategories(u); return u; });
  };

  const addExpense = (exp: Expense) => {
    setExpenses(prev => { const u = [...prev, exp]; storage.saveExpenses(u); return u; });
  };
  const updateExpense = (exp: Expense) => {
    setExpenses(prev => { const u = prev.map(e => e.id === exp.id ? exp : e); storage.saveExpenses(u); return u; });
  };
  const deleteExpense = (id: string) => {
    setExpenses(prev => { const u = prev.filter(e => e.id !== id); storage.saveExpenses(u); return u; });
  };

  const updateSettings = async (s: AppSettings) => {
    setSettings(s);
    await storage.saveSettings(s);
  };
  const updateRollovers = async (map: RolloverMap) => {
    setRollovers(map);
    await storage.saveRollovers(map);
  };

  const addSubscription = (sub: Subscription) => {
    setSubscriptions(prev => {
      const updated = [...prev, sub];
      storage.saveSubscriptions(updated);
      // Immediately inject expense for current month if billing day has passed
      setExpenses(exps => {
        const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        return injectSubscriptionExpenses([sub], exps, month);
      });
      return updated;
    });
  };

  const updateSubscription = (sub: Subscription) => {
    setSubscriptions(prev => {
      const updated = prev.map(s => s.id === sub.id ? sub : s);
      storage.saveSubscriptions(updated);
      return updated;
    });
  };

  const deleteSubscription = (id: string) => {
    setSubscriptions(prev => {
      const updated = prev.filter(s => s.id !== id);
      storage.saveSubscriptions(updated);
      return updated;
    });
    // Remove generated expense for current month
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const expId = subExpenseId(id, month);
    setExpenses(prev => {
      const updated = prev.filter(e => e.id !== expId);
      storage.saveExpenses(updated);
      return updated;
    });
  };

  const effectiveBudget = useCallback(
    (catId: string): number => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || cat.budget === 0) return 0;
      const prev = prevMonth(currentMonth());
      const rollover = computeRollover(cat, prev, expenses, rollovers);
      return cat.budget + rollover;
    },
    [categories, expenses, rollovers],
  );

  return (
    <BudgetContext.Provider
      value={{
        categories, expenses, settings, rollovers, subscriptions, isLoading,
        addCategory, updateCategory, deleteCategory,
        addExpense, updateExpense, deleteExpense,
        updateSettings, updateRollovers,
        addSubscription, updateSubscription, deleteSubscription,
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
