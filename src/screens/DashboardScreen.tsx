/**
 * DashboardScreen.tsx
 *
 * The main home screen. Shows:
 *  - A summary card (spent / remaining / income + progress bar)
 *  - Weekly breakdown for categories with weeklyTracking enabled
 *  - Full monthly breakdown for all categories
 *  - A category detail modal (expenses, sub-category breakdown, buffer zone)
 *
 * Header right → 🔔 Bell icon with badge → opens BankNotifCentreModal, then ☰ hamburger
 * FAB (bottom right) → choice modal: Add Expense / Scan Receipt
 * Tapping a category card opens CategoryModal.
 */
import React, {useMemo, useState, useRef, useLayoutEffect, useCallback, useContext, useEffect} from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, Pressable, PanResponder, Animated,
  TextInput, AppState,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {format} from 'date-fns';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {MenuContext} from '../context/MenuContext';
import {
  currentMonth, expensesForMonth, expensesForWeek,
  totalByCategory, totalSpent, totalReceived, incomeEventsForMonth, formatAmount, monthLabel, currentWeekOfMonth,
} from '../utils/helpers';
import {saveMerchantEntry, getBankLastSyncDate, saveBankLastSyncDate, getMerchantMap, getImportedTxIds, addImportedTxIds} from '../utils/storage';
import * as storage from '../utils/storage';
import {isBankConnected, fetchBankTransactions, categoriseTransactions, classifyCredit, BankTransaction} from '../utils/bankApi';
import {fireBankTransactionNotification} from '../utils/notifications';
import {QuickAddCategoryModal} from '../components/QuickAddCategoryModal';
import {ConfirmModal} from '../components/AppModals';
import {Category, Expense, BankNotification, IncomeEvent} from '../types';
import {spacing, typography} from '../theme';

const WEEK_LABELS = ['', 'Week 1 (1–7)', 'Week 2 (8–14)', 'Week 3 (15–21)', 'Week 4 (22+)'];

// ─── Edit expense modal ─────────────────────────────────────────────────────

function EditExpenseModal({exp, categories, currency, onClose, onSave, onDelete}: {
  exp: Expense;
  categories: Category[];
  currency: string;
  onClose: () => void;
  onSave: (updated: Expense) => void;
  onDelete: (id: string) => void;
}) {
  const {colors} = useTheme();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(exp.categoryId);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(exp.subCategoryId ?? null);
  const [expandedCat, setExpandedCat] = useState<string | null>(exp.categoryId);
  const [editAmount, setEditAmount] = useState(exp.amount.toFixed(2));
  const [editDate, setEditDate] = useState(exp.date);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [amountError, setAmountError] = useState('');

  const handleSave = () => {
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setAmountError('Enter a valid amount');
      return;
    }
    if (!selectedCatId) return;
    onSave({...exp, amount: parsed, date: editDate, categoryId: selectedCatId, subCategoryId: selectedSubId ?? undefined});
  };

  return (
    <Modal transparent statusBarTranslucent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={eeStyles.overlay} onPress={onClose}>
        <View style={[eeStyles.sheet, {backgroundColor: colors.surface}]}>
          <View style={[eeStyles.handle, {backgroundColor: colors.border}]} />
          <Text style={[eeStyles.title, {color: colors.text}]}>Edit Expense</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{maxHeight: 480}}>
            {/* Note (read-only label) */}
            {exp.note ? (
              <View style={[eeStyles.infoRow, {backgroundColor: colors.background, borderColor: colors.border}]}>
                <Text style={[eeStyles.expNote, {color: colors.textSecondary, flex: 1}]} numberOfLines={1}>{exp.note}</Text>
              </View>
            ) : null}

            {/* Amount */}
            <Text style={[eeStyles.sectionLabel, {color: colors.textSecondary}]}>Amount ({currency})</Text>
            <TextInput
              style={[eeStyles.fieldInput, {color: colors.text, borderColor: amountError ? colors.danger : colors.border, backgroundColor: colors.background}]}
              keyboardType="decimal-pad"
              value={editAmount}
              onChangeText={v => { setEditAmount(v); if (amountError) setAmountError(''); }}
              placeholderTextColor={colors.textSecondary}
            />
            {!!amountError && <Text style={{fontSize: 12, color: colors.danger, marginBottom: 4}}>{amountError}</Text>}

            {/* Date */}
            <Text style={[eeStyles.sectionLabel, {color: colors.textSecondary}]}>Date</Text>
            <TouchableOpacity
              style={[eeStyles.fieldInput, {backgroundColor: colors.background, borderColor: colors.border}]}
              onPress={() => setShowDatePicker(true)}>
              <Text style={{color: colors.text}}>📅 {editDate}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={new Date(editDate)}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    setEditDate(`${y}-${m}-${d}`);
                  }
                }}
              />
            )}

            {/* Category */}
            <Text style={[eeStyles.sectionLabel, {color: colors.textSecondary, marginTop: 8}]}>Category</Text>
            <View style={eeStyles.chipGrid}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[eeStyles.chip, {borderColor: colors.border, backgroundColor: colors.background},
                    selectedCatId === cat.id && {backgroundColor: cat.color, borderColor: cat.color}]}
                  onPress={() => {
                    setSelectedCatId(cat.id);
                    setSelectedSubId(null);
                    setExpandedCat(prev => prev === cat.id ? null : cat.id);
                  }}>
                  <Text style={eeStyles.chipIcon}>{cat.icon}</Text>
                  <Text style={[eeStyles.chipText, {color: colors.text},
                    selectedCatId === cat.id && {color: '#fff'}]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Sub-categories */}
            {expandedCat && (() => {
              const cat = categories.find(c => c.id === expandedCat);
              if (!cat || cat.subCategories.length === 0) return null;
              return (
                <>
                  <Text style={[eeStyles.sectionLabel, {color: colors.textSecondary, marginTop: 8}]}>Sub-category</Text>
                  <View style={eeStyles.chipGrid}>
                    {cat.subCategories.map(sub => (
                      <TouchableOpacity
                        key={sub.id}
                        style={[eeStyles.chip, {borderColor: colors.border, backgroundColor: colors.background},
                          selectedSubId === sub.id && {backgroundColor: cat.color, borderColor: cat.color}]}
                        onPress={() => setSelectedSubId(prev => prev === sub.id ? null : sub.id)}>
                        <Text style={eeStyles.chipIcon}>{sub.icon}</Text>
                        <Text style={[eeStyles.chipText, {color: colors.text},
                          selectedSubId === sub.id && {color: '#fff'}]}>{sub.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              );
            })()}
          </ScrollView>

          <TouchableOpacity
            style={[eeStyles.saveBtn, {backgroundColor: selectedCatId ? colors.primary : colors.border}]}
            disabled={!selectedCatId}
            onPress={handleSave}>
            <Text style={eeStyles.saveBtnText}>Save Changes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[eeStyles.deleteBtn, {borderColor: colors.danger}]}
            onPress={() => setShowDeleteConfirm(true)}>
            <Text style={[eeStyles.deleteBtnText, {color: colors.danger}]}>🗑 Delete Expense</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
      <ConfirmModal
        visible={showDeleteConfirm}
        icon="🗑️"
        title="Delete expense?"
        message="This cannot be undone."
        confirmLabel="Delete"
        confirmDanger
        onConfirm={() => { setShowDeleteConfirm(false); onDelete(exp.id); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </Modal>
  );
}

const eeStyles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%'},
  handle: {width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14},
  title: {fontSize: 18, fontWeight: '700', marginBottom: 14, textAlign: 'center'},
  infoRow: {flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16},
  expNote: {fontSize: 14, fontWeight: '600'},
  expDate: {fontSize: 12, marginTop: 2},
  expAmount: {fontSize: 16, fontWeight: '700'},
  sectionLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8},
  chipGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8},
  chip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7},
  chipIcon: {fontSize: 14, marginRight: 5},
  chipText: {fontSize: 13, fontWeight: '600'},
  fieldInput: {borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 15},
  saveBtn: {borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16},
  saveBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  deleteBtn: {borderWidth: 1.5, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8},
  deleteBtnText: {fontSize: 14, fontWeight: '600'},
});

