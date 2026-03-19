/**
 * receiptApi.ts
 *
 * Sends a receipt image (base64) to the PiggyBudget backend.
 * The backend handles the AI call — no API keys live in the app.
 *
 * Shape of ReceiptItem and ReceiptResult is unchanged so
 * ReceiptScannerScreen.tsx needs zero modifications.
 */

import {Category} from '../types';
import {BACKEND_URL} from '../config';

export interface ReceiptItem {
  description: string;
  amount: number;
  suggestedCategoryId: string | null;
  suggestedSubCategoryId: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ReceiptResult {
  storeName: string | null;
  date: string | null;   // "YYYY-MM-DD" or null
  items: ReceiptItem[];
  total: number | null;
}

export async function scanReceipt(
  base64Image: string,
  imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  categories: Category[],
): Promise<ReceiptResult> {
  console.log('Sending to:', `${BACKEND_URL}/api/scan-receipt`);
  const response = await fetch(`${BACKEND_URL}/api/scan-receipt`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      image: base64Image,
      mediaType: imageMediaType,
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        subCategories: cat.subCategories.map(sub => ({
          id: sub.id,
          name: sub.name,
          icon: sub.icon,
        })),
      })),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error ?? `Server error ${response.status}`);
  }

  return response.json() as Promise<ReceiptResult>;
}
