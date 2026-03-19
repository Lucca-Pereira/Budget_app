/**
 * helpers.ts
 * Pure utility functions used across PiggyBudget.
 *
 * Covers: date handling, month navigation, expense filtering/aggregation,
 * rollover computation, and CSV export.
 */

import {format, addMonths, subMonths, getDaysInMonth} from 'date-fns';
import {Expense, Category, RolloverMap, IncomeEvent} from '../types';

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Current month as "YYYY-MM" */
export const currentMonth = (): string => format(new Date(), 'yyyy-MM');

/** Today as "YYYY-MM-DD" in local time — avoids UTC off-by-one on UTC+1 (Spain/Ireland) */
export const todayString = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Convert a Date to "YYYY-MM-DD" in local time */
export const dateToString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Parse "YYYY-MM-DD" as local midnight.
 * Using `new Date(str)` would parse as UTC, causing off-by-one on UTC+ zones.
 * Returns null if the string is invalid.
 */
export const parseLocalDate = (dateStr: string): Date | null => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
};

// ─── Month navigation ─────────────────────────────────────────────────────────

/** "YYYY-MM" → "Month YYYY" display label */
export const monthLabel = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  return format(new Date(y, m - 1, 1), 'MMMM yyyy');
};

/** Step one month back */
export const prevMonth = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  return format(subMonths(new Date(y, m - 1, 1), 1), 'yyyy-MM');
};

/** Step one month forward */
export const nextMonth = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  return format(addMonths(new Date(y, m - 1, 1), 1), 'yyyy-MM');
};

// ─── Week helpers ─────────────────────────────────────────────────────────────

/**
 * Current week number within the month (1–4).
 * Week 1 = days 1–7, Week 2 = 8–14, Week 3 = 15–21, Week 4 = 22+.
 */
export const currentWeekOfMonth = (): number => {
  const day = new Date().getDate();
  if (day <= 7)  return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
};

/** All expenses within a specific week of a given month */
export const expensesForWeek = (expenses: Expense[], month: string, week: number): Expense[] => {
  const weekStart = (week - 1) * 7 + 1;
  const weekEnd   = week === 4 ? 31 : week * 7;
  return expensesForMonth(expenses, month).filter(e => {
    const day = parseInt(e.date.split('-')[2], 10);
    return day >= weekStart && day <= weekEnd;
  });
};

// ─── Expense aggregation ──────────────────────────────────────────────────────

/** All expenses whose date starts with the given "YYYY-MM" key */
export const expensesForMonth = (expenses: Expense[], month: string): Expense[] =>
  expenses.filter(e => e.date.startsWith(month));

/** Sum expenses grouped by categoryId → { categoryId: totalAmount } */
export const totalByCategory = (expenses: Expense[]): Record<string, number> =>
  expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.categoryId] = (acc[e.categoryId] || 0) + e.amount;
    return acc;
  }, {});

/** Total of all expense amounts in a list */
export const totalSpent = (expenses: Expense[]): number =>
  expenses.reduce((sum, e) => sum + e.amount, 0);

/** Total of all income event amounts in a list */
export const totalReceived = (events: IncomeEvent[]): number =>
  events.reduce((sum, e) => sum + e.amount, 0);

/** All income events whose date starts with the given "YYYY-MM" key */
export const incomeEventsForMonth = (events: IncomeEvent[], month: string): IncomeEvent[] =>
  events.filter(e => e.date.startsWith(month));

/** Format a number as a currency string, e.g. "€12.50" */
export const formatAmount = (amount: number, currency = '€'): string =>
  `${currency}${amount.toFixed(2)}`;

// ─── Rollover ─────────────────────────────────────────────────────────────────

/**
 * Compute the rollover credit for a category from the previous month.
 * Rollover = max(budget - spent, 0).
 * Uses the stored RolloverMap if available; otherwise recomputes from expenses.
 */
export const computeRollover = (
  cat: Category,
  prevMonthKey: string,
  allExpenses: Expense[],
  rollovers: RolloverMap,
): number => {
  if (!cat.rollover || cat.budget === 0) return 0;
  if (rollovers[prevMonthKey]?.[cat.id] != null) return rollovers[prevMonthKey][cat.id];
  const spent = expensesForMonth(allExpenses, prevMonthKey)
    .filter(e => e.categoryId === cat.id)
    .reduce((s, e) => s + e.amount, 0);
  return Math.max(cat.budget - spent, 0);
};

// ─── CSV export ───────────────────────────────────────────────────────────────

/** Build a CSV string from all expenses and income events for sharing/export */
export const buildCSV = (expenses: Expense[], categories: Category[], currency: string, incomeEvents: IncomeEvent[] = []): string => {
  const catMap: Record<string, Category> = Object.fromEntries(categories.map(c => [c.id, c]));
  const header = 'Date,Type,Category,Amount,Currency,Note,Recurring';

  const expenseRows = expenses.map(e => {
    const cat  = catMap[e.categoryId];
    const note = `"${(e.note || '').replace(/"/g, '""')}"`;
    return {date: e.date, row: [e.date, 'expense', cat?.name ?? 'Unknown', e.amount.toFixed(2), currency, note, e.isRecurring ? 'yes' : 'no'].join(',')};
  });

  const incomeRows = incomeEvents.map(ev => {
    const note = `"${(ev.note || '').replace(/"/g, '""')}"`;
    return {date: ev.date, row: [ev.date, 'income', ev.type, ev.amount.toFixed(2), currency, note, 'no'].join(',')};
  });

  const rows = [...expenseRows, ...incomeRows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => r.row);

  return [header, ...rows].join('\n');
};
