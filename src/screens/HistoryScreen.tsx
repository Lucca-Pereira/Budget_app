/**
 * HistoryScreen.tsx
 *
 * Unified bank-statement-style transaction history.
 * Shows expenses (money out ↓) and income events (money in ↑) together,
 * sorted by date, with money-in/out summary and net balance.
 */
import React, {useMemo, useState} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useNavigation} from '@react-navigation/native';
import {format} from 'date-fns';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {spacing, typography} from '../theme';
import {expensesForMonth, formatAmount, currentMonth, prevMonth, nextMonth, monthLabel, dateToString, incomeEventsForMonth} from '../utils/helpers';
import {ConfirmModal} from '../components/AppModals';
import {Expense, IncomeEvent} from '../types';

// ─── Unified transaction row type ────────────────────────────────────────────

type TxRow =
  | {kind: 'expense'; data: Expense}
  | {kind: 'income';  data: IncomeEvent};

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const {categories, expenses, incomeEvents, settings, deleteExpense, updateExpense, deleteIncomeEvent, updateIncomeEvent} = useBudget();
  const [monthKey, setMonthKey] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'out' | 'in'>('all');

  // Editing expense
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editSubCategoryId, setEditSubCategoryId] = useState<string | null>(null);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  type ConfirmConfig = {icon?: string; title: string; message: string; confirmLabel: string; confirmDanger?: boolean; onConfirm: () => void};
  const [confirmModal, setConfirmModal] = useState<ConfirmConfig | null>(null);
  const showConfirm = (cfg: ConfirmConfig) => setConfirmModal(cfg);

  const getCat = (id: string) => categories.find(c => c.id === id);

  // Merge expenses + income into one sorted list
  const allRows = useMemo((): TxRow[] => {
    const monthExp = expensesForMonth(expenses, monthKey);
    const monthInc = incomeEventsForMonth(incomeEvents, monthKey);
    const q = search.toLowerCase().trim();

    let rows: TxRow[] = [
      ...monthExp.map(e => ({kind: 'expense' as const, data: e})),
      ...monthInc.map(e => ({kind: 'income' as const, data: e})),
    ];

    if (typeFilter === 'out') rows = rows.filter(r => r.kind === 'expense');
    if (typeFilter === 'in')  rows = rows.filter(r => r.kind === 'income');

    if (q) {
      rows = rows.filter(r => {
        if (r.kind === 'expense') {
          return r.data.note.toLowerCase().includes(q) ||
            (getCat(r.data.categoryId)?.name ?? '').toLowerCase().includes(q);
        }
        return r.data.note.toLowerCase().includes(q);
      });
    }

    return rows.sort((a, b) => {
      const da = a.kind === 'expense' ? a.data.date : a.data.date;
      const db = b.kind === 'expense' ? b.data.date : b.data.date;
      return db.localeCompare(da);
    });
  }, [expenses, incomeEvents, monthKey, search, typeFilter]);

  const totalOut = useMemo(() => allRows.filter(r => r.kind === 'expense').reduce((s, r) => s + (r.data as Expense).amount, 0), [allRows]);
  const totalIn  = useMemo(() => allRows.filter(r => r.kind === 'income').reduce((s, r) => s + (r.data as IncomeEvent).amount, 0), [allRows]);
  const net = totalIn - totalOut;

  const openEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditAmount(String(exp.amount));
    setEditNote(exp.note);
    setEditDate(exp.date);
    setEditCategoryId(exp.categoryId);
    setEditSubCategoryId(exp.subCategoryId ?? null);
  };

  const saveEdit = () => {
    if (!editingExpense) return;
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert('Error', 'Enter a valid amount.'); return; }
    updateExpense({...editingExpense, amount: parsed, note: editNote.trim(), date: editDate, categoryId: editCategoryId, subCategoryId: editSubCategoryId ?? undefined});
    setEditingExpense(null);
  };

  return (
    <View style={s.container}>
      {/* Month navigator */}
      <View style={s.navigator}>
        <TouchableOpacity onPress={() => setMonthKey(prevMonth(monthKey))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Text style={s.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.navLabel}>{monthLabel(monthKey)}</Text>
        <TouchableOpacity onPress={() => setMonthKey(nextMonth(monthKey))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Text style={s.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Summary bar — money in / out / net */}
      <View style={[s.summaryBar, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
        <View style={s.summaryCell}>
          <Text style={[s.summaryValue, {color: colors.success}]}>+{formatAmount(totalIn, settings.currency)}</Text>
          <Text style={[s.summaryLabel, {color: colors.textSecondary}]}>Money in</Text>
        </View>
        <View style={[s.summarySep, {backgroundColor: colors.border}]} />
        <View style={s.summaryCell}>
          <Text style={[s.summaryValue, {color: colors.danger}]}>-{formatAmount(totalOut, settings.currency)}</Text>
          <Text style={[s.summaryLabel, {color: colors.textSecondary}]}>Money out</Text>
        </View>
        <View style={[s.summarySep, {backgroundColor: colors.border}]} />
        <View style={s.summaryCell}>
          <Text style={[s.summaryValue, {color: net >= 0 ? colors.success : colors.danger}]}>
            {net >= 0 ? '+' : ''}{formatAmount(net, settings.currency)}
          </Text>
          <Text style={[s.summaryLabel, {color: colors.textSecondary}]}>Net</Text>
        </View>
      </View>

      {/* Search + type filter */}
      <View style={[s.searchRow, {backgroundColor: colors.surface}]}>
        <TextInput
          style={s.searchInput}
          placeholder="🔍 Search transactions..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <View style={[s.filterRow, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
        {([['all', 'All'], ['in', '↑ In'], ['out', '↓ Out']] as const).map(([val, label]) => (
          <TouchableOpacity
            key={val}
            style={[s.filterChip,
              typeFilter === val && {backgroundColor: val === 'in' ? colors.success : val === 'out' ? colors.danger : colors.primary,
                borderColor: val === 'in' ? colors.success : val === 'out' ? colors.danger : colors.primary}]}
            onPress={() => setTypeFilter(val)}>
            <Text style={[s.filterChipText, typeFilter === val && {color: '#fff', fontWeight: '700'}]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={[s.rowCount, {color: colors.textSecondary}]}>{allRows.length} transaction{allRows.length !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {allRows.length === 0 && <Text style={s.empty}>No transactions found.</Text>}
        {allRows.map(row => {
          if (row.kind === 'expense') {
            const exp = row.data;
            const cat = getCat(exp.categoryId);
            return (
              <TouchableOpacity
                key={'e_' + exp.id}
                style={[s.txRow, {borderLeftColor: cat?.color ?? colors.border}]}
                onPress={() => openEdit(exp)}
                onLongPress={() => showConfirm({
                  icon: '🗑️',
                  title: 'Delete expense?',
                  message: 'This cannot be undone.',
                  confirmLabel: 'Delete',
                  confirmDanger: true,
                  onConfirm: () => { setConfirmModal(null); deleteExpense(exp.id); },
                })}>
                <View style={[s.txIconBubble, {backgroundColor: (cat?.color ?? colors.primary) + '22'}]}>
                  <Text style={s.txIcon}>{cat?.icon ?? '❓'}</Text>
                </View>
                <View style={s.txInfo}>
                  <Text style={[s.txTitle, {color: colors.text}]}>{cat?.name ?? 'Unknown'}{exp.isRecurring ? ' 🔁' : ''}</Text>
                  {exp.note ? <Text style={[s.txNote, {color: colors.textSecondary}]} numberOfLines={1}>{exp.note}</Text> : null}
                  <Text style={[s.txDate, {color: colors.textSecondary}]}>{format(new Date(exp.date), 'dd MMM yyyy')}</Text>
                </View>
                <Text style={[s.txAmount, {color: colors.danger}]}>-{formatAmount(exp.amount, settings.currency)}</Text>
              </TouchableOpacity>
            );
          } else {
            const ev = row.data;
            return (
              <TouchableOpacity
                key={'i_' + ev.id}
                style={[s.txRow, {borderLeftColor: colors.success}]}
                onLongPress={() => showConfirm({
                  icon: '🗑️',
                  title: 'Delete income?',
                  message: 'This cannot be undone.',
                  confirmLabel: 'Delete',
                  confirmDanger: true,
                  onConfirm: () => { setConfirmModal(null); deleteIncomeEvent(ev.id); },
                })}>
                <View style={[s.txIconBubble, {backgroundColor: colors.success + '22'}]}>
                  <Text style={s.txIcon}>💰</Text>
                </View>
                <View style={s.txInfo}>
                  <Text style={[s.txTitle, {color: colors.text}]}>Income</Text>
                  {ev.note ? <Text style={[s.txNote, {color: colors.textSecondary}]} numberOfLines={1}>{ev.note}</Text> : null}
                  <Text style={[s.txDate, {color: colors.textSecondary}]}>{format(new Date(ev.date), 'dd MMM yyyy')}</Text>
                </View>
                <Text style={[s.txAmount, {color: colors.success}]}>+{formatAmount(ev.amount, settings.currency)}</Text>
              </TouchableOpacity>
            );
          }
        })}
      </ScrollView>

      <TouchableOpacity style={[s.fab, {bottom: 28 + insets.bottom}]} onPress={() => navigation.navigate('Add')} activeOpacity={0.85}>
        <Text style={s.fabText}>➕</Text>
      </TouchableOpacity>

      {/* Themed confirm modal */}
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

      {/* Edit expense modal (unchanged) */}
      <Modal visible={editingExpense !== null} transparent animationType="fade" onRequestClose={() => setEditingExpense(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={[s.modalTitleRow, {backgroundColor: colors.primary + '22'}]}>
              <Text style={s.modalTitle}>✏️ Edit Expense</Text>
            </View>
            <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalLabel}>Date</Text>
              <TouchableOpacity style={s.modalInput} onPress={() => setShowEditDatePicker(true)}>
                <Text style={{color: colors.text}}>{editDate}</Text>
              </TouchableOpacity>
              {showEditDatePicker && (
                <DateTimePicker
                  value={editDate ? new Date(editDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'android' ? 'default' : 'spinner'}
                  maximumDate={new Date()}
                  onChange={(_, selected) => {
                    setShowEditDatePicker(Platform.OS === 'ios');
                    if (selected) setEditDate(dateToString(selected));
                  }}
                />
              )}
              <Text style={s.modalLabel}>Category</Text>
              <View style={s.catGrid}>
                {categories.map(cat => {
                  const sel = editCategoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[s.catChip, sel && {backgroundColor: cat.color, borderColor: cat.color}]}
                      onPress={() => { setEditCategoryId(cat.id); setEditSubCategoryId(null); }}>
                      <Text style={[s.catChipText, sel && {color: '#fff', fontWeight: '700'}]}>
                        {cat.icon} {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {(() => {
                const activeCat = categories.find(c => c.id === editCategoryId);
                const subCats = activeCat?.subCategories ?? [];
                if (subCats.length === 0) return null;
                return (
                  <View style={[s.catGrid, {marginTop: 6}]}>
                    {subCats.map(sub => {
                      const sel = editSubCategoryId === sub.id;
                      return (
                        <TouchableOpacity
                          key={sub.id}
                          style={[s.catChip, sel && {backgroundColor: activeCat!.color, borderColor: activeCat!.color}]}
                          onPress={() => setEditSubCategoryId(prev => prev === sub.id ? null : sub.id)}>
                          <Text style={[s.catChipText, sel && {color: '#fff', fontWeight: '700'}]}>
                            {sub.icon} {sub.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}
              <Text style={s.modalLabel}>Amount ({settings.currency})</Text>
              <TextInput style={s.modalInput} keyboardType="decimal-pad" value={editAmount} onChangeText={setEditAmount} placeholderTextColor={colors.textSecondary} />
              <Text style={s.modalLabel}>Note</Text>
              <TextInput style={s.modalInput} value={editNote} onChangeText={setEditNote} placeholderTextColor={colors.textSecondary} />
              <View style={s.modalButtons}>
                <TouchableOpacity style={s.modalCancel} onPress={() => setEditingExpense(null)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSave} onPress={saveEdit}>
                  <Text style={s.modalSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    navigator: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 2, borderBottomColor: colors.primary + '44'},
    navArrow: {fontSize: 32, color: colors.primary, lineHeight: 36},
    navLabel: {...typography.subtitle, color: colors.text},
    // Summary bar
    summaryBar: {flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 10},
    summaryCell: {flex: 1, alignItems: 'center'},
    summarySep: {width: 1, marginVertical: 4},
    summaryValue: {fontSize: 14, fontWeight: '800'},
    summaryLabel: {fontSize: 11, marginTop: 2},
    // Search + filter
    searchRow: {paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
    searchInput: {backgroundColor: colors.background, borderRadius: 12, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1.5, borderColor: colors.primary + '55'},
    filterRow: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 8, borderBottomWidth: 1},
    filterChip: {borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.background},
    filterChipText: {...typography.caption, color: colors.text},
    rowCount: {...typography.caption, marginLeft: 'auto' as any},
    // Transaction rows
    list: {flex: 1},
    listContent: {padding: spacing.md, paddingBottom: 100},
    txRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, overflow: 'hidden'},
    txIconBubble: {width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm},
    txIcon: {fontSize: 20},
    txInfo: {flex: 1},
    txTitle: {...typography.body, fontWeight: '700'},
    txNote: {...typography.caption, marginTop: 2},
    txDate: {...typography.caption, marginTop: 2},
    txAmount: {fontSize: 15, fontWeight: '800'},
    fab: {position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: colors.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 8},
    fabText: {fontSize: 26},
    empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xl},
    // Edit expense modal
    modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md},
    modalCard: {backgroundColor: colors.surface, borderRadius: 16, width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, maxHeight: '90%'},
    modalTitleRow: {padding: spacing.md, paddingBottom: spacing.sm},
    modalTitle: {...typography.subtitle, color: colors.text},
    modalBody: {padding: spacing.md},
    modalLabel: {...typography.caption, color: colors.textSecondary, marginTop: spacing.sm},
    modalInput: {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border, marginTop: 4},
    modalButtons: {flexDirection: 'row', gap: 8, marginTop: spacing.md, marginBottom: spacing.sm},
    modalCancel: {flex: 1, padding: spacing.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center'},
    modalCancelText: {color: colors.textSecondary},
    modalSave: {flex: 1, padding: spacing.sm, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center'},
    modalSaveText: {color: '#fff', fontWeight: '700'},
    catGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4},
    catChip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.surface},
    catChipText: {...typography.caption, color: colors.text},
  });
