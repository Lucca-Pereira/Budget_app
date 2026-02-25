import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {Category, Expense, AppSettings, RolloverMap} from '../types';
import * as storage from '../utils/storage';
import {currentMonth, computeRollover, prevMonth} from '../utils/helpers';

interface BudgetContextType {
  categories: Category[];
  expenses: Expense[];
  settings: AppSettings;
  rollovers: RolloverMap;
  isLoading: boolean;
  addCategory: (cat: Category) => void;
  updateCategory: (cat: Category) => void;
  deleteCategory: (id: string) => void;
  addExpense: (exp: Expense) => void;
  updateExpense: (exp: Expense) => void;
  deleteExpense: (id: string) => void;
  updateSettings: (s: AppSettings) => Promise<void>;
  updateRollovers: (map: RolloverMap) => Promise<void>;
  /** Effective budget for a category this month (budget + rollover credit) */
  effectiveBudget: (catId: string) => number;
  reload: () => Promise<void>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

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
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [cats, exps, sett, rolls] = await Promise.all([
      storage.getCategories(),
      storage.getExpenses(),
      storage.getSettings(),
      storage.getRollovers(),
    ]);
    setCategories(cats);
    setExpenses(exps);
    setSettings(sett);
    setRollovers(rolls);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCategory = (cat: Category) => {
    setCategories(prev => {
      const updated = [...prev, cat];
      storage.saveCategories(updated);
      return updated;
    });
  };

  const updateCategory = (cat: Category) => {
    setCategories(prev => {
      const updated = prev.map(c => (c.id === cat.id ? cat : c));
      storage.saveCategories(updated);
      return updated;
    });
  };

  const deleteCategory = (id: string) => {
    setCategories(prev => {
      const updated = prev.filter(c => c.id !== id);
      storage.saveCategories(updated);
      return updated;
    });
  };

  const addExpense = (exp: Expense) => {
    setExpenses(prev => {
      const updated = [...prev, exp];
      storage.saveExpenses(updated);
      return updated;
    });
  };

  const updateExpense = (exp: Expense) => {
    setExpenses(prev => {
      const updated = prev.map(e => (e.id === exp.id ? exp : e));
      storage.saveExpenses(updated);
      return updated;
    });
  };

  const deleteExpense = (id: string) => {
    setExpenses(prev => {
      const updated = prev.filter(e => e.id !== id);
      storage.saveExpenses(updated);
      return updated;
    });
  };

  const updateSettings = async (s: AppSettings) => {
    setSettings(s);
    await storage.saveSettings(s);
  };

  const updateRollovers = async (map: RolloverMap) => {
    setRollovers(map);
    await storage.saveRollovers(map);
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
        categories,
        expenses,
        settings,
        rollovers,
        isLoading,
        addCategory,
        updateCategory,
        deleteCategory,
        addExpense,
        updateExpense,
        deleteExpense,
        updateSettings,
        updateRollovers,
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
