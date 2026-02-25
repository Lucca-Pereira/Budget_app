export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  budget: number;
  isFixed: boolean;
  rollover: boolean;
}

export interface Expense {
  id: string;
  categoryId: string;
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
