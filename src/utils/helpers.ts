import {format, addMonths, subMonths, getDaysInMonth} from 'date-fns';
import {Expense, Category, RolloverMap} from '../types';

export const currentMonth = (): string => format(new Date(), 'yyyy-MM');

/** Parse "YYYY-MM-DD" as LOCAL midnight — avoids UTC off-by-one bug (UTC+1, Spain) */
export const parseLocalDate = (dateStr: string): Date | null => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
};

/** Today as "YYYY-MM-DD" in local time */
export const todayString = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Convert Date to "YYYY-MM-DD" in local time */
export const dateToString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const monthLabel = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  return format(new Date(y, m - 1, 1), 'MMMM yyyy');
};

export const prevMonth = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  return format(subMonths(new Date(y, m - 1, 1), 1), 'yyyy-MM');
};

export const nextMonth = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  return format(addMonths(new Date(y, m - 1, 1), 1), 'yyyy-MM');
};

export const expensesForMonth = (expenses: Expense[], month: string): Expense[] =>
  expenses.filter(e => e.date.startsWith(month));

export const totalByCategory = (expenses: Expense[]): Record<string, number> =>
  expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.categoryId] = (acc[e.categoryId] || 0) + e.amount;
    return acc;
  }, {});

export const totalSpent = (expenses: Expense[]): number =>
  expenses.reduce((sum, e) => sum + e.amount, 0);

export const formatAmount = (amount: number, currency = '€'): string =>
  `${currency}${amount.toFixed(2)}`;

/**
 * Auto-generate recurring expense entries for a given month.
 * Checks if a recurring expense already has an entry that month;
 * if not, creates a new one on the configured day.
 */
export const generateRecurringForMonth = (
  allExpenses: Expense[],
  monthKey: string,
): Expense[] => {
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = getDaysInMonth(new Date(y, m - 1, 1));
  const monthExpenses = expensesForMonth(allExpenses, monthKey);

  const templates = allExpenses.filter(
    e => e.isRecurring && e.recurringDayOfMonth != null,
  );

  const newEntries: Expense[] = [];
  for (const tmpl of templates) {
    const day = Math.min(tmpl.recurringDayOfMonth!, daysInMonth);
    const alreadyExists = monthExpenses.some(
      e =>
        e.isRecurring &&
        e.categoryId === tmpl.categoryId &&
        e.note === tmpl.note &&
        e.amount === tmpl.amount,
    );
    if (!alreadyExists) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      newEntries.push({
        ...tmpl,
        id: `${tmpl.id}_${monthKey}`,
        date: new Date(y, m - 1, day).toISOString(),
      });
    }
  }
  return newEntries;
};

/**
 * Compute rollover credit for a category in a given month.
 * Rollover = previous month's (budget - spent), floored at 0.
 */
export const computeRollover = (
  cat: Category,
  prevMonthKey: string,
  allExpenses: Expense[],
  rollovers: RolloverMap,
): number => {
  if (!cat.rollover || cat.budget === 0) return 0;
  // Use stored rollover if available
  if (rollovers[prevMonthKey]?.[cat.id] != null) {
    return rollovers[prevMonthKey][cat.id];
  }
  // Compute from expenses
  const prevExpenses = expensesForMonth(allExpenses, prevMonthKey);
  const spent = prevExpenses
    .filter(e => e.categoryId === cat.id)
    .reduce((s, e) => s + e.amount, 0);
  return Math.max(cat.budget - spent, 0);
};

/** Build CSV string from expenses + categories */
export const buildCSV = (expenses: Expense[], categories: Category[], currency: string): string => {
  const catMap: Record<string, Category> = {};
  categories.forEach(c => { catMap[c.id] = c; });

  const header = 'Date,Category,Amount,Currency,Note,Recurring';
  const rows = [...expenses]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(e => {
      const cat = catMap[e.categoryId];
      const dateStr = format(new Date(e.date), 'yyyy-MM-dd');
      const note = `"${(e.note || '').replace(/"/g, '""')}"`;
      return [dateStr, cat?.name ?? 'Unknown', e.amount.toFixed(2), currency, note, e.isRecurring ? 'yes' : 'no'].join(',');
    });
  return [header, ...rows].join('\n');
};
