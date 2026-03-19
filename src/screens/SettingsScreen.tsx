/**
 * SettingsScreen.tsx
 *
 * App-wide configuration screen, organised into sections:
 *  - Categories — list, edit, delete, add via swipeable bottom sheet
 *  - Budget — currency symbol and monthly income (auto-saves on blur)
 *  - Appearance — light/dark/system mode and colour palette picker
 *  - Notifications — daily reminder toggle and time picker
 *  - More — navigation shortcuts to Subscriptions and Income
 *  - Bank — full bank connection, sync, and disconnect UI
 *  - Data — export all expenses as CSV
 *
 * BottomSheet: custom modal that slides up from the bottom.
 * Pan responder is attached only to the drag handle at the top —
 * scrolling inside the form content never triggers a dismiss.
 */
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Share, Platform, Modal, Pressable,
  PanResponder, Animated, Switch, Linking, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation} from '@react-navigation/native';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme, ThemeMode} from '../context/ThemeContext';
import {PALETTES, PaletteKey, spacing, typography} from '../theme';
import {buildCSV} from '../utils/helpers';
import {
  requestPermissions, scheduleDailyReminder, cancelDailyReminder,
  fireBankTransactionNotification,
} from '../utils/notifications';
import {
  isBankConnected, clearBankTokens, getBankAuthUrl,
  fetchBankTransactions, saveBankTokens, BankTransaction,
  categoriseTransactions, classifyCredit,
} from '../utils/bankApi';
import * as storage from '../utils/storage';
import {
  getBankFirstSynced, setBankFirstSynced,
  getBankLastSyncDate, saveBankLastSyncDate,
  getMerchantMap, saveMerchantEntry,
  getImportedTxIds, addImportedTxIds,
} from '../utils/storage';
import {format, subDays} from 'date-fns';
import {Category, SubCategory, BankNotification, Expense} from '../types';
import {ConfirmModal, ToastModal} from '../components/AppModals';

const PRESET_COLORS = ['#FF6B6B','#FFA36C','#FFD93D','#6BCB77','#4D96FF','#C77DFF','#F72585','#4CC9F0'];
const PRESET_ICONS  = ['🏠','🚗','🍔','🛒','💊','🎬','✈️','👕','📚','💻','🎮','🐾','💪','☕','🍷','💰'];

/** Returns a darkened version of a hex colour (e.g. for "saved" state buttons). */
function darkenColor(hex: string, pct = 25): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - Math.round(2.55 * pct));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(2.55 * pct));
  const b = Math.max(0, (n & 0xff) - Math.round(2.55 * pct));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ─── Bank period picker ───────────────────────────────────────────────────────

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
              style={[
                ppStyles.option,
                {borderColor: colors.border, backgroundColor: colors.background},
                selected === idx && {borderColor: colors.primary, backgroundColor: colors.primary + '15'},
              ]}
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

// ─── Swipeable bottom sheet ───────────────────────────────────────────────────
function BottomSheet({visible, onClose, title, children}: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const dragY = useRef(new Animated.Value(0)).current;

  const dismiss = onClose;

  // Pan ONLY on the drag handle area at the top
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => { if (g.dy > 0) dragY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      dragY.setValue(0);
      if (g.dy > 60 || g.vy > 0.8) {
        dismiss();
      } else {
        Animated.spring(dragY, {toValue: 0, useNativeDriver: true, damping: 20}).start();
      }
    },
  })).current;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={dismiss}>
      <View style={s.sheetOverlay}>
        <Animated.View style={[s.sheetCard, {transform: [{translateY: dragY}]}]}>
          {/* Drag handle — ONLY this zone triggers swipe-to-dismiss */}
          <View {...pan.panHandlers} style={s.sheetHandleArea}>
            <View style={s.sheetDragBar} />
            <View style={s.sheetTitleRow}>
              <Text style={s.sheetTitle}>{title}</Text>
              <TouchableOpacity onPress={dismiss} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                <Text style={s.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Content scroll — fully isolated, never dismisses */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{paddingBottom: 40}}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Category form ────────────────────────────────────────────────────────────
