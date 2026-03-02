export interface SubCategory {
  id: string;
  name: string;
  icon: string;
  budget: number; // 0 = no limit
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  budget: number;
  isFixed: boolean;
  rollover: boolean;
  weeklyTracking: boolean;
  expectedAmount: number; // for variable bills, 0 = not set
  buffer: number;         // buffer on top of expected, 0 = not set
  subCategories: SubCategory[];
}

export interface Expense {
  id: string;
  categoryId: string;
  subCategoryId?: string;
  amount: number;
  note: string;
  date: string;
  isRecurring: boolean;
  recurringDayOfMonth?: number;
}

export interface AppSettings {
  currency: string;
  incomeAmount: number;
  notificationsEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
}

export type RolloverMap = Record<string, Record<string, number>>;

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;
  categoryId: string;
  subCategoryId?: string;
  isActive: boolean;
}
