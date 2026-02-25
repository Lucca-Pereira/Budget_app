import AsyncStorage from '@react-native-async-storage/async-storage';
import {Category, Expense, AppSettings, RolloverMap} from '../types';

const KEYS = {
  CATEGORIES: '@budget_categories',
  EXPENSES:   '@budget_expenses',
  SETTINGS:   '@budget_settings',
  ROLLOVERS:  '@budget_rollovers',
};

export const getSettings = async (): Promise<AppSettings> => {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  return raw
    ? JSON.parse(raw)
    : {currency: '€', incomeAmount: 0, notificationsEnabled: false, reminderHour: 20, reminderMinute: 0};
};
export const saveSettings = async (s: AppSettings): Promise<void> => {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(s));
};

export const getCategories = async (): Promise<Category[]> => {
  const raw = await AsyncStorage.getItem(KEYS.CATEGORIES);
  return raw ? JSON.parse(raw) : [];
};
export const saveCategories = async (cats: Category[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.CATEGORIES, JSON.stringify(cats));
};

export const getExpenses = async (): Promise<Expense[]> => {
  const raw = await AsyncStorage.getItem(KEYS.EXPENSES);
  return raw ? JSON.parse(raw) : [];
};
export const saveExpenses = async (exps: Expense[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.EXPENSES, JSON.stringify(exps));
};

export const getRollovers = async (): Promise<RolloverMap> => {
  const raw = await AsyncStorage.getItem(KEYS.ROLLOVERS);
  return raw ? JSON.parse(raw) : {};
};
export const saveRollovers = async (map: RolloverMap): Promise<void> => {
  await AsyncStorage.setItem(KEYS.ROLLOVERS, JSON.stringify(map));
};
