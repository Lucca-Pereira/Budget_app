/**
 * bankApi.ts
 *
 * App-side utilities for the TrueLayer Data API integration.
 *
 * The app stores the user's access_token and refresh_token in AsyncStorage.
 * When the access_token expires (typically after 1 hour), the app calls
 * /api/bank/refresh to get a new one using the refresh_token.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {v4 as uuidv4} from 'uuid';
import {BACKEND_URL} from '../config';
import {Expense, IncomeEvent} from '../types';

const KEYS = {
  ACCESS_TOKEN:  '@bank_access_token',
  REFRESH_TOKEN: '@bank_refresh_token',
};

// ─── Token storage ────────────────────────────────────────────────────────────

export const saveBankTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  await AsyncStorage.multiSet([
    [KEYS.ACCESS_TOKEN,  accessToken],
    [KEYS.REFRESH_TOKEN, refreshToken],
  ]);
};

export const getBankTokens = async (): Promise<{accessToken: string | null; refreshToken: string | null}> => {
  const pairs = await AsyncStorage.multiGet([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN]);
  return {
    accessToken:  pairs[0][1],
    refreshToken: pairs[1][1],
  };
};

export const clearBankTokens = async (): Promise<void> => {
  await AsyncStorage.multiRemove([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN]);
};

export const isBankConnected = async (): Promise<boolean> => {
  const {accessToken} = await getBankTokens();
  return !!accessToken;
};

// ─── Institutions ─────────────────────────────────────────────────────────────

export interface BankInstitution {
  id: string;
  name: string;
  logo: string | null;
  transactionTotalDays: number;
}

/**
 * Fetch available banks for a country code (e.g. "ES").
 */
export const fetchInstitutions = async (country: string): Promise<BankInstitution[]> => {
  const res = await fetch(`${BACKEND_URL}/api/bank/institutions?country=${country.toLowerCase()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? 'Failed to fetch banks');
  }
  const data = await res.json();
  return data.institutions ?? [];
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Get the TrueLayer auth URL to open in the browser.
 * TrueLayer shows its own bank picker — no institution_id needed from us.
 */
export const getBankAuthUrl = async (): Promise<string> => {
  const res = await fetch(`${BACKEND_URL}/api/bank/auth`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? 'Failed to get auth URL');
  }
  const data = await res.json();
  return data.authUrl;
};

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Use the stored refresh_token to get a new access_token.
 * Saves the new tokens to storage and returns the new access_token.
 * Throws if the refresh token is also expired (user must reconnect).
 */
export const refreshBankToken = async (): Promise<string> => {
  const {refreshToken} = await getBankTokens();
  if (!refreshToken) throw new Error('Bank not connected');

  const res = await fetch(`${BACKEND_URL}/api/bank/refresh`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refresh_token: refreshToken}),
  });

  if (res.status === 401) {
    await clearBankTokens();
    throw new Error('Bank session expired — please reconnect your bank');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? 'Failed to refresh bank session');
  }

  const data = await res.json();
  await saveBankTokens(data.access_token, data.refresh_token);
  return data.access_token;
};

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface BankTransaction {
  id: string;
  date: string;              // "YYYY-MM-DD"
  amount: number;            // always positive
  type: 'debit' | 'credit'; // debit = spending, credit = income/refund
  description: string;
  merchantName: string | null;
  category: string | null;
  accountId: string;
}

/**
 * Fetch transactions. Automatically retries once with a refreshed token
 * if the server returns 401 (access token expired).
 */
export const fetchBankTransactions = async (fromDate?: string, initialAccessToken?: string): Promise<BankTransaction[]> => {
  let accessToken: string | null = initialAccessToken ?? null;
  if (!accessToken) {
    const tokens = await getBankTokens();
    accessToken = tokens.accessToken;
  }
  if (!accessToken) throw new Error('Bank not connected');

  const buildUrl = (token: string) => {
    const url = new URL(`${BACKEND_URL}/api/bank/transactions`);
    url.searchParams.set('access_token', token);
    if (fromDate) url.searchParams.set('date_from', fromDate);
    return url.toString();
  };

  let res = await fetch(buildUrl(accessToken));

  // If access token expired, refresh and retry once
  if (res.status === 401) {
    try {
      accessToken = await refreshBankToken();
      res = await fetch(buildUrl(accessToken));
    } catch {
      throw new Error('Bank session expired — please reconnect your bank');
    }
  }

  if (res.status === 401) {
    await clearBankTokens();
    throw new Error('Bank session expired — please reconnect your bank');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? 'Failed to fetch transactions');
  }

  const data = await res.json();
  return data.transactions ?? [];
};

// ─── Session check ────────────────────────────────────────────────────────────

/**
 * Verify the stored tokens are still usable.
 * Tries to refresh if access token is expired.
 * Returns false (and clears tokens) only if both tokens are dead.
 */
export const checkBankSession = async (): Promise<boolean> => {
  const {accessToken, refreshToken} = await getBankTokens();
  if (!accessToken) return false;
  if (!refreshToken) return true; // Can't verify, assume ok

  try {
    await refreshBankToken();
    return true;
  } catch {
    return false;
  }
};

// ─── Gemini categorisation ──────────────────────────────────────────────────────

export interface CategoryAssignment {
  id: string;
  categoryId: string | null;
  subCategoryId: string | null;
}

/**
 * Send debit transactions to the backend for Gemini-powered categorisation.
 * Returns a map of transaction id → { categoryId, subCategoryId }.
 * Falls back to empty map on error so the caller can handle gracefully.
 */
export const categoriseTransactions = async (
  transactions: Array<{id: string; merchantName: string | null; description: string; amount: number; bankCategory?: string | null}>,
  categories: Array<{id: string; name: string; icon: string; subCategories: Array<{id: string; name: string; icon: string}>}>,
): Promise<Record<string, CategoryAssignment>> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/categorise-transactions`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({transactions, categories}),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn('[categoriseTransactions] backend error:', res.status, errBody);
      return {};
    }
    const data = await res.json();

    const map: Record<string, CategoryAssignment> = {};
    for (const a of data.assignments ?? []) {
      map[a.id] = a;
    }
    return map;
  } catch (err) {
    console.warn('[categoriseTransactions] fetch error:', err);
    return {};
  }
};

