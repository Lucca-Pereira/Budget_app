/**
 * BankScreen.tsx
 *
 * Bank integration screen. Behaviour:
 *
 *  First connect
 *  ─────────────
 *  After OAuth completes, show a period picker ("Import from…") so the user
 *  decides how far back to pull transactions.  Once they confirm, all matching
 *  transactions are sent to the in-app notification centre (bell icon) and
 *  system-tray notifications are fired for every unknown merchant.
 *  lastSyncDate and firstSynced flags are persisted.
 *
 *  Subsequent syncs
 *  ─────────────────
 *  Only transactions newer than the stored lastSyncDate are fetched.
 *  A "Sync now" button triggers a manual refresh.
 *  Unknown merchants (not in the merchant→category mapping) also fire
 *  system-tray notifications.
 *
 *  The "Disconnect" button lives in Settings; this screen only shows a subtle
 *  status indicator at the top when connected.
 */

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, Linking, Pressable, ScrollView,
} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {spacing, typography} from '../theme';
import {
  getBankAuthUrl, fetchBankTransactions,
  saveBankTokens, clearBankTokens,
  isBankConnected, BankTransaction,
  categoriseTransactions, classifyCredit,
} from '../utils/bankApi';
import * as storage from '../utils/storage';
import {
  getBankFirstSynced, setBankFirstSynced,
  getBankLastSyncDate, saveBankLastSyncDate,
  getMerchantMap, saveMerchantEntry,
  getImportedTxIds, addImportedTxIds,
} from '../utils/storage';
import {fireBankTransactionNotification} from '../utils/notifications';
import {BankNotification} from '../types';
import DateTimePicker from '@react-native-community/datetimepicker';
import {format, subDays} from 'date-fns';

// ─── Period options for first-sync picker ─────────────────────────────────────

interface PeriodOption {
  label: string;
  description: string;
  getFromDate: () => string | null;
  isCustom?: boolean;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  {
    label: 'Last 7 days',
    description: 'Only very recent transactions',
    getFromDate: () => format(subDays(new Date(), 7), 'yyyy-MM-dd'),
  },
  {
    label: 'Last 30 days',
    description: 'About one month back',
    getFromDate: () => format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  },
  {
    label: 'All time',
    description: 'Everything available from your bank',
    getFromDate: () => null,
  },
  {
    label: 'Custom date…',
    description: 'Pick any specific start date',
    getFromDate: () => null,
    isCustom: true,
  },
];

// ─── Helper: build BankNotification from BankTransaction + category ───────────────

function makeBankNotification(
  tx: BankTransaction,
  categoryId: string | null,
  subCategoryId: string | null,
): BankNotification {
  return {
    id: uuidv4(),
    txId: tx.id,
    date: tx.date,
    amount: tx.amount,
    type: tx.type,
    merchantName: tx.merchantName ?? tx.description,
    description: tx.description,
    suggestedCategoryId: categoryId,
    suggestedSubCategoryId: subCategoryId,
  };
}

// ─── First-sync period picker modal ──────────────────────────────────────────

function PeriodPickerModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: (fromDate: string | null) => void;
  onCancel: () => void;
}) {
  const {colors} = useTheme();
  const [selected, setSelected] = useState(1); // default: Last 30 days
  const [customDate, setCustomDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleConfirm = () => {
    const opt = PERIOD_OPTIONS[selected];
    if (opt.isCustom) {
      onConfirm(format(customDate, 'yyyy-MM-dd'));
    } else {
      onConfirm(opt.getFromDate());
    }
  };

  return (
    <Modal transparent statusBarTranslucent animationType="slide" visible={visible} onRequestClose={onCancel}>
      <Pressable style={ppStyles.overlay} onPress={onCancel}>
        <View style={[ppStyles.sheet, {backgroundColor: colors.surface}]}>
          <View style={[ppStyles.handle, {backgroundColor: colors.border}]} />
          <Text style={[ppStyles.title, {color: colors.text}]}>Import transactions from…</Text>
          <Text style={[ppStyles.subtitle, {color: colors.textSecondary}]}>
            Choose how far back to pull your bank history. You can always sync more later.
          </Text>

          {PERIOD_OPTIONS.map((opt, idx) => (
            <TouchableOpacity
              key={opt.label}
              style={[ppStyles.option, {borderColor: colors.border, backgroundColor: colors.background},
                selected === idx && {borderColor: colors.primary, backgroundColor: colors.primary + '15'}]}
              onPress={() => {
                setSelected(idx);
                if (opt.isCustom) setShowDatePicker(true);
              }}
              activeOpacity={0.75}>
              <View style={[ppStyles.radio, {borderColor: selected === idx ? colors.primary : colors.border}]}>
                {selected === idx && <View style={[ppStyles.radioDot, {backgroundColor: colors.primary}]} />}
              </View>
              <View style={{flex: 1}}>
                <Text style={[ppStyles.optionLabel, {color: colors.text}, selected === idx && {color: colors.primary, fontWeight: '700'}]}>
                  {opt.isCustom && selected === idx
                    ? `From ${format(customDate, 'dd MMM yyyy')}`
                    : opt.label}
                </Text>
                <Text style={[ppStyles.optionDesc, {color: colors.textSecondary}]}>{opt.description}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {showDatePicker && (
            <DateTimePicker
              value={customDate}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={(_, date) => {
                setShowDatePicker(false);
                if (date) setCustomDate(date);
              }}
            />
          )}

          <TouchableOpacity
            style={[ppStyles.confirmBtn, {backgroundColor: colors.primary}]}
            onPress={handleConfirm}>
            <Text style={ppStyles.confirmBtnText}>Import Transactions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ppStyles.cancelBtn} onPress={onCancel}>
            <Text style={[ppStyles.cancelBtnText, {color: colors.textSecondary}]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const ppStyles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40},
  handle: {width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16},
  title: {fontSize: 19, fontWeight: '700', marginBottom: 6, textAlign: 'center'},
  subtitle: {fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20},
  option: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 10},
  radio: {width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  radioDot: {width: 10, height: 10, borderRadius: 5},
  optionLabel: {fontSize: 15, fontWeight: '600'},
  optionDesc: {fontSize: 12, marginTop: 2},
  confirmBtn: {borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 8},
  confirmBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  cancelBtn: {padding: 12, alignItems: 'center'},
  cancelBtnText: {fontSize: 14},
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BankScreen() {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const {categories, addBankNotifications, addExpense, addIncomeEvent, settings, bankNotifications} = useBudget();

  const [connected,            setConnected]            = useState(false);
  const [loading,              setLoading]              = useState(true);
  const [syncing,              setSyncing]              = useState(false);
  const [categorising,         setCategorising]         = useState(false);
  const [showPeriodPicker,     setShowPeriodPicker]     = useState(false);

  const [lastSync,             setLastSync]             = useState<string | null>(null);
  const pendingAccessTokenRef = useRef<string | null>(null);
  useEffect(() => {
    isBankConnected().then(async c => {
      setConnected(c);
      if (c) {
        const [date, firstSynced] = await Promise.all([
          getBankLastSyncDate(),
          getBankFirstSynced(),
        ]);
        setLastSync(date);
        // If they connected but navigated away before picking a period, show picker now
        if (!firstSynced) setShowPeriodPicker(true);
      }
      setLoading(false);
    });
  }, []);

  // Handle OAuth deep-link callback
  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (!url.startsWith('piggybudget://bank/callback')) return;
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const error = params.get('error');
      const cancelled = params.get('cancelled');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (cancelled) {
        // User cancelled — do nothing, just let them stay on the screen
        return;
      }
      if (error) {
        Alert.alert('Connection failed', decodeURIComponent(error));
        return;
      }
      if (accessToken) {
        await saveBankTokens(accessToken, refreshToken ?? '');
        setConnected(true);
        pendingAccessTokenRef.current = accessToken;

        const firstSynced = await getBankFirstSynced();
        if (!firstSynced) {
          setShowPeriodPicker(true);
        } else {
          const fromDate = await getBankLastSyncDate();
          syncTransactions(fromDate ?? undefined, accessToken);
        }
      }
    };

    const sub = Linking.addEventListener('url', ({url}) => handleUrl(url));
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });
    return () => sub.remove();
  }, []);

  // ── Sync ─────────────────────────────────────────────────────────────────────

  const syncTransactions = useCallback(async (fromDate?: string, accessToken?: string) => {
    setSyncing(true);
    try {
      const txs = await fetchBankTransactions(fromDate, accessToken);
      if (txs.length === 0) { setSyncing(false); return; }

      const [merchantMap, freshCategories, freshExpenses, importedTxIds] = await Promise.all([
        getMerchantMap(),
        storage.getCategories(),
        storage.getExpenses(),
        getImportedTxIds(),
      ]);

      const newTxs = txs.filter(tx => !importedTxIds.has(tx.id));
      if (newTxs.length === 0) { setSyncing(false); return; }

      // Unknown debits → Gemini
      const debitsToClassify = newTxs.filter(
        tx => tx.type === 'debit' && !merchantMap[(tx.merchantName ?? tx.description).toLowerCase().trim()]
      );
      let geminiMap: Record<string, {categoryId: string | null; subCategoryId: string | null}> = {};
      if (debitsToClassify.length > 0 && freshCategories.length > 0) {
        setSyncing(false); setCategorising(true);
        geminiMap = await categoriseTransactions(
          debitsToClassify.map(tx => ({id: tx.id, merchantName: tx.merchantName, description: tx.description, amount: tx.amount, bankCategory: tx.category})),
          freshCategories.map(cat => ({id: cat.id, name: cat.name, icon: cat.icon, subCategories: cat.subCategories.map(sub => ({id: sub.id, name: sub.name, icon: sub.icon}))})),
        );
        setCategorising(false); setSyncing(true);
      }

      const newNotifications: BankNotification[] = [];
      const unknownForNotif: Array<{tx: BankTransaction}> = [];

      for (const tx of newTxs) {
        const key = (tx.merchantName ?? tx.description).toLowerCase().trim();
        const mapped = merchantMap[key];

        if (tx.type === 'credit') {
          const cc = classifyCredit(tx, freshExpenses);
          if (cc.needsReview) {
            newNotifications.push({
              id: uuidv4(), txId: tx.id, date: tx.date, amount: tx.amount,
              type: 'credit', merchantName: tx.merchantName ?? tx.description,
              description: tx.description,
              suggestedCategoryId: null, suggestedSubCategoryId: null,
              reimbursementReason: cc.reason,
              suggestedIncomeType: 'reimbursement',
            });
          } else {
            addIncomeEvent(cc.event);
          }
        } else if (mapped) {
          // Known merchant → auto-expense, skip bell
          addExpense({id: uuidv4(), categoryId: mapped.categoryId!, subCategoryId: mapped.subCategoryId ?? undefined, amount: tx.amount, note: tx.merchantName ?? tx.description, date: tx.date, isRecurring: false});
        } else {
          const gemini = geminiMap[tx.id];
          const catId = gemini?.categoryId ?? null;
          if (catId) {
            // Gemini matched → auto-expense, skip bell
            addExpense({id: uuidv4(), categoryId: catId, subCategoryId: gemini?.subCategoryId ?? undefined, amount: tx.amount, note: tx.merchantName ?? tx.description, date: tx.date, isRecurring: false});
            // Learn this merchant so next sync skips Gemini entirely
            saveMerchantEntry(
              tx.merchantName ?? tx.description,
              catId,
              gemini?.subCategoryId ?? undefined,
            ).catch(() => {});
          } else {
            // No match → bell for manual review
            newNotifications.push(makeBankNotification(tx, null, null));
            unknownForNotif.push({tx});
          }
        }
      }

      if (newNotifications.length > 0) await addBankNotifications(newNotifications);

      const firedMerchants = new Set<string>();
      for (const {tx} of unknownForNotif) {
        const merchant = tx.merchantName ?? tx.description;
        if (!firedMerchants.has(merchant)) {
          firedMerchants.add(merchant);
          fireBankTransactionNotification({txId: tx.id, merchantName: merchant, amount: tx.amount, currency: settings.currency}).catch(() => {});
        }
      }

      await addImportedTxIds(newTxs.map(tx => tx.id));
      const now = format(new Date(), 'yyyy-MM-dd');
      await saveBankLastSyncDate(now);
      setLastSync(now);
    } catch (err: any) {
      Alert.alert('Sync failed', err?.message ?? 'Could not fetch transactions');
      if (err?.message?.includes('reconnect') || err?.message?.includes('expired')) {
        await clearBankTokens(); setConnected(false);
      }
    } finally {
      setSyncing(false);
    }
  }, [categories, addExpense, addIncomeEvent, addBankNotifications, settings.currency]);

  // Called when the user confirms the period picker on first connect
  const handleFirstSyncConfirm = useCallback(async (fromDate: string | null) => {
    setShowPeriodPicker(false);
    await setBankFirstSynced();
    await syncTransactions(fromDate ?? undefined, pendingAccessTokenRef.current ?? undefined);
    pendingAccessTokenRef.current = null;
  }, [syncTransactions]);

  const handleConnect = async () => {
    try {
      setLoading(true);
      const authUrl = await getBankAuthUrl();
      await Linking.openURL(authUrl);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not start bank connection');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (!connected) {
    return (
      <>
        <View style={s.centered}>
          <View style={s.connectCard}>
            <Text style={s.bankEmoji}>🏦</Text>
            <Text style={s.connectTitle}>Connect Your Bank</Text>
            <Text style={s.connectSubtitle}>
              Securely connect your bank account via Open Banking. Your credentials never touch our servers.
            </Text>
            <View style={s.featureList}>
              {[
                'Automatic transaction import',
                'Smart category matching',
                'No manual entry needed',
              ].map(f => (
                <View key={f} style={s.featureRow}>
                  <Text style={s.featureDot}>●</Text>
                  <Text style={[s.featureText, {color: colors.textSecondary}]}>{f}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[s.connectBtn, {backgroundColor: colors.primary}]} onPress={handleConnect}>
              <Text style={s.connectBtnText}>Connect Your Bank</Text>
            </TouchableOpacity>
            <Text style={[s.secureNote, {color: colors.textSecondary}]}>
              🔒 Powered by TrueLayer — PSD2 regulated open banking
            </Text>
          </View>
        </View>

        {/* First-sync period picker (shown immediately after OAuth) */}
        <PeriodPickerModal
          visible={showPeriodPicker}
          onConfirm={handleFirstSyncConfirm}
          onCancel={() => {
            setShowPeriodPicker(false);
            setBankFirstSynced();
          }}
        />
      </>
    );
  }

  // Connected state
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Status card */}
      <View style={[s.statusCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <View style={s.statusRow}>
          <View style={s.connectedDot} />
          <Text style={[s.statusText, {color: colors.text}]}>Bank connected</Text>
        </View>
        {lastSync && (
          <Text style={[s.lastSyncText, {color: colors.textSecondary}]}>Last synced: {lastSync}</Text>
        )}
        <TouchableOpacity style={[s.syncBtn, {borderColor: colors.border}]} onPress={() => syncTransactions(lastSync ?? undefined)} disabled={syncing || categorising}>
          {syncing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : categorising
            ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[s.syncBtnText, {color: colors.primary}]}>Categorising…</Text>
              </View>
            : <Text style={[s.syncBtnText, {color: colors.primary}]}>🔄  Sync now</Text>}
        </TouchableOpacity>
      </View>

      {/* Info card */}
      <View style={[s.infoCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <Text style={s.infoIcon}>🔔</Text>
        <View style={{flex: 1}}>
          <Text style={[s.infoTitle, {color: colors.text}]}>
            {bankNotifications.length > 0
              ? `${bankNotifications.length} transaction${bankNotifications.length !== 1 ? 's' : ''} waiting`
              : 'All caught up!'}
          </Text>
          <Text style={[s.infoSubtitle, {color: colors.textSecondary}]}>
            {bankNotifications.length > 0
              ? 'Tap the 🔔 bell on the Home screen to categorise them.'
              : 'No pending bank transactions. Sync to check for new ones.'}
          </Text>
        </View>
      </View>

      <View style={{height: 40}} />

      {/* Period picker for first-sync (edge case: shown when connected but not first-synced yet) */}
      <PeriodPickerModal
        visible={showPeriodPicker}
        onConfirm={handleFirstSyncConfirm}
        onCancel={() => {
          setShowPeriodPicker(false);
          setBankFirstSynced();
        }}
      />
    </ScrollView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  centered: {flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: spacing.lg},
  content: {padding: spacing.md},

  // Connect card
  connectCard: {width: '100%', alignItems: 'center'},
  bankEmoji: {fontSize: 64, marginBottom: spacing.md},
  connectTitle: {...typography.heading, color: colors.text, marginBottom: spacing.sm, textAlign: 'center'},
  connectSubtitle: {...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.md},
  featureList: {width: '100%', marginBottom: spacing.lg},
  featureRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs},
  featureDot: {color: colors.primary, marginRight: spacing.sm, fontSize: 8},
  featureText: {...typography.body},
  connectBtn: {borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: spacing.sm},
  connectBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  secureNote: {...typography.caption, textAlign: 'center', marginTop: spacing.xs},

  // Status card
  statusCard: {borderRadius: 14, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md},
  statusRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 4},
  connectedDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: spacing.sm},
  statusText: {...typography.body, flex: 1, fontWeight: '600'},
  lastSyncText: {...typography.caption, marginBottom: spacing.sm},
  syncBtn: {borderWidth: 1, borderRadius: 8, padding: spacing.xs, alignItems: 'center', marginTop: spacing.xs},
  syncBtnText: {...typography.body, fontWeight: '600'},

  // Info card
  infoCard: {flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: spacing.md, borderWidth: 1, gap: 12},
  infoIcon: {fontSize: 28},
  infoTitle: {...typography.body, fontWeight: '700'},
  infoSubtitle: {...typography.caption, marginTop: 3, lineHeight: 17},
});