// ─── Category detail modal ────────────────────────────────────────────────────

function CategoryModal({cat, expenses, currency, onClose, onEditExpense}: {
  cat: Category; expenses: Expense[]; currency: string; onClose: () => void;
  onEditExpense: (exp: Expense) => void;
}) {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(translateY, {toValue: 800, duration: 200, useNativeDriver: true}).start(onClose);
        } else {
          Animated.spring(translateY, {toValue: 0, useNativeDriver: true}).start();
        }
      },
    }),
  ).current;

  const catExpenses = expenses
    .filter(e => e.categoryId === cat.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = catExpenses.reduce((sum, e) => sum + e.amount, 0);
  const subCats = cat.subCategories ?? [];

  const subTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of catExpenses) {
      if (e.subCategoryId) map[e.subCategoryId] = (map[e.subCategoryId] || 0) + e.amount;
    }
    return map;
  }, [catExpenses]);

  const hasBuffer = cat.expectedAmount > 0;

  return (
    <Modal transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Animated.View style={[s.modalCard, {transform: [{translateY}]}]}>
          <View {...panResponder.panHandlers} style={[s.modalHeaderStrip, {backgroundColor: cat.color + '33'}]}>
            <View style={[s.modalIconCircle, {backgroundColor: cat.color}]}>
              <Text style={{fontSize: 22}}>{cat.icon}</Text>
            </View>
            <Text style={s.modalTitle}>{cat.name}</Text>
            <TouchableOpacity onPress={onClose} style={s.modalCloseBtn}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {hasBuffer && (
            <View style={[s.bufferCard, {borderLeftColor: cat.color, borderLeftWidth: 3}]}>
              <View style={s.bufferRow}>
                <Text style={s.bufferLabel}>Spent</Text>
                <Text style={s.bufferLabel}>Expected</Text>
                <Text style={s.bufferLabel}>Limit</Text>
              </View>
              <View style={s.bufferRow}>
                <Text style={[s.bufferValue,
                  total > cat.expectedAmount + cat.buffer && {color: colors.danger},
                  total > cat.expectedAmount && total <= cat.expectedAmount + cat.buffer && {color: colors.warning},
                ]}>
                  {formatAmount(total, currency)}
                </Text>
                <Text style={s.bufferValue}>{formatAmount(cat.expectedAmount, currency)}</Text>
                <Text style={s.bufferValue}>{formatAmount(cat.expectedAmount + cat.buffer, currency)}</Text>
              </View>
              <View style={s.segmentedTrack}>
                <View style={[s.segmentExpected, {flex: cat.expectedAmount}]} />
                <View style={[s.segmentBuffer, {flex: cat.buffer}]} />
              </View>
              <View style={s.segmentedFillWrapper}>
                <View style={[s.segmentedFill, {
                  width: `${Math.min((total / (cat.expectedAmount + cat.buffer)) * 100, 100)}%`,
                  backgroundColor: total > cat.expectedAmount + cat.buffer ? colors.danger : total > cat.expectedAmount ? colors.warning : colors.success,
                }]} />
              </View>
              <Text style={s.bufferHint}>
                {total <= cat.expectedAmount
                  ? '✅ Within expected amount'
                  : total <= cat.expectedAmount + cat.buffer
                  ? `⚠️ In buffer zone — ${formatAmount(cat.expectedAmount + cat.buffer - total, currency)} left`
                  : `🔴 ${formatAmount(total - cat.expectedAmount - cat.buffer, currency)} over limit`}
              </Text>
            </View>
          )}

          {!hasBuffer && (
            <View style={[s.totalPill, {backgroundColor: cat.color + '22'}]}>
              <Text style={[s.totalPillText, {color: cat.color}]}>Total: {formatAmount(total, currency)}</Text>
            </View>
          )}

          {subCats.length > 0 && (
            <>
              <Text style={s.subBreakdownTitle}>Breakdown</Text>
              {subCats.map(sub => {
                const subSpent = subTotals[sub.id] || 0;
                const hasBudget = sub.budget > 0;
                const progress = hasBudget ? subSpent / sub.budget : 0;
                return (
                  <View key={sub.id} style={s.subBreakRow}>
                    <Text style={s.subBreakIcon}>{sub.icon}</Text>
                    <View style={{flex: 1}}>
                      <View style={s.subBreakHeader}>
                        <Text style={s.subBreakName}>{sub.name}</Text>
                        <Text style={s.subBreakAmount}>
                          {formatAmount(subSpent, currency)}{hasBudget ? ` / ${formatAmount(sub.budget, currency)}` : ''}
                        </Text>
                      </View>
                      {hasBudget && (
                        <View style={s.progressTrack}>
                          <View style={[s.progressFill, {
                            width: `${Math.min(progress * 100, 100)}%`,
                            backgroundColor: progress > 1 ? colors.danger : cat.color,
                          }]} />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              {(() => {
                const uncatTotal = catExpenses.filter(e => !e.subCategoryId).reduce((sum, e) => sum + e.amount, 0);
                if (uncatTotal === 0) return null;
                return (
                  <View style={s.subBreakRow}>
                    <Text style={s.subBreakIcon}>📌</Text>
                    <View style={{flex: 1}}>
                      <View style={s.subBreakHeader}>
                        <Text style={s.subBreakName}>Other</Text>
                        <Text style={s.subBreakAmount}>{formatAmount(uncatTotal, currency)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </>
          )}

          <Text style={s.subBreakdownTitle}>Expenses</Text>
          <ScrollView style={s.modalList} showsVerticalScrollIndicator={false}>
            {catExpenses.length === 0 && <Text style={s.empty}>No expenses this month.</Text>}
            {catExpenses.map(exp => {
              const sub = subCats.find(sc => sc.id === exp.subCategoryId);
              return (
                <TouchableOpacity
                  key={exp.id}
                  style={s.expRow}
                  onPress={() => onEditExpense(exp)}
                  activeOpacity={0.7}>
                  <View style={s.expInfo}>
                    {exp.note ? <Text style={s.expNote}>{exp.note}</Text> : null}
                    <Text style={s.expDate}>
                      {format(new Date(exp.date), 'dd MMM yyyy')}
                      {sub ? ` · ${sub.icon} ${sub.name}` : ''}
                      {exp.isRecurring ? ' · 🔁' : ''}
                    </Text>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text style={s.expAmount}>{formatAmount(exp.amount, currency)}</Text>
                    <Text style={{fontSize: 10, color: colors.textSecondary, marginTop: 2}}>tap to edit</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── FAB choice modal ─────────────────────────────────────────────────────────

function FabChoiceModal({visible, onClose, onAddExpense, onScanReceipt}: {
  visible: boolean; onClose: () => void; onAddExpense: () => void; onScanReceipt: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={fabStyles.overlay} onPress={onClose}>
        <View style={[fabStyles.sheet, {backgroundColor: colors.surface}]}>
          <Text style={[fabStyles.title, {color: colors.text}]}>What would you like to do?</Text>
          <TouchableOpacity style={[fabStyles.btn, {backgroundColor: colors.primary}]} onPress={onAddExpense} activeOpacity={0.85}>
            <Text style={fabStyles.btnIcon}>📝</Text>
            <Text style={fabStyles.btnText}>Add Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[fabStyles.btn, {backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary}]} onPress={onScanReceipt} activeOpacity={0.85}>
            <Text style={fabStyles.btnIcon}>🧾</Text>
            <Text style={[fabStyles.btnText, {color: colors.primary}]}>Scan Receipt</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const fabStyles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40},
  title: {fontSize: 17, fontWeight: '700', marginBottom: 16, textAlign: 'center'},
  btn: {flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, marginBottom: 10},
  btnIcon: {fontSize: 22, marginRight: 12},
  btnText: {fontSize: 16, fontWeight: '700', color: '#fff'},
});

// ─── Bank notification centre ─────────────────────────────────────────────────

type SplitRow = {id: string; categoryId: string | null; subCategoryId: string | null; amount: string};

type EditState = {
  splitMode: boolean;
  categoryId: string | null;
  subCategoryId: string | null;
  splits: SplitRow[];
};

function NotifItem({
  notif,
  categories,
  currency,
  onConfirm,
  onConfirmIncome,
  onDelete,
}: {
  notif: BankNotification;
  categories: Category[];
  currency: string;
  onConfirm: (expenses: Expense[]) => void;
  onConfirmIncome: (event: IncomeEvent) => void;
  onDelete: () => void;
}) {
  const {colors} = useTheme();
  const [edit, setEdit] = useState<EditState>({
    splitMode: false,
    categoryId: notif.suggestedCategoryId,
    subCategoryId: notif.suggestedSubCategoryId,
    splits: [],
  });
  const [showCatPicker, setShowCatPicker] = useState<'main' | number | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState<'main' | number | null>(null);

  // Credit transactions → income flow
  const TYPE_OPTIONS: {value: IncomeEvent['type']; label: string; icon: string}[] = [
    {value: 'reimbursement', label: 'Reimbursement', icon: '💸'},
    {value: 'other',        label: 'Income',         icon: '💰'},
    {value: 'freelance',    label: 'Freelance',       icon: '💼'},
    {value: 'gift',         label: 'Gift',            icon: '🎁'},
  ];
  const [creditType, setCreditType] = useState<IncomeEvent['type']>(
    notif.suggestedIncomeType ?? 'other'
  );
  if (notif.type === 'credit') {
    return (
      <View style={[niStyles.card, {backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.success, borderColor: colors.success + '44'}]}>
        <View style={niStyles.headerRow}>
          <View style={{flex: 1}}>
            <Text style={[niStyles.merchant, {color: colors.text}]} numberOfLines={1}>{notif.merchantName || notif.description}</Text>
            <Text style={[niStyles.date, {color: colors.textSecondary}]}>{notif.date}</Text>
          </View>
          <Text style={[niStyles.amount, {color: colors.success}]}>+{currency}{notif.amount.toFixed(2)}</Text>
        </View>

        {/* Reimbursement reason hint */}
        {notif.reimbursementReason ? (
          <View style={[niStyles.reasonBox, {backgroundColor: colors.warning + '22', borderColor: colors.warning + '66'}]}>
            <Text style={[niStyles.reasonText, {color: colors.text}]}>
              ⚠️ {notif.reimbursementReason}
            </Text>
            <Text style={[niStyles.reasonHint, {color: colors.textSecondary}]}>Is this correct? Choose the type below.</Text>
          </View>
        ) : (
          <Text style={{fontSize: 12, color: colors.textSecondary, marginBottom: 8}}>💚 Incoming payment — what type is this?</Text>
        )}

        {/* Type chips */}
        <View style={niStyles.typeChipRow}>
          {TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[niStyles.typeChip, {borderColor: colors.border, backgroundColor: colors.background},
                creditType === opt.value && {backgroundColor: colors.success, borderColor: colors.success}]}
              onPress={() => setCreditType(opt.value)}>
              <Text style={[niStyles.typeChipText, {color: colors.text},
                creditType === opt.value && {color: '#fff', fontWeight: '700'}]}>
                {opt.icon} {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={niStyles.actionRow}>
          <TouchableOpacity
            style={[niStyles.confirmBtn, {backgroundColor: colors.success}]}
            onPress={() => onConfirmIncome({
              id: uuidv4(),
              amount: notif.amount,
              note: notif.merchantName || notif.description,
              date: notif.date,
              type: creditType,
            })}>
            <Text style={niStyles.confirmBtnText}>✓ Log as {TYPE_OPTIONS.find(o => o.value === creditType)?.label ?? 'Income'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[niStyles.deleteBtn, {borderColor: colors.danger}]} onPress={onDelete}>
            <Text style={[niStyles.deleteBtnText, {color: colors.danger}]}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const cat = categories.find(c => c.id === edit.categoryId);
  const sub = cat?.subCategories.find(sc => sc.id === edit.subCategoryId);

  const activeCatForPicker = showCatPicker === 'main'
    ? cat
    : typeof showCatPicker === 'number'
      ? categories.find(c => c.id === edit.splits[showCatPicker]?.categoryId)
      : null;

  const enterSplitMode = () => {
    const half = parseFloat((notif.amount / 2).toFixed(2));
    setEdit(e => ({
      ...e,
      splitMode: true,
      splits: [
        {id: uuidv4(), categoryId: e.categoryId, subCategoryId: e.subCategoryId, amount: String(half)},
        {id: uuidv4(), categoryId: null, subCategoryId: null, amount: String((notif.amount - half).toFixed(2))},
      ],
    }));
  };

  const addSplitRow = () => {
    setEdit(e => ({...e, splits: [...e.splits, {id: uuidv4(), categoryId: null, subCategoryId: null, amount: ''}]}));
  };

  const removeSplitRow = (idx: number) => {
    setEdit(e => ({...e, splits: e.splits.filter((_, i) => i !== idx)}));
  };

  const handleConfirm = () => {
    const date = notif.date;
    const note = notif.merchantName || notif.description;

    if (edit.splitMode) {
      const totalSplits = edit.splits.reduce((sum, sp) => sum + (parseFloat(sp.amount) || 0), 0);
      if (Math.abs(totalSplits - notif.amount) > 0.01) {
        Alert.alert('Amount mismatch', `Splits total ${formatAmount(totalSplits, currency)} but transaction is ${formatAmount(notif.amount, currency)}. Please adjust.`);
        return;
      }
      const missingCat = edit.splits.find(sp => !sp.categoryId);
      if (missingCat) {
        Alert.alert('Missing category', 'Please assign a category to every split.');
        return;
      }
      const expenses: Expense[] = edit.splits.map(sp => ({
        id: uuidv4(), categoryId: sp.categoryId!, subCategoryId: sp.subCategoryId ?? undefined,
        amount: parseFloat(sp.amount), note, date, isRecurring: false,
      }));
      onConfirm(expenses);
    } else {
      if (!edit.categoryId) {
        Alert.alert('No category', 'Please assign a category before confirming.');
        return;
      }
      const expense: Expense = {
        id: uuidv4(), categoryId: edit.categoryId,
        subCategoryId: edit.subCategoryId ?? undefined,
        amount: notif.amount, note, date, isRecurring: false,
      };
      onConfirm([expense]);
    }
  };

  return (
    <View style={[niStyles.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
      {/* Header row */}
      <View style={niStyles.headerRow}>
        <View style={{flex: 1}}>
          <Text style={[niStyles.merchant, {color: colors.text}]} numberOfLines={1}>{notif.merchantName || notif.description}</Text>
          <Text style={[niStyles.date, {color: colors.textSecondary}]}>{notif.date}</Text>
        </View>
        <Text style={[niStyles.amount, {color: colors.text}]}>{currency}{notif.amount.toFixed(2)}</Text>
      </View>

      {/* Single-category mode */}
      {!edit.splitMode && (
        <View style={niStyles.catRow}>
          <TouchableOpacity
            style={[niStyles.catPill, {borderColor: cat?.color ?? colors.border}]}
            onPress={() => setShowCatPicker('main')}>
            <Text style={niStyles.catPillIcon}>{sub?.icon ?? cat?.icon ?? '📂'}</Text>
            <Text style={[niStyles.catPillText, {color: cat ? colors.text : colors.textSecondary}]} numberOfLines={1}>
              {sub ? `${cat?.name} › ${sub.name}` : cat?.name ?? 'Assign category'}
            </Text>
            <Text style={{color: colors.textSecondary, marginLeft: 4}}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[niStyles.splitBtn, {borderColor: colors.border}]} onPress={enterSplitMode}>
            <Text style={[niStyles.splitBtnText, {color: colors.primary}]}>Split</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Split mode */}
      {edit.splitMode && (
        <View style={niStyles.splitSection}>
          {edit.splits.map((sp, idx) => {
            const spCat = categories.find(c => c.id === sp.categoryId);
            const spSub = spCat?.subCategories.find(sc => sc.id === sp.subCategoryId);
            return (
              <View key={sp.id} style={niStyles.splitRow}>
                <TouchableOpacity
                  style={[niStyles.splitCatPill, {borderColor: spCat?.color ?? colors.border}]}
                  onPress={() => setShowCatPicker(idx)}>
                  <Text style={niStyles.catPillIcon}>{spSub?.icon ?? spCat?.icon ?? '📂'}</Text>
                  <Text style={[niStyles.catPillText, {color: spCat ? colors.text : colors.textSecondary}]} numberOfLines={1}>
                    {spSub ? `${spCat?.name} › ${spSub.name}` : spCat?.name ?? 'Category'}
                  </Text>
                </TouchableOpacity>
                <TextInput
                  style={[niStyles.splitAmtInput, {color: colors.text, borderColor: colors.border, backgroundColor: colors.background}]}
                  keyboardType="decimal-pad"
                  value={sp.amount}
                  onChangeText={v => setEdit(e => ({...e, splits: e.splits.map((r, i) => i === idx ? {...r, amount: v} : r)}))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity onPress={() => removeSplitRow(idx)} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <Text style={{color: colors.danger, fontSize: 18, marginLeft: 6}}>×</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity onPress={addSplitRow} style={niStyles.addSplitBtn}>
            <Text style={[niStyles.addSplitText, {color: colors.primary}]}>+ Add split</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Confirm / Delete */}
      <View style={niStyles.actionRow}>
        <TouchableOpacity style={[niStyles.confirmBtn, {backgroundColor: colors.primary}]} onPress={handleConfirm}>
          <Text style={niStyles.confirmBtnText}>✓ Confirm Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[niStyles.deleteBtn, {borderColor: colors.danger}]} onPress={onDelete}>
          <Text style={[niStyles.deleteBtnText, {color: colors.danger}]}>🗑</Text>
        </TouchableOpacity>
      </View>

      {/* Quick-add category modal */}
      <QuickAddCategoryModal
        visible={showQuickAdd !== null}
        onClose={() => setShowQuickAdd(null)}
        onCreated={cat => {
          if (showQuickAdd === 'main') {
            setEdit(e => ({...e, categoryId: cat.id, subCategoryId: null}));
          } else if (typeof showQuickAdd === 'number') {
            setEdit(e => ({...e, splits: e.splits.map((r, i) => i === showQuickAdd ? {...r, categoryId: cat.id, subCategoryId: null} : r)}));
          }
          setShowQuickAdd(null);
        }}
      />

      {/* Category picker modal (shared for both main and split rows) */}
      <Modal
        transparent statusBarTranslucent animationType="slide"
        visible={showCatPicker !== null}
        onRequestClose={() => setShowCatPicker(null)}>
        <Pressable style={niStyles.pickerOverlay} onPress={() => setShowCatPicker(null)}>
          <View style={[niStyles.pickerSheet, {backgroundColor: colors.surface}]}>
            <View style={[niStyles.pickerHeader, {borderBottomColor: colors.border}]}>
              <Text style={[niStyles.pickerTitle, {color: colors.text}]}>Choose Category</Text>
              <TouchableOpacity onPress={() => setShowCatPicker(null)}>
                <Text style={{color: colors.primary, fontSize: 16}}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={niStyles.pickerContent} showsVerticalScrollIndicator={false}>
              <Text style={[niStyles.pickerSectionLabel, {color: colors.textSecondary}]}>Category</Text>
              <View style={niStyles.chipGrid}>
                {categories.map(c => {
                  const isSelected = showCatPicker === 'main'
                    ? edit.categoryId === c.id
                    : typeof showCatPicker === 'number' && edit.splits[showCatPicker]?.categoryId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[niStyles.chip, {borderColor: colors.border, backgroundColor: colors.background},
                        isSelected && {backgroundColor: c.color, borderColor: c.color}]}
                      onPress={() => {
                        if (showCatPicker === 'main') {
                          setEdit(e => ({...e, categoryId: c.id, subCategoryId: null}));
                        } else if (typeof showCatPicker === 'number') {
                          setEdit(e => ({...e, splits: e.splits.map((r, i) => i === showCatPicker ? {...r, categoryId: c.id, subCategoryId: null} : r)}));
                        }
                      }}>
                      <Text style={niStyles.chipIcon}>{c.icon}</Text>
                      <Text style={[niStyles.chipText, {color: colors.text}, isSelected && {color: '#fff'}]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Quick-add chip */}
                <TouchableOpacity
                  style={[niStyles.chip, {borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.background}]}
                  onPress={() => setShowQuickAdd(showCatPicker)}>
                  <Text style={niStyles.chipIcon}>＋</Text>
                  <Text style={[niStyles.chipText, {color: colors.primary}]}>New</Text>
                </TouchableOpacity>
              </View>
              {activeCatForPicker && activeCatForPicker.subCategories.length > 0 && (
                <>
                  <Text style={[niStyles.pickerSectionLabel, {color: colors.textSecondary, marginTop: spacing.md}]}>Sub-category</Text>
                  <View style={niStyles.chipGrid}>
                    {activeCatForPicker.subCategories.map(sc => {
                      const isSelected = showCatPicker === 'main'
                        ? edit.subCategoryId === sc.id
                        : typeof showCatPicker === 'number' && edit.splits[showCatPicker]?.subCategoryId === sc.id;
                      return (
                        <TouchableOpacity
                          key={sc.id}
                          style={[niStyles.chip, {borderColor: colors.border, backgroundColor: colors.background},
                            isSelected && {backgroundColor: activeCatForPicker.color, borderColor: activeCatForPicker.color}]}
                          onPress={() => {
                            if (showCatPicker === 'main') {
                              setEdit(e => ({...e, subCategoryId: e.subCategoryId === sc.id ? null : sc.id}));
                            } else if (typeof showCatPicker === 'number') {
                              setEdit(e => ({...e, splits: e.splits.map((r, i) => i === showCatPicker ? {...r, subCategoryId: r.subCategoryId === sc.id ? null : sc.id} : r)}));
                            }
                          }}>
                          <Text style={niStyles.chipIcon}>{sc.icon}</Text>
                          <Text style={[niStyles.chipText, {color: colors.text}, isSelected && {color: '#fff'}]}>{sc.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const niStyles = StyleSheet.create({
  card: {borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10},
  headerRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  merchant: {fontSize: 15, fontWeight: '700'},
  date: {fontSize: 12, marginTop: 2},
  amount: {fontSize: 16, fontWeight: '700'},
  catRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10},
  catPill: {flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7},
  catPillIcon: {fontSize: 14, marginRight: 5},
  catPillText: {fontSize: 13, flex: 1},
  splitBtn: {borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7},
  splitBtnText: {fontSize: 13, fontWeight: '700'},
  splitSection: {marginBottom: 10},
  splitRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
  splitCatPill: {flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5},
  splitAmtInput: {width: 72, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, marginLeft: 6, textAlign: 'right'},
  addSplitBtn: {paddingVertical: 6},
  addSplitText: {fontSize: 13, fontWeight: '600'},
  actionRow: {flexDirection: 'row', gap: 8},
  confirmBtn: {flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center'},
  confirmBtnText: {color: '#fff', fontSize: 14, fontWeight: '700'},
  deleteBtn: {borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center'},
  deleteBtnText: {fontSize: 18},
  // Credit type picker
  reasonBox: {borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10},
  reasonText: {fontSize: 13, fontWeight: '600', marginBottom: 2},
  reasonHint: {fontSize: 11},
  typeChipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10},
  typeChip: {borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5},
  typeChipText: {fontSize: 12},
  // Category picker
  pickerOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  pickerSheet: {borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 40},
  pickerHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth},
  pickerTitle: {fontSize: 17, fontWeight: '700'},
  pickerContent: {padding: spacing.md},
  pickerSectionLabel: {fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8},
  chipGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6},
  chipIcon: {fontSize: 14, marginRight: 4},
  chipText: {fontSize: 13},
});

// ─── Bell notification centre modal ──────────────────────────────────────────

function BankNotifCentreModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const {bankNotifications, confirmBankNotification, removeBankNotification, clearBankNotifications, categories, settings, addIncomeEvent} = useBudget();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleConfirm = useCallback(async (notif: BankNotification, expenses: Expense[]) => {
    // Save merchant mapping from the first expense (primary category)
    const primary = expenses[0];
    if (primary && notif.merchantName) {
      await saveMerchantEntry(notif.merchantName, primary.categoryId, primary.subCategoryId);
    }
    confirmBankNotification(notif.id, expenses);
  }, [confirmBankNotification]);

  const handleConfirmIncome = useCallback((notif: BankNotification, event: IncomeEvent) => {
    addIncomeEvent(event);
    removeBankNotification(notif.id);
  }, [addIncomeEvent, removeBankNotification]);

  return (
    <Modal transparent statusBarTranslucent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={[ncStyles.container, {backgroundColor: colors.background}]}>
        {/* Header */}
        <View style={[ncStyles.header, {backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: spacing.md + insets.top}]}>
          <TouchableOpacity onPress={onClose} style={ncStyles.closeBtn}>
            <Text style={[ncStyles.closeBtnText, {color: colors.primary}]}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={[ncStyles.headerTitle, {color: colors.text}]}>🔔 Bank Transactions</Text>
          {bankNotifications.length > 0 && (
            <TouchableOpacity onPress={() => setShowClearConfirm(true)}>
              <Text style={[ncStyles.clearAllText, {color: colors.danger}]}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>

        {bankNotifications.length === 0 ? (
          <View style={ncStyles.emptyState}>
            <Text style={ncStyles.emptyEmoji}>✅</Text>
            <Text style={[ncStyles.emptyTitle, {color: colors.text}]}>All caught up!</Text>
            <Text style={[ncStyles.emptySubtitle, {color: colors.textSecondary}]}>No pending bank transactions.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={ncStyles.list} showsVerticalScrollIndicator={false}>
            {bankNotifications.map(notif => (
              <NotifItem
                key={notif.id}
                notif={notif}
                categories={categories}
                currency={settings.currency}
                onConfirm={expenses => handleConfirm(notif, expenses)}
                onConfirmIncome={event => handleConfirmIncome(notif, event)}
                onDelete={() => removeBankNotification(notif.id)}
              />
            ))}
            <View style={{height: 40}} />
          </ScrollView>
        )}
      </View>
      <ConfirmModal
        visible={showClearConfirm}
        icon="🗑️"
        title="Clear all transactions?"
        message={`Remove all ${bankNotifications.length} pending transaction${bankNotifications.length !== 1 ? 's' : ''}?`}
        confirmLabel="Clear all"
        confirmDanger
        onConfirm={() => { setShowClearConfirm(false); clearBankNotifications(); }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </Modal>
  );
}

const ncStyles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth},
  closeBtn: {paddingRight: 8},
  closeBtnText: {fontSize: 16, fontWeight: '600'},
  headerTitle: {fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center'},
  clearAllText: {fontSize: 14, fontWeight: '600'},
  emptyState: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  emptyEmoji: {fontSize: 52, marginBottom: 12},
  emptyTitle: {fontSize: 18, fontWeight: '700', marginBottom: 4},
  emptySubtitle: {fontSize: 14},
  list: {padding: spacing.md},
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const {colors, isDark} = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const {categories, expenses, settings, isLoading, effectiveBudget, bankNotifications, incomeEvents, addExpense, addIncomeEvent, updateExpense, deleteExpense, addBankNotifications} = useBudget();
  const {openMenu} = useContext(MenuContext);

  const [selectedCat, setSelectedCat]         = useState<Category | null>(null);
  const [showFabMenu, setShowFabMenu]         = useState(false);
  const [showNotifCentre, setShowNotifCentre] = useState(false);
  const [editingExpense, setEditingExpense]   = useState<Expense | null>(null);

  // Auto-sync bank on app foreground
  const autoSync = useCallback(async () => {
    try {
      const connected = await isBankConnected();
      if (!connected) return;
      const lastSync = await getBankLastSyncDate();
      const txs = await fetchBankTransactions(lastSync ?? undefined);
      if (txs.length === 0) return;

      const [merchantMap, freshCategories, freshExpenses, importedTxIds] = await Promise.all([
        getMerchantMap(),
        storage.getCategories(),
        storage.getExpenses(),
        getImportedTxIds(),
      ]);

      const newTxs = txs.filter(tx => !importedTxIds.has(tx.id));
      if (newTxs.length === 0) return;

      const debitsToClassify = newTxs.filter(
        tx => tx.type === 'debit' && !merchantMap[(tx.merchantName ?? tx.description).toLowerCase().trim()]
      );

      let geminiMap: Record<string, {categoryId: string | null; subCategoryId: string | null}> = {};
      if (debitsToClassify.length > 0 && freshCategories.length > 0) {
        geminiMap = await categoriseTransactions(
          debitsToClassify.map(tx => ({id: tx.id, merchantName: tx.merchantName, description: tx.description, amount: tx.amount, bankCategory: tx.category})),
          freshCategories.map(cat => ({id: cat.id, name: cat.name, icon: cat.icon, subCategories: cat.subCategories.map(sub => ({id: sub.id, name: sub.name, icon: sub.icon}))}))
        );
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
          addExpense({id: uuidv4(), categoryId: mapped.categoryId!, subCategoryId: mapped.subCategoryId ?? undefined, amount: tx.amount, note: tx.merchantName ?? tx.description, date: tx.date, isRecurring: false});
        } else {
          const gemini = geminiMap[tx.id];
          const catId = gemini?.categoryId ?? null;
          if (catId) {
            addExpense({id: uuidv4(), categoryId: catId, subCategoryId: gemini?.subCategoryId ?? undefined, amount: tx.amount, note: tx.merchantName ?? tx.description, date: tx.date, isRecurring: false});
            saveMerchantEntry(tx.merchantName ?? tx.description, catId, gemini?.subCategoryId ?? undefined).catch(() => {});
          } else {
            newNotifications.push({id: uuidv4(), txId: tx.id, date: tx.date, amount: tx.amount, type: tx.type, merchantName: tx.merchantName ?? tx.description, description: tx.description, suggestedCategoryId: null, suggestedSubCategoryId: null});
            unknownForNotif.push({tx});
          }
        }
      }

      if (newNotifications.length > 0) {
        await addBankNotifications(newNotifications);
        const firedMerchants = new Set<string>();
        for (const {tx} of unknownForNotif) {
          const merchant = tx.merchantName ?? tx.description;
          if (!firedMerchants.has(merchant)) {
            firedMerchants.add(merchant);
            fireBankTransactionNotification({txId: tx.id, merchantName: merchant, amount: tx.amount, currency: settings.currency}).catch(() => {});
          }
        }
      }

      await addImportedTxIds(newTxs.map(tx => tx.id));
      await saveBankLastSyncDate(format(new Date(), 'yyyy-MM-dd'));
    } catch {
      // Silent fail — auto-sync is best-effort
    }
  }, [addExpense, addBankNotifications, settings.currency]);

  // Sync on mount and when app comes back to foreground
  useEffect(() => {
    autoSync();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') autoSync();
    });
    return () => sub.remove();
  }, [autoSync]);

  const month = currentMonth();
  const week = currentWeekOfMonth();

  const monthlyExpenses       = useMemo(() => expensesForMonth(expenses, month), [expenses, month]);
  const weeklyExpenses        = useMemo(() => expensesForWeek(expenses, month, week), [expenses, month, week]);
  const spentByCategory       = useMemo(() => totalByCategory(monthlyExpenses), [monthlyExpenses]);
  const weeklySpentByCategory = useMemo(() => totalByCategory(weeklyExpenses), [weeklyExpenses]);
  const totalMonthlySpent     = useMemo(() => totalSpent(monthlyExpenses), [monthlyExpenses]);
  const monthlyIncomeEvents   = useMemo(() => incomeEventsForMonth(incomeEvents, month), [incomeEvents, month]);
  const totalMonthlyReceived  = useMemo(() => totalReceived(monthlyIncomeEvents), [monthlyIncomeEvents]);

  const income          = settings.incomeAmount;
  const remaining       = income + totalMonthlyReceived - totalMonthlySpent;
  const overallProgress = income > 0 ? totalMonthlySpent / income : 0;

  // Set bell + hamburger in header right — re-runs when badge count or theme changes
  useLayoutEffect(() => {
    const count = bankNotifications.length;
    navigation.setOptions({
      headerLeft: () => null,
      headerRight: () => (
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          {/* Bell — opens notification centre */}
          <TouchableOpacity
            onPress={() => setShowNotifCentre(true)}
            style={bellStyles.btn}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            activeOpacity={0.7}>
            <Text style={bellStyles.icon}>🔔</Text>
            {count > 0 && (
              <View style={[bellStyles.badge, {backgroundColor: colors.danger}]}>
                <Text style={bellStyles.badgeText}>{count > 99 ? '99+' : count}</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Hamburger — opens nav menu */}
          <TouchableOpacity
            onPress={openMenu}
            style={bellStyles.hamburger}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            activeOpacity={0.7}>
            <Text style={[bellStyles.icon, {color: colors.text}]}>☰</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [bankNotifications.length, colors.danger, colors.text, openMenu]);

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const getBarColor = (spent: number, cat: Category, budget: number) => {
    if (cat.expectedAmount > 0) {
      if (spent > cat.expectedAmount + cat.buffer) return colors.danger;
      if (spent > cat.expectedAmount) return colors.warning;
      return colors.success;
    }
    const p = budget > 0 ? spent / budget : 0;
    if (p > 1) return colors.danger;
    if (p > 0.9) return colors.danger + 'CC';
    if (p > 0.75) return colors.warning + 'CC';
    return cat.color;
  };

  const getProgressWidth = (spent: number, cat: Category, budget: number) => {
    if (cat.expectedAmount > 0) {
      const total = cat.expectedAmount + cat.buffer;
      return `${Math.min((spent / total) * 100, 100)}%` as `${number}%`;
    }
    if (budget <= 0) return '0%' as `${number}%`;
    return `${Math.min((spent / budget) * 100, 100)}%` as `${number}%`;
  };

  return (
    <View style={{flex: 1, backgroundColor: colors.background}}>
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, {paddingBottom: 100 + insets.bottom}]}
        showsVerticalScrollIndicator={false}>

        {/* Summary card */}
        <View style={[s.summaryCard, {borderColor: colors.primary + '44', backgroundColor: isDark ? '#0D2137' : '#EFF9FF'}]}>
          <View style={s.summaryTopRow}>
            <Text style={s.monthLabel}>{monthLabel(month)}</Text>
          </View>
          <View style={s.amountsRow}>
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>Spent</Text>
              <Text style={[s.amountValue, {color: colors.danger}]}>{formatAmount(totalMonthlySpent, settings.currency)}</Text>
            </View>
            <View style={[s.amountDivider, {backgroundColor: colors.primary + '33'}]} />
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>{remaining >= 0 ? 'Remaining' : 'Over budget'}</Text>
              <Text style={[s.amountValue, {color: remaining >= 0 ? colors.success : colors.danger}]}>{formatAmount(Math.abs(remaining), settings.currency)}</Text>
            </View>
            <View style={[s.amountDivider, {backgroundColor: colors.primary + '33'}]} />
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>Income</Text>
              <Text style={[s.amountValue, {color: colors.primary}]}>{formatAmount(income, settings.currency)}</Text>
            </View>
          </View>
          {totalMonthlyReceived > 0 && (
            <View style={s.receivedRow}>
              <Text style={s.receivedLabel}>+ {formatAmount(totalMonthlyReceived, settings.currency)} received this month</Text>
            </View>
          )}
          {income > 0 && (
            <View style={s.progressTrack}>
              <View style={[s.progressFill, {
                width: `${Math.min(overallProgress * 100, 100)}%`,
                backgroundColor: overallProgress > 0.9 ? colors.danger : overallProgress > 0.75 ? colors.warning : colors.primary,
              }]} />
            </View>
          )}
        </View>

        {/* Weekly section */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionAccent, {backgroundColor: colors.warning}]} />
          <Text style={s.sectionTitle}>📅 {WEEK_LABELS[week]}</Text>
        </View>
        {categories.filter(c => c.weeklyTracking).length === 0 && (
          <Text style={s.empty}>No weekly categories — enable 📅 Weekly tracking in Settings.</Text>
        )}
        {categories.filter(c => c.weeklyTracking).map(cat => {
          const spent = weeklySpentByCategory[cat.id] || 0;
          const budget = effectiveBudget(cat.id);
          const weeklyBudget = budget > 0 ? budget / 4 : 0;
          const hasBudget = weeklyBudget > 0;
          const isOver = hasBudget && spent > weeklyBudget;
          return (
            <TouchableOpacity key={cat.id} style={s.catCard} onPress={() => setSelectedCat(cat)} activeOpacity={0.75}>
              <View style={s.catHeader}>
                <View style={[s.colorDot, {backgroundColor: cat.color}]} />
                <Text style={s.catIconText}>{cat.icon}</Text>
                <View style={{flex: 1}}>
                  <Text style={s.catName}>{cat.name}</Text>
                  <Text style={s.catSubtitle}>Tap to view expenses</Text>
                </View>
                <Text style={[s.catSpent, isOver && {color: colors.danger}]}>
                  {formatAmount(spent, settings.currency)}
                  {hasBudget && ` / ${formatAmount(weeklyBudget, settings.currency)}`}
                </Text>
              </View>
              {hasBudget && (
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, {width: getProgressWidth(spent, cat, weeklyBudget), backgroundColor: getBarColor(spent, cat, weeklyBudget)}]} />
                </View>
              )}
              {isOver && <Text style={s.overLabel}>{formatAmount(spent - weeklyBudget, settings.currency)} over this week</Text>}
            </TouchableOpacity>
          );
        })}

        {/* Monthly section */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionAccent, {backgroundColor: colors.primary}]} />
          <Text style={s.sectionTitle}>📊 This Month</Text>
        </View>
        {categories.length === 0 && (
          <View style={s.emptyStateCard}>
            <Text style={s.emptyStateEmoji}>🐷</Text>
            <Text style={[s.emptyStateTitle, {color: colors.text}]}>Welcome to PiggyBudget!</Text>
            <Text style={[s.emptyStateBody, {color: colors.textSecondary}]}>
              Start by adding your first category in Settings, then tap + to log an expense.
            </Text>
          </View>
        )}
        {categories.map(cat => {
          const spent = spentByCategory[cat.id] || 0;
          const budget = effectiveBudget(cat.id);
          const hasBudget = budget > 0 || cat.expectedAmount > 0;
          const hasRollover = cat.rollover && cat.budget > 0 && budget > cat.budget;
          const hasSubs = (cat.subCategories?.length ?? 0) > 0;
          const hasBuffer = cat.expectedAmount > 0;
          return (
            <TouchableOpacity key={cat.id} style={s.catCard} onPress={() => setSelectedCat(cat)} activeOpacity={0.75}>
              <View style={s.catHeader}>
                <View style={[s.colorDot, {backgroundColor: cat.color}]} />
                <Text style={s.catIconText}>{cat.icon}</Text>
                <View style={{flex: 1}}>
                  <Text style={s.catName}>{cat.name}</Text>
                  {hasRollover && <Text style={s.rolloverLabel}>+{formatAmount(budget - cat.budget, settings.currency)} rollover</Text>}
                  {hasSubs && <Text style={s.catSubtitle}>{cat.subCategories.length} sub-categories</Text>}
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={[s.catSpent, spent > (cat.expectedAmount > 0 ? cat.expectedAmount + cat.buffer : budget) && {color: colors.danger}]}>
                    {formatAmount(spent, settings.currency)}
                    {budget > 0 && !hasBuffer && ` / ${formatAmount(budget, settings.currency)}`}
                  </Text>
                  {hasBuffer && (
                    <Text style={s.bufferBadge}>exp {formatAmount(cat.expectedAmount, settings.currency)} +{formatAmount(cat.buffer, settings.currency)}</Text>
                  )}
                </View>
              </View>
              {hasBudget && (
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, {width: getProgressWidth(spent, cat, budget), backgroundColor: getBarColor(spent, cat, budget)}]} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, {bottom: 28 + insets.bottom}]}
        onPress={() => setShowFabMenu(true)}
        activeOpacity={0.85}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* FAB choice modal */}
      <FabChoiceModal
        visible={showFabMenu}
        onClose={() => setShowFabMenu(false)}
        onAddExpense={() => { setShowFabMenu(false); navigation.navigate('Add'); }}
        onScanReceipt={() => { setShowFabMenu(false); navigation.navigate('ReceiptScanner'); }}
      />

      {/* Category detail modal */}
      {selectedCat && (
        <CategoryModal
          cat={selectedCat}
          expenses={monthlyExpenses}
          currency={settings.currency}
          onClose={() => setSelectedCat(null)}
          onEditExpense={exp => setEditingExpense(exp)}
        />
      )}

      {/* Edit expense modal */}
      {editingExpense && (
        <EditExpenseModal
          exp={editingExpense}
          categories={categories}
          currency={settings.currency}
          onClose={() => setEditingExpense(null)}
          onSave={updated => {
            updateExpense(updated);
            setEditingExpense(null);
          }}
          onDelete={id => {
            deleteExpense(id);
            setEditingExpense(null);
          }}
        />
      )}

      {/* Bank notification centre */}
      <BankNotifCentreModal visible={showNotifCentre} onClose={() => setShowNotifCentre(false)} />
    </View>
  );
}

// ─── Bell styles ──────────────────────────────────────────────────────────────
const bellStyles = StyleSheet.create({
  btn:       {marginLeft: 4, padding: 10},
  hamburger: {marginLeft: 20, padding: 10, marginRight: 4},
  icon: {fontSize: 22},
  badge: {position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3},
  badgeText: {color: '#fff', fontSize: 10, fontWeight: '700'},
});

// ─── Main styles ──────────────────────────────────────────────────────────────
const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.md},
    center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},

    // FAB — bottom is applied dynamically with insets
    fab: {position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: colors.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 8},
    fabText: {fontSize: 32, color: '#fff', lineHeight: 36, marginTop: -2},

    // Summary card
    summaryCard: {borderRadius: 18, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1.5},
    summaryTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm},
    monthLabel: {...typography.subtitle, color: colors.textSecondary},
    amountsRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm},
    amountBlock: {flex: 1, alignItems: 'center'},
    amountDivider: {width: 1, height: 32, borderRadius: 1},
    amountLabel: {...typography.caption, color: colors.textSecondary, marginBottom: 2},
    amountValue: {fontSize: 17, fontWeight: '700'},
    progressTrack: {height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginTop: spacing.xs},
    progressFill: {height: '100%', borderRadius: 4},
    receivedRow: {flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.xs},
    receivedLabel: {fontSize: 12, color: colors.success, fontWeight: '600'},

    // Section headers
    sectionHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.xs},
    sectionAccent: {width: 4, height: 18, borderRadius: 2, marginRight: 8},
    sectionTitle: {...typography.subtitle, color: colors.text},

    empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic'},
    emptyStateCard: {alignItems: 'center', padding: spacing.xl, marginTop: spacing.md},
    emptyStateEmoji: {fontSize: 56, marginBottom: spacing.md},
    emptyStateTitle: {fontSize: 20, fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center'},
    emptyStateBody: {...typography.body, textAlign: 'center', lineHeight: 22},

    // Category cards
    catCard: {borderRadius: 14, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
    catHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
    colorDot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
    catIconText: {fontSize: 18, marginRight: spacing.xs},
    catName: {...typography.body, color: colors.text, fontWeight: '700'},
    catSubtitle: {...typography.caption, color: colors.textSecondary, marginTop: 1},
    rolloverLabel: {...typography.caption, color: colors.success, marginTop: 1},
    catSpent: {...typography.body, color: colors.textSecondary, fontWeight: '600'},
    bufferBadge: {...typography.caption, color: colors.warning, marginTop: 2},
    overLabel: {...typography.caption, color: colors.danger, marginTop: 4, textAlign: 'right', fontWeight: '600'},

    // Category modal
    modalOverlay: {flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end'},
    modalCard: {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', height: '75%'},
    modalHeaderStrip: {flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingBottom: spacing.sm},
    modalIconCircle: {width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm},
    modalTitle: {...typography.subtitle, color: colors.text, flex: 1},
    modalCloseBtn: {padding: 4},
    modalClose: {fontSize: 18, color: colors.textSecondary},
    totalPill: {borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm, marginHorizontal: spacing.md},
    totalPillText: {fontWeight: '700', fontSize: 15, textAlign: 'center'},
    modalList: {flex: 1, paddingHorizontal: spacing.md},

    // Buffer card
    bufferCard: {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm, marginHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border},
    bufferRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
    bufferLabel: {...typography.caption, color: colors.textSecondary},
    bufferValue: {...typography.body, color: colors.text, fontWeight: '600'},
    bufferHint: {...typography.caption, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic'},
    segmentedTrack: {flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4, opacity: 0.2},
    segmentExpected: {backgroundColor: colors.success, height: '100%'},
    segmentBuffer: {backgroundColor: colors.warning, height: '100%'},
    segmentedFillWrapper: {height: 8, borderRadius: 4, overflow: 'hidden', marginTop: -8, backgroundColor: 'transparent'},
    segmentedFill: {height: '100%', borderRadius: 4},

    // Sub breakdown
    subBreakdownTitle: {...typography.body, color: colors.text, fontWeight: '600', marginTop: spacing.sm, marginBottom: 4, paddingHorizontal: spacing.md},
    subBreakRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs, paddingHorizontal: spacing.md},
    subBreakIcon: {fontSize: 16, marginRight: 6},
    subBreakHeader: {flexDirection: 'row', justifyContent: 'space-between'},
    subBreakName: {...typography.body, color: colors.text},
    subBreakAmount: {...typography.body, color: colors.textSecondary},

    // Expense rows
    expRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border},
    expInfo: {flex: 1},
    expNote: {...typography.body, color: colors.text},
    expDate: {...typography.caption, color: colors.textSecondary, marginTop: 2},
    expAmount: {...typography.body, color: colors.text, fontWeight: '700'},
  });