// ─── Credit classification ─────────────────────────────────────────────────────

export interface CreditClassification {
  /** If true, send to bell for user review. If false, auto-import silently. */
  needsReview: boolean;
  /** The income event to import (or suggest in the bell). */
  event: IncomeEvent;
  /** Human-readable reason shown in the bell notification. */
  reason?: string;
}

/**
 * Classify an incoming credit transaction.
 *
 * - If an existing expense within the last 60 days matches the amount (within 5%),
 *   flag as a probable reimbursement and ask the user to confirm via the bell.
 * - Otherwise, auto-import silently as generic income.
 */
export function classifyCredit(
  tx: BankTransaction,
  existingExpenses: Expense[],
): CreditClassification {
  const creditDate = new Date(tx.date).getTime();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

  const match = existingExpenses
    .filter(exp => {
      const diff = creditDate - new Date(exp.date).getTime();
      return diff >= 0 && diff <= sixtyDaysMs;
    })
    .map(exp => ({exp, delta: Math.abs(exp.amount - tx.amount) / tx.amount}))
    .filter(({delta}) => delta <= 0.05)
    .sort((a, b) => a.delta - b.delta)[0];

  if (match) {
    const {exp} = match;
    return {
      needsReview: true,
      reason: exp.note
        ? `Possible reimbursement for "${exp.note}" (${exp.date})`
        : `Possible reimbursement for an expense on ${exp.date}`,
      event: {
        id: uuidv4(),
        amount: tx.amount,
        note: tx.merchantName ?? tx.description,
        date: tx.date,
        type: 'reimbursement',
      },
    };
  }

  return {
    needsReview: false,
    event: {
      id: uuidv4(),
      amount: tx.amount,
      note: tx.merchantName ?? tx.description,
      date: tx.date,
      type: 'other',
    },
  };
}

// ─── Legacy compatibility stubs ───────────────────────────────────────────────

/** @deprecated No-op — requisition_id no longer used with TrueLayer */
export const saveBankRequisitionId = async (_id: string): Promise<void> => {};
/** @deprecated No-op */
export const getBankRequisitionId = async (): Promise<string | null> => null;
/** @deprecated Use clearBankTokens instead */
export const clearBankRequisitionId = clearBankTokens;