function CategoryFormFields({
  name, setName, budget, setBudget, expectedAmount, setExpectedAmount,
  buffer, setBuffer, icon, setIcon, color, setColor,
  isFixed, setIsFixed, rollover, setRollover, weeklyTracking, setWeeklyTracking,
  subCategories, setSubCategories,
}: any) {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const [newSubName, setNewSubName] = useState('');
  const [newSubBudget, setNewSubBudget] = useState('');

  const addSub = () => {
    if (!newSubName.trim()) return;
    const b = parseFloat(newSubBudget);
    setSubCategories((prev: SubCategory[]) => [
      ...prev,
      {id: uuidv4(), name: newSubName.trim(), icon: '📌', budget: newSubBudget ? (isNaN(b) ? 0 : b) : 0},
    ]);
    setNewSubName('');
    setNewSubBudget('');
  };

  return (
    <>
      {/* Name */}
      <Text style={s.fieldLabel}>Name</Text>
      <TextInput style={s.input} placeholder="e.g. Groceries" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} />

      {/* Icon row */}
      <Text style={s.fieldLabel}>Icon</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}>
        <View style={{flexDirection: 'row', gap: 6}}>
          {PRESET_ICONS.map(i => (
            <TouchableOpacity key={i} style={[s.iconChip, icon === i && {borderColor: color, backgroundColor: color + '22'}]} onPress={() => setIcon(i)}>
              <Text style={{fontSize: 20}}>{i}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Colour row */}
      <Text style={s.fieldLabel}>Colour</Text>
      <View style={{flexDirection: 'row', gap: 8, marginBottom: spacing.sm}}>
        {PRESET_COLORS.map(col => (
          <TouchableOpacity key={col} style={[s.colorCircle, {backgroundColor: col}, color === col && s.colorCircleSelected]} onPress={() => setColor(col)} />
        ))}
      </View>

      {/* Budget */}
      <Text style={s.fieldLabel}>Monthly budget (optional)</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="No limit" placeholderTextColor={colors.textSecondary} value={budget} onChangeText={setBudget} />

      {/* Variable bill */}
      <Text style={s.fieldLabel}>Variable bill — expected &amp; buffer (optional)</Text>
      <View style={{flexDirection: 'row', gap: 8}}>
        <TextInput style={[s.input, {flex: 1}]} keyboardType="decimal-pad" placeholder="Expected e.g. 80" placeholderTextColor={colors.textSecondary} value={expectedAmount} onChangeText={setExpectedAmount} />
        <TextInput style={[s.input, {flex: 1}]} keyboardType="decimal-pad" placeholder="Buffer e.g. 20" placeholderTextColor={colors.textSecondary} value={buffer} onChangeText={setBuffer} />
      </View>

      {/* Toggles */}
      <View style={s.togglesCard}>
        <View style={s.switchRow}>
          <View style={{flex: 1}}>
            <Text style={s.switchLabel}>🔒 Fixed expense</Text>
            <Text style={s.switchHint}>Same amount each month</Text>
          </View>
          <Switch value={isFixed} onValueChange={setIsFixed} trackColor={{true: color}} />
        </View>
        <View style={[s.switchRow, {borderTopWidth: 1, borderTopColor: colors.border}]}>
          <View style={{flex: 1}}>
            <Text style={s.switchLabel}>♻️ Rollover budget</Text>
            <Text style={s.switchHint}>Unspent carries to next month</Text>
          </View>
          <Switch value={rollover} onValueChange={setRollover} trackColor={{true: color}} />
        </View>
        <View style={[s.switchRow, {borderTopWidth: 1, borderTopColor: colors.border}]}>
          <View style={{flex: 1}}>
            <Text style={s.switchLabel}>📅 Weekly tracking</Text>
            <Text style={s.switchHint}>Shows in weekly breakdown on home</Text>
          </View>
          <Switch value={weeklyTracking} onValueChange={setWeeklyTracking} trackColor={{true: color}} />
        </View>
      </View>

      {/* Sub-categories */}
      <Text style={s.fieldLabel}>Sub-categories</Text>
      {(subCategories as SubCategory[]).map((sub: SubCategory) => (
        <View key={sub.id} style={s.subRow}>
          <Text style={{fontSize: 16, marginRight: 8}}>📌</Text>
          <Text style={[s.switchLabel, {flex: 1}]}>{sub.name}{sub.budget > 0 ? ` · ${sub.budget}` : ''}</Text>
          <TouchableOpacity onPress={() => setSubCategories((p: SubCategory[]) => p.filter(x => x.id !== sub.id))} hitSlop={{top:8,bottom:8,left:8,right:8}}>
            <Text style={{color: colors.danger, fontSize: 16}}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={{flexDirection: 'row', gap: 8, marginTop: 4}}>
        <TextInput style={[s.input, {flex: 1}]} placeholder="Sub-category name" placeholderTextColor={colors.textSecondary} value={newSubName} onChangeText={setNewSubName} />
        <TextInput style={[s.input, {width: 80}]} placeholder="Budget" keyboardType="decimal-pad" placeholderTextColor={colors.textSecondary} value={newSubBudget} onChangeText={setNewSubBudget} />
        <TouchableOpacity style={s.addSubBtn} onPress={addSub}><Text style={s.addSubBtnText}>+</Text></TouchableOpacity>
      </View>
    </>
  );
}

// ─── Settings row component ───────────────────────────────────────────────────
function SettingsRow({icon, label, hint, onPress, right, noBorder}: {
  icon: string; label: string; hint?: string; onPress?: () => void; right?: React.ReactNode; noBorder?: boolean;
}) {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const Row = onPress ? TouchableOpacity : View;
  return (
    <Row style={[s.settingsRow, noBorder && {borderBottomWidth: 0}]} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.settingsRowIcon}>{icon}</Text>
      <View style={{flex: 1}}>
        <Text style={s.settingsRowLabel}>{label}</Text>
        {hint && <Text style={s.settingsRowHint}>{hint}</Text>}
      </View>
      {right && <View style={{marginLeft: 8}}>{right}</View>}
      {onPress && !right && <Text style={s.settingsChevron}>›</Text>}
    </Row>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const {colors, themeMode, setThemeMode, paletteKey, setPaletteKey} = useTheme();
  const s = makeStyles(colors);
  const {
    categories, expenses, incomeEvents, settings,
    addCategory, deleteCategory, updateCategory, updateSettings, reload,
    addBankNotifications, bankNotifications, addExpense, addIncomeEvent,
  } = useBudget();

  const [income, setIncome] = useState(String(settings.incomeAmount));
  const [currency, setCurrency] = useState(settings.currency);
  const [budgetSaved, setBudgetSaved] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(settings.notificationsEnabled);
  const [reminderHour, setReminderHour] = useState(String(settings.reminderHour));
  const [reminderMinute, setReminderMinute] = useState(String(settings.reminderMinute).padStart(2, '0'));
  const [bankConnected, setBankConnected] = useState(false);
  const [bankChecking, setBankChecking] = useState(true);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [showBankPeriodPicker, setShowBankPeriodPicker] = useState(false);
  const [bankLastSync, setBankLastSync] = useState<string | null>(null);
  const bankPendingAccessToken = useRef<string | null>(null);

  // Themed confirm/toast modals
  type ConfirmConfig = {icon?: string; title: string; message: string; confirmLabel: string; confirmDanger?: boolean; onConfirm: () => void};
  const [confirmModal, setConfirmModal] = useState<ConfirmConfig | null>(null);
  const [toast, setToast] = useState<{icon: string; message: string} | null>(null);
  const showConfirm = (cfg: ConfirmConfig) => setConfirmModal(cfg);
  const showToast = (icon: string, message: string) => setToast({icon, message});

  const blankForm = () => ({name:'', budget:'', expectedAmount:'', buffer:'', icon:'💰', color:'#6C63FF', isFixed:false, rollover:false, weekly:false, subs:[] as SubCategory[]});
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [newCat, setNewCat] = useState(blankForm());
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editForm, setEditForm] = useState(blankForm());

  useEffect(() => {
    setIncome(String(settings.incomeAmount));
    setCurrency(settings.currency);
    setNotifEnabled(settings.notificationsEnabled);
    setReminderHour(String(settings.reminderHour));
    setReminderMinute(String(settings.reminderMinute).padStart(2, '0'));
  }, [settings]);

  // Check bank connection and load sync metadata
  useEffect(() => {
    isBankConnected().then(async c => {
      setBankConnected(c);
      if (c) {
        const [date, firstSynced] = await Promise.all([
          getBankLastSyncDate(),
          getBankFirstSynced(),
        ]);
        setBankLastSync(date);
        if (!firstSynced) setShowBankPeriodPicker(true);
      }
      setBankChecking(false);
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

      if (cancelled) return;
      if (error) {
        Alert.alert('Connection failed', decodeURIComponent(error));
        return;
      }
      if (accessToken) {
        await saveBankTokens(accessToken, refreshToken ?? '');
        setBankConnected(true);
        bankPendingAccessToken.current = accessToken;

        const firstSynced = await getBankFirstSynced();
        if (!firstSynced) {
          setShowBankPeriodPicker(true);
        } else {
          const fromDate = await getBankLastSyncDate();
          syncBankTransactions(fromDate ?? undefined, accessToken);
        }
      }
    };

    const sub = Linking.addEventListener('url', ({url}) => handleUrl(url));
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bank sync ─────────────────────────────────────────────────────────────────

  const syncBankTransactions = useCallback(async (fromDate?: string, accessToken?: string) => {
    setBankSyncing(true);
    try {
      const txs = await fetchBankTransactions(fromDate, accessToken);
      if (txs.length === 0) return;

      const [merchantMap, freshCategories, freshExpenses, importedTxIds] = await Promise.all([
        getMerchantMap(),
        storage.getCategories(),
        storage.getExpenses(),
        getImportedTxIds(),
      ]);

      // Skip transactions already processed in a previous sync
      const newTxs = txs.filter(tx => !importedTxIds.has(tx.id));
      if (newTxs.length === 0) return;

      // Debits with no existing merchant mapping → send to Gemini for categorisation
      const debitsToClassify = newTxs.filter(
        tx => tx.type === 'debit' && !merchantMap[(tx.merchantName ?? tx.description).toLowerCase().trim()]
      );

      let geminiMap: Record<string, {categoryId: string | null; subCategoryId: string | null}> = {};
      if (debitsToClassify.length > 0 && freshCategories.length > 0) {
        geminiMap = await categoriseTransactions(
          debitsToClassify.map(tx => ({
            id: tx.id,
            merchantName: tx.merchantName,
            description: tx.description,
            amount: tx.amount,
            bankCategory: tx.category,
          })),
          freshCategories.map(cat => ({
            id: cat.id,
            name: cat.name,
            icon: cat.icon,
            subCategories: cat.subCategories.map(sub => ({id: sub.id, name: sub.name, icon: sub.icon})),
          })),
        );
      }

      // Transactions that need user review (no category found)
      const newNotifications: BankNotification[] = [];
      // Transactions that can be auto-confirmed (mapped merchant OR Gemini matched)
      const autoExpenses: import('../types').Expense[] = [];
      const unknownForNotif: Array<{tx: BankTransaction}> = [];

      for (const tx of newTxs) {
        const key = (tx.merchantName ?? tx.description).toLowerCase().trim();
        const mapped = merchantMap[key];

        if (tx.type === 'credit') {
          const cc = classifyCredit(tx, freshExpenses);
          if (cc.needsReview) {
            // Probable reimbursement — send to bell so user can confirm or change
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
          // Known merchant — auto-add as expense directly
          autoExpenses.push({
            id: uuidv4(),
            categoryId: mapped.categoryId!,
            subCategoryId: mapped.subCategoryId ?? undefined,
            amount: tx.amount,
            note: tx.merchantName ?? tx.description,
            date: tx.date,
            isRecurring: false,
          });
        } else {
          // Unknown merchant — check Gemini result
          const gemini = geminiMap[tx.id];
          const categoryId = gemini?.categoryId ?? null;
          const subCategoryId = gemini?.subCategoryId ?? null;

          if (categoryId) {
            // Gemini found a match — auto-add as expense and save merchant mapping
            autoExpenses.push({
              id: uuidv4(),
              categoryId,
              subCategoryId: subCategoryId ?? undefined,
              amount: tx.amount,
              note: tx.merchantName ?? tx.description,
              date: tx.date,
              isRecurring: false,
            });
            // Learn this merchant so next sync skips Gemini entirely
            saveMerchantEntry(
              tx.merchantName ?? tx.description,
              categoryId,
              subCategoryId ?? undefined,
            ).catch(() => {});
          } else {
            // Gemini couldn't categorise — send to bell for manual review
            newNotifications.push(makeBankNotification(tx, null, null));
            unknownForNotif.push({tx});
          }
        }
      }

      // Auto-confirmed expenses (known merchant or Gemini-matched) — add directly, skip bell
      for (const exp of autoExpenses) {
        addExpense(exp);
      }

      // Only truly unrecognised transactions go to the bell queue
      if (newNotifications.length > 0) {
        await addBankNotifications(newNotifications);
        // Fire system tray notification only for unrecognised transactions
        const firedMerchants = new Set<string>();
        for (const {tx} of unknownForNotif) {
          const merchant = tx.merchantName ?? tx.description;
          if (!firedMerchants.has(merchant)) {
            firedMerchants.add(merchant);
            fireBankTransactionNotification({
              txId: tx.id,
              merchantName: merchant,
              amount: tx.amount,
              currency: settings.currency,
            }).catch(() => {});
          }
        }
      }

      // Record all processed txIds to prevent duplicates on next sync
      await addImportedTxIds(newTxs.map(tx => tx.id));

      const now = format(new Date(), 'yyyy-MM-dd');
      await saveBankLastSyncDate(now);
      setBankLastSync(now);
    } catch (err: any) {
      Alert.alert('Sync failed', err?.message ?? 'Could not fetch transactions');
      if (err?.message?.includes('reconnect') || err?.message?.includes('expired')) {
        await clearBankTokens();
        setBankConnected(false);
      }
    } finally {
      setBankSyncing(false);
    }
  }, [categories, addExpense, addIncomeEvent, addBankNotifications, settings.currency]);

  const handleBankFirstSyncConfirm = useCallback(async (fromDate: string | null) => {
    setShowBankPeriodPicker(false);
    await setBankFirstSynced();
    await syncBankTransactions(fromDate ?? undefined, bankPendingAccessToken.current ?? undefined);
    bankPendingAccessToken.current = null;
  }, [syncBankTransactions]);

  const handleBankConnect = async () => {
    try {
      setBankChecking(true);
      const authUrl = await getBankAuthUrl();
      await Linking.openURL(authUrl);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not start bank connection');
    } finally {
      setBankChecking(false);
    }
  };

  const handleDisconnectBank = () => {
    showConfirm({
      icon: '🔌',
      title: 'Disconnect bank?',
      message: 'Your bank connection will be removed. Pending notifications will remain until cleared.',
      confirmLabel: 'Disconnect',
      confirmDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await clearBankTokens();
        setBankConnected(false);
        setBankLastSync(null);
        bankPendingAccessToken.current = null;
      },
    });
  };

  const openEdit = (cat: Category) => {
    setEditForm({
      name: cat.name, budget: cat.budget > 0 ? String(cat.budget) : '',
      expectedAmount: cat.expectedAmount > 0 ? String(cat.expectedAmount) : '',
      buffer: cat.buffer > 0 ? String(cat.buffer) : '',
      icon: cat.icon, color: cat.color, isFixed: cat.isFixed,
      rollover: cat.rollover, weekly: cat.weeklyTracking ?? false,
      subs: cat.subCategories ?? [],
    });
    setEditingCat(cat);
  };

  const saveEdit = () => {
    if (!editingCat || !editForm.name.trim()) { Alert.alert('Error', 'Name cannot be empty.'); return; }
    const budget = parseFloat(editForm.budget);
    const expected = parseFloat(editForm.expectedAmount);
    const buf = parseFloat(editForm.buffer);
    updateCategory({
      ...editingCat,
      name: editForm.name.trim(),
      budget: editForm.budget ? (isNaN(budget) ? 0 : budget) : 0,
      expectedAmount: editForm.expectedAmount ? (isNaN(expected) ? 0 : expected) : 0,
      buffer: editForm.buffer ? (isNaN(buf) ? 0 : buf) : 0,
      icon: editForm.icon, color: editForm.color,
      isFixed: editForm.isFixed, rollover: editForm.rollover,
      weeklyTracking: editForm.weekly, subCategories: editForm.subs,
    });
    setEditingCat(null);
  };

  const handleSaveSettings = async (overrides?: Partial<typeof settings>) => {
    const parsedIncome = parseFloat(income);
    if (isNaN(parsedIncome) || parsedIncome < 0) { Alert.alert('Error', 'Income must be a number.'); return; }
    const h = parseInt(reminderHour, 10);
    const min = parseInt(reminderMinute, 10);
    if (isNaN(h) || h < 0 || h > 23 || isNaN(min) || min < 0 || min > 59) { Alert.alert('Error', 'Invalid reminder time.'); return; }
    const updated = {currency: currency.trim() || '€', incomeAmount: parsedIncome, notificationsEnabled: notifEnabled, reminderHour: h, reminderMinute: min, ...overrides};
    await updateSettings(updated);
    if (updated.notificationsEnabled) {
      try {
        await scheduleDailyReminder(h, min);
      } catch {}
    } else {
      await cancelDailyReminder();
    }
  };

  const handleAddCategory = () => {
    if (!newCat.name.trim()) { Alert.alert('Error', 'Name cannot be empty.'); return; }
    const budget = parseFloat(newCat.budget);
    const expected = parseFloat(newCat.expectedAmount);
    const buf = parseFloat(newCat.buffer);
    addCategory({
      id: uuidv4(), name: newCat.name.trim(), icon: newCat.icon, color: newCat.color,
      budget: newCat.budget ? (isNaN(budget) ? 0 : budget) : 0,
      isFixed: newCat.isFixed, rollover: newCat.rollover, weeklyTracking: newCat.weekly,
      expectedAmount: newCat.expectedAmount ? (isNaN(expected) ? 0 : expected) : 0,
      buffer: newCat.buffer ? (isNaN(buf) ? 0 : buf) : 0,
      subCategories: newCat.subs,
    });
    setNewCat(blankForm());
    setShowAddSheet(false);
  };

  const handleDeleteCategory = (id: string, name: string) => {
    showConfirm({
      icon: '🗑️',
      title: `Delete "${name}"?`,
      message: 'Expenses in this category will lose their label.',
      confirmLabel: 'Delete category',
      confirmDanger: true,
      onConfirm: () => { setConfirmModal(null); deleteCategory(id); },
    });
  };

  const handleExportCSV = async () => {
    if (expenses.length === 0) { Alert.alert('Nothing to export', 'No expenses yet.'); return; }
    const csv = buildCSV(expenses, categories, settings.currency, incomeEvents);
    const filename = `budget_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    try {
      await Share.share({title: filename, message: Platform.OS === 'android' ? csv : undefined, url: Platform.OS === 'ios' ? `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}` : undefined});
    } catch { Alert.alert('Export failed', 'Could not share the file.'); }
  };

  const setNewCatField = (f: string, v: any) => setNewCat(p => ({...p, [f]: v}));
  const setEditFormField = (f: string, v: any) => setEditForm(p => ({...p, [f]: v}));

  const THEME_OPTIONS: {mode: ThemeMode; label: string; icon: string}[] = [
    {mode: 'system', label: 'System', icon: '📱'},
    {mode: 'light',  label: 'Light',  icon: '☀️'},
    {mode: 'dark',   label: 'Dark',   icon: '🌙'},
  ];

  return (
    <View style={{flex: 1, backgroundColor: colors.background}}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Categories ── */}
        <Text style={s.sectionTitle}>Categories</Text>
        <View style={s.card}>
          {categories.length === 0 && (
            <Text style={[s.settingsRowHint, {padding: spacing.sm}]}>No categories yet. Add one below.</Text>
          )}
          {categories.map((cat, i) => (
            <TouchableOpacity key={cat.id} style={[s.catRow, i === 0 && {borderTopWidth: 0}]} onPress={() => openEdit(cat)} activeOpacity={0.7}>
              <View style={[s.catDot, {backgroundColor: cat.color}]} />
              <Text style={{fontSize: 18, marginRight: 8}}>{cat.icon}</Text>
              <View style={{flex: 1}}>
                <Text style={s.catRowName}>{cat.name}</Text>
                <Text style={s.catRowMeta}>
                  {cat.budget > 0 ? `${settings.currency}${cat.budget}/mo` : 'No limit'}
                  {cat.expectedAmount > 0 ? ` · exp ${settings.currency}${cat.expectedAmount}+${cat.buffer}` : ''}
                  {(cat.subCategories?.length ?? 0) > 0 ? ` · ${cat.subCategories.length} subs` : ''}
                  {cat.weeklyTracking ? ' · 📅' : ''}
                  {cat.rollover ? ' · ♻️' : ''}
                </Text>
              </View>
              <Text style={s.settingsChevron}>✏️</Text>
              <TouchableOpacity onPress={() => handleDeleteCategory(cat.id, cat.name)} hitSlop={{top:8,bottom:8,left:8,right:8}} style={{marginLeft: 8}}>
                <Text style={{color: colors.danger, fontSize: 16}}>🗑</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          {/* Add button inline */}
          <TouchableOpacity style={s.addCatBtn} onPress={() => { setNewCat(blankForm()); setShowAddSheet(true); }}>
            <Text style={s.addCatBtnText}>＋  Add Category</Text>
          </TouchableOpacity>
        </View>

        {/* ── Budget ── */}
        <Text style={s.sectionTitle}>Budget</Text>
        <View style={s.card}>
          <View style={{flexDirection: 'row', gap: 8}}>
            <View style={{width: 72}}>
              <Text style={s.fieldLabel}>Currency</Text>
              <TextInput style={s.input} placeholder="€" placeholderTextColor={colors.textSecondary} value={currency} onChangeText={v => { setCurrency(v); setBudgetSaved(false); }} maxLength={4} onBlur={() => handleSaveSettings()} />
            </View>
            <View style={{flex: 1}}>
              <Text style={s.fieldLabel}>Monthly income / allowance</Text>
              <TextInput style={s.input} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textSecondary} value={income} onChangeText={v => { setIncome(v); setBudgetSaved(false); }} onBlur={() => handleSaveSettings()} />
            </View>
          </View>
          <TouchableOpacity
            style={[s.saveBtn, {backgroundColor: budgetSaved ? darkenColor(colors.primary) : colors.primary}]}
            onPress={async () => { await handleSaveSettings(); setBudgetSaved(true); }}>
            <Text style={s.saveBtnText}>{budgetSaved ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Appearance ── */}
        <Text style={s.sectionTitle}>Appearance</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Theme</Text>
          <View style={{flexDirection: 'row', gap: 8, marginBottom: spacing.md}}>
            {THEME_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.mode} style={[s.themeChip, themeMode === opt.mode && {backgroundColor: colors.primary, borderColor: colors.primary}]} onPress={() => setThemeMode(opt.mode)}>
                <Text style={{fontSize: 16}}>{opt.icon}</Text>
                <Text style={[s.themeChipLabel, themeMode === opt.mode && {color: '#fff'}]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.fieldLabel}>Colour palette</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            {(Object.keys(PALETTES) as PaletteKey[]).map(key => {
              const palette = PALETTES[key];
              const active = paletteKey === key;
              return (
                <TouchableOpacity key={key} style={[s.paletteChip, active && {borderColor: palette.dark.primary, borderWidth: 2}]} onPress={() => setPaletteKey(key)}>
                  <View style={[s.paletteSwatch, {backgroundColor: palette.dark.primary}]} />
                  <Text style={s.paletteLabel}>{palette.icon} {palette.label}</Text>
                  {active && <Text style={{color: palette.dark.primary, fontWeight: '700', marginLeft: 4}}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Notifications ── */}
        <Text style={s.sectionTitle}>Notifications</Text>
        <View style={s.card}>
          <View style={s.switchRow}>
            <View style={{flex: 1}}>
              <Text style={s.switchLabel}>🔔 Daily reminder</Text>
              <Text style={s.settingsRowHint}>Reminds you to log expenses</Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={async (v) => {
                if (v) {
                  const result = await requestPermissions();
                  if (result === 'denied') { Alert.alert('Permission required', 'Allow notifications in phone settings.'); return; }
                }
                setNotifEnabled(v);
                handleSaveSettings({notificationsEnabled: v});
              }}
              trackColor={{true: colors.primary}}
            />
          </View>
          {notifEnabled && (
            <View style={[s.switchRow, {borderTopWidth: 1, borderTopColor: colors.border}]}>
              <Text style={[s.switchLabel, {marginRight: spacing.sm}]}>⏰ Time</Text>
              <TextInput style={[s.input, {width: 52, textAlign: 'center'}]} keyboardType="number-pad" placeholder="20" placeholderTextColor={colors.textSecondary} value={reminderHour} onChangeText={setReminderHour} maxLength={2} onBlur={() => handleSaveSettings()} />
              <Text style={{color: colors.text, fontSize: 20, fontWeight: '700', marginHorizontal: 4}}>:</Text>
              <TextInput style={[s.input, {width: 52, textAlign: 'center'}]} keyboardType="number-pad" placeholder="00" placeholderTextColor={colors.textSecondary} value={reminderMinute} onChangeText={setReminderMinute} maxLength={2} onBlur={() => handleSaveSettings()} />
            </View>
          )}
        </View>

        {/* ── More ── */}
        <Text style={s.sectionTitle}>More</Text>
        <View style={s.card}>
          <SettingsRow icon="💳" label="Subscriptions" hint="Track recurring payments" onPress={() => navigation.navigate('Subscriptions')} />
          <SettingsRow icon="💚" label="Income" hint="Income and received amounts" onPress={() => navigation.navigate('Income')} noBorder />
        </View>

        {/* ── Bank ── */}
        <Text style={s.sectionTitle}>Bank</Text>
        <View style={s.card}>
          {bankChecking ? (
            <View style={{padding: spacing.md, alignItems: 'center'}}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : !bankConnected ? (
            <View style={{padding: spacing.md, alignItems: 'center'}}>
              <Text style={{fontSize: 40, marginBottom: spacing.sm}}>🏦</Text>
              <Text style={[s.settingsRowLabel, {textAlign: 'center', marginBottom: 4}]}>Connect Your Bank</Text>
              <Text style={[s.settingsRowHint, {textAlign: 'center', marginBottom: spacing.md, lineHeight: 18}]}>
                Securely connect via Open Banking. Your credentials never touch our servers.
              </Text>
              <TouchableOpacity style={[s.saveBtn, {width: '100%'}]} onPress={handleBankConnect}>
                <Text style={s.saveBtnText}>Connect Your Bank</Text>
              </TouchableOpacity>
              <Text style={[s.settingsRowHint, {marginTop: spacing.sm, textAlign: 'center'}]}>
                🔒 Powered by TrueLayer — PSD2 regulated open banking
              </Text>
            </View>
          ) : (
            <>
              <View style={[s.settingsRow, {paddingVertical: 12}]}>
                <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 10}} />
                <View style={{flex: 1}}>
                  <Text style={s.settingsRowLabel}>Bank connected</Text>
                  {bankLastSync && (
                    <Text style={s.settingsRowHint}>Last synced: {bankLastSync}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={{borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6}}
                  onPress={() => syncBankTransactions(bankLastSync ?? undefined)}
                  disabled={bankSyncing}>
                  {bankSyncing
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={{color: colors.primary, fontWeight: '600', fontSize: 13}}>🔄 Sync</Text>}
                </TouchableOpacity>
              </View>

              <SettingsRow
                icon="🗑️"
                label="Clear all transactions"
                hint="Remove all imported expenses and income, keep settings"
                onPress={() => showConfirm({
                  icon: '🧹',
                  title: 'Clear all transactions?',
                  message: 'All imported expenses and income will be deleted. Your categories, budget settings, and bank connection will be kept.',
                  confirmLabel: 'Clear transactions',
                  confirmDanger: true,
                  onConfirm: async () => {
                    setConfirmModal(null);
                    await storage.saveExpenses([]);
                    await storage.saveIncomeEvents([]);
                    await reload();
                    showToast('✅', 'All transactions cleared');
                  },
                })}
              />
              <SettingsRow
                icon="🔌"
                label="Disconnect Bank"
                hint="Remove your bank connection"
                onPress={handleDisconnectBank}
                noBorder
              />
            </>
          )}
        </View>

        {/* ── Data ── */}
        <Text style={s.sectionTitle}>Data</Text>
        <View style={s.card}>
          <SettingsRow icon="📤" label="Export as CSV" hint={`${expenses.length} expense${expenses.length !== 1 ? 's' : ''} + ${incomeEvents.length} income event${incomeEvents.length !== 1 ? 's' : ''}`} onPress={handleExportCSV} />
          <SettingsRow icon="🗑️" label="Delete all data" hint="Permanently removes all expenses and settings" onPress={() => showConfirm({
            icon: '⚠️',
            title: 'Delete all data?',
            message: 'This will permanently remove all your expenses, categories, income, and settings. This cannot be undone.',
            confirmLabel: 'Delete everything',
            confirmDanger: true,
            onConfirm: async () => {
              setConfirmModal(null);
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              await AsyncStorage.clear();
              await reload();
              showToast('🗑️', 'All data deleted');
            },
          })} noBorder />
        </View>

        {/* ── Legal ── */}
        <Text style={s.sectionTitle}>Legal</Text>
        <View style={s.card}>
          <SettingsRow icon="🔒" label="Privacy Policy" hint="How we handle your data" onPress={() => Linking.openURL('https://budget-api-sigma.vercel.app/api/privacy')} />
          <SettingsRow icon="📄" label="Terms of Service" hint="Rules for using PiggyBudget" onPress={() => Linking.openURL('https://budget-api-sigma.vercel.app/api/terms')} noBorder />
        </View>

      </ScrollView>

      {/* ── Period picker for bank first-sync ── */}
      <PeriodPickerModal
        visible={showBankPeriodPicker}
        onConfirm={handleBankFirstSyncConfirm}
        onCancel={() => {
          setShowBankPeriodPicker(false);
          setBankFirstSynced();
          bankPendingAccessToken.current = null;
        }}
      />

      {/* ── Add Category Sheet ── */}
      <BottomSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} title="New Category">
        <View style={{padding: spacing.md}}>
          <CategoryFormFields
            name={newCat.name} setName={(v: string) => setNewCatField('name', v)}
            budget={newCat.budget} setBudget={(v: string) => setNewCatField('budget', v)}
            expectedAmount={newCat.expectedAmount} setExpectedAmount={(v: string) => setNewCatField('expectedAmount', v)}
            buffer={newCat.buffer} setBuffer={(v: string) => setNewCatField('buffer', v)}
            icon={newCat.icon} setIcon={(v: string) => setNewCatField('icon', v)}
            color={newCat.color} setColor={(v: string) => setNewCatField('color', v)}
            isFixed={newCat.isFixed} setIsFixed={(fn: any) => setNewCat(p => ({...p, isFixed: typeof fn === 'function' ? fn(p.isFixed) : fn}))}
            rollover={newCat.rollover} setRollover={(fn: any) => setNewCat(p => ({...p, rollover: typeof fn === 'function' ? fn(p.rollover) : fn}))}
            weeklyTracking={newCat.weekly} setWeeklyTracking={(fn: any) => setNewCat(p => ({...p, weekly: typeof fn === 'function' ? fn(p.weekly) : fn}))}
            subCategories={newCat.subs} setSubCategories={(fn: any) => setNewCat(p => ({...p, subs: typeof fn === 'function' ? fn(p.subs) : fn}))}
          />
          <TouchableOpacity style={[s.saveBtn, {marginTop: spacing.md}]} onPress={handleAddCategory}>
            <Text style={s.saveBtnText}>Add Category</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Edit Category Sheet ── */}
      <BottomSheet visible={editingCat !== null} onClose={() => setEditingCat(null)} title="Edit Category">
        <View style={{padding: spacing.md}}>
          <CategoryFormFields
            name={editForm.name} setName={(v: string) => setEditFormField('name', v)}
            budget={editForm.budget} setBudget={(v: string) => setEditFormField('budget', v)}
            expectedAmount={editForm.expectedAmount} setExpectedAmount={(v: string) => setEditFormField('expectedAmount', v)}
            buffer={editForm.buffer} setBuffer={(v: string) => setEditFormField('buffer', v)}
            icon={editForm.icon} setIcon={(v: string) => setEditFormField('icon', v)}
            color={editForm.color} setColor={(v: string) => setEditFormField('color', v)}
            isFixed={editForm.isFixed} setIsFixed={(fn: any) => setEditForm(p => ({...p, isFixed: typeof fn === 'function' ? fn(p.isFixed) : fn}))}
            rollover={editForm.rollover} setRollover={(fn: any) => setEditForm(p => ({...p, rollover: typeof fn === 'function' ? fn(p.rollover) : fn}))}
            weeklyTracking={editForm.weekly} setWeeklyTracking={(fn: any) => setEditForm(p => ({...p, weekly: typeof fn === 'function' ? fn(p.weekly) : fn}))}
            subCategories={editForm.subs} setSubCategories={(fn: any) => setEditForm(p => ({...p, subs: typeof fn === 'function' ? fn(p.subs) : fn}))}
          />
          <TouchableOpacity style={[s.saveBtn, {marginTop: spacing.md}]} onPress={saveEdit}>
            <Text style={s.saveBtnText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Themed confirm dialog ── */}
      {confirmModal && (
        <ConfirmModal
          visible={!!confirmModal}
          icon={confirmModal.icon}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          confirmDanger={confirmModal.confirmDanger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* ── Success toast ── */}
      <ToastModal
        visible={!!toast}
        icon={toast?.icon ?? '✅'}
        message={toast?.message ?? ''}
        onDone={() => setToast(null)}
      />
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    content: {padding: spacing.md, paddingBottom: 60},
    sectionTitle: {...typography.subtitle, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs, marginLeft: 4, textTransform: 'uppercase', fontSize: 11, letterSpacing: 1},
    card: {backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm},

    // Category rows
    catRow: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border},
    catDot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
    catRowName: {...typography.body, color: colors.text, fontWeight: '600'},
    catRowMeta: {...typography.caption, color: colors.textSecondary, marginTop: 1},
    addCatBtn: {margin: spacing.sm, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', padding: 12, alignItems: 'center'},
    addCatBtnText: {...typography.body, color: colors.primary, fontWeight: '700'},

    // Fields
    fieldLabel: {...typography.caption, color: colors.textSecondary, marginBottom: 4, marginTop: spacing.sm},
    input: {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border},

    // Toggles
    togglesCard: {backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm, overflow: 'hidden'},
    switchRow: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, paddingVertical: 10},
    switchLabel: {...typography.body, color: colors.text, fontWeight: '600'},
    switchHint: {...typography.caption, color: colors.textSecondary, marginTop: 1},

    // Sub-categories
    subRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 8, padding: spacing.sm, marginBottom: 4, borderWidth: 1, borderColor: colors.border},
    addSubBtn: {backgroundColor: colors.primary, width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center'},
    addSubBtnText: {color: '#fff', fontSize: 22, fontWeight: '700'},

    // Settings rows
    settingsRow: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border},
    settingsRowIcon: {fontSize: 18, marginRight: 12},
    settingsRowLabel: {...typography.body, color: colors.text, fontWeight: '600'},
    settingsRowHint: {...typography.caption, color: colors.textSecondary, marginTop: 1},
    settingsChevron: {fontSize: 18, color: colors.textSecondary},

    // Save
    saveBtn: {backgroundColor: colors.primary, borderRadius: 12, padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm},
    saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},

    // Theme
    themeChip: {flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background, gap: 2},
    themeChipLabel: {...typography.caption, color: colors.textSecondary, fontWeight: '600'},
    paletteChip: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.border, minWidth: '45%'},
    paletteSwatch: {width: 14, height: 14, borderRadius: 7, marginRight: 6},
    paletteLabel: {...typography.caption, color: colors.text, fontWeight: '600', flex: 1},

    // Icon/colour pickers
    iconChip: {padding: 6, borderRadius: 8, borderWidth: 2, borderColor: 'transparent'},
    colorCircle: {width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent'},
    colorCircleSelected: {borderColor: colors.text},

    // Bottom sheet
    sheetOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
    sheetCard: {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%'},
    sheetHandleArea: {paddingTop: 10, paddingBottom: 8, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border},
    sheetDragBar: {width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10},
    sheetTitleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    sheetTitle: {...typography.subtitle, color: colors.text, fontWeight: '700'},
    sheetClose: {fontSize: 18, color: colors.textSecondary, padding: 4},
  });
