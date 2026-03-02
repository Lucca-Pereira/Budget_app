import React, {useMemo, useState} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {format} from 'date-fns';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {spacing, typography} from '../theme';
import {expensesForMonth, formatAmount, currentMonth, prevMonth, nextMonth, monthLabel} from '../utils/helpers';
import {Expense} from '../types';

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const {categories, expenses, settings, deleteExpense, updateExpense} = useBudget();
  const [monthKey, setMonthKey] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [filterCatId, setFilterCatId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');

  const getCat = (id: string) => categories.find(c => c.id === id);

  const monthExpenses = useMemo(() => {
    let list = expensesForMonth(expenses, monthKey).sort(
      (a: Expense, b: Expense) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    if (filterCatId) list = list.filter(e => e.categoryId === filterCatId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.note.toLowerCase().includes(q) ||
        (getCat(e.categoryId)?.name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [expenses, monthKey, filterCatId, search]);

  const monthTotal = useMemo(() => monthExpenses.reduce((sum, e) => sum + e.amount, 0), [monthExpenses]);

  const handleDelete = (id: string) => {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => deleteExpense(id)},
    ]);
  };

  const openEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditAmount(String(exp.amount));
    setEditNote(exp.note);
  };

  const saveEdit = () => {
    if (!editingExpense) return;
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert('Error', 'Enter a valid amount.'); return; }
    updateExpense({...editingExpense, amount: parsed, note: editNote.trim()});
    setEditingExpense(null);
  };

  return (
    <View style={s.container}>
      {/* Month navigator — coloured background */}
      <View style={s.navigator}>
        <TouchableOpacity onPress={() => setMonthKey(prevMonth(monthKey))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Text style={s.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.navLabel}>{monthLabel(monthKey)}</Text>
        <TouchableOpacity onPress={() => setMonthKey(nextMonth(monthKey))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Text style={s.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          placeholder="🔍 Search by note or category..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category filter chips — use each cat's colour when selected */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={{paddingHorizontal: spacing.md, gap: 8, alignItems: 'center'}}>
        <TouchableOpacity style={[s.filterChip, filterCatId === null && {backgroundColor: colors.primary, borderColor: colors.primary}]} onPress={() => setFilterCatId(null)}>
          <Text style={[s.filterChipText, filterCatId === null && {color: '#fff', fontWeight: '700'}]}>All</Text>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[s.filterChip, filterCatId === cat.id && {backgroundColor: cat.color, borderColor: cat.color}]}
            onPress={() => setFilterCatId(filterCatId === cat.id ? null : cat.id)}>
            <Text style={[s.filterChipText, filterCatId === cat.id && {color: '#fff', fontWeight: '700'}]}>{cat.icon} {cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Totals bar — coloured accent */}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>{monthExpenses.length} expense{monthExpenses.length !== 1 ? 's' : ''}</Text>
        <Text style={[s.totalAmount, {color: colors.primary}]}>{formatAmount(monthTotal, settings.currency)}</Text>
      </View>

      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {monthExpenses.length === 0 && <Text style={s.empty}>No expenses found.</Text>}
        {monthExpenses.map(exp => {
          const cat = getCat(exp.categoryId);
          return (
            <TouchableOpacity
              key={exp.id}
              style={[s.expenseRow, {borderLeftColor: cat?.color ?? colors.border, borderLeftWidth: 4}]}
              onPress={() => openEdit(exp)}
              onLongPress={() => handleDelete(exp.id)}>
              {/* Coloured icon bubble */}
              <View style={[s.expIconBubble, {backgroundColor: (cat?.color ?? colors.primary) + '25'}]}>
                <Text style={s.expIcon}>{cat?.icon ?? '❓'}</Text>
              </View>
              <View style={s.expInfo}>
                <View style={s.expTopRow}>
                  <Text style={s.expCategory}>{cat?.name ?? 'Unknown'}</Text>
                  {exp.isRecurring && <Text style={s.recurringBadge}>🔁</Text>}
                </View>
                {exp.note ? <Text style={s.expNote}>{exp.note}</Text> : null}
                <Text style={s.expDate}>{format(new Date(exp.date), 'dd MMM yyyy')}</Text>
              </View>
              <Text style={[s.expAmount, {color: colors.danger}]}>{formatAmount(exp.amount, settings.currency)}</Text>
              <TouchableOpacity onPress={() => handleDelete(exp.id)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                <Text style={s.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => navigation.navigate('Add')} activeOpacity={0.85}>
        <Text style={s.fabText}>➕</Text>
      </TouchableOpacity>

      <Modal visible={editingExpense !== null} transparent animationType="fade" onRequestClose={() => setEditingExpense(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={[s.modalTitleRow, {backgroundColor: colors.primary + '22'}]}>
              <Text style={s.modalTitle}>✏️ Edit Expense</Text>
            </View>
            <View style={s.modalBody}>
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
            </View>
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
    searchRow: {paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface},
    searchInput: {backgroundColor: colors.background, borderRadius: 12, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1.5, borderColor: colors.primary + '55'},
    filterRow: {maxHeight: 52, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border},
    filterChip: {borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.background},
    filterChipText: {...typography.caption, color: colors.text},
    totalRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border},
    totalLabel: {...typography.caption, color: colors.textSecondary},
    totalAmount: {fontSize: 15, fontWeight: '800'},
    list: {flex: 1},
    listContent: {padding: spacing.md, paddingBottom: 100},
    fab: {position: 'absolute', bottom: 28, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: colors.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 8},
    fabText: {fontSize: 26},
    empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xl},
    expenseRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden'},
    expIconBubble: {width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm},
    expIcon: {fontSize: 20},
    expInfo: {flex: 1},
    expTopRow: {flexDirection: 'row', alignItems: 'center'},
    expCategory: {...typography.body, color: colors.text, fontWeight: '700'},
    recurringBadge: {fontSize: 12, marginLeft: 4},
    expNote: {...typography.caption, color: colors.textSecondary, marginTop: 2},
    expDate: {...typography.caption, color: colors.textSecondary, marginTop: 2},
    expAmount: {fontSize: 15, fontWeight: '800', marginRight: spacing.sm},
    deleteIcon: {fontSize: 16},
    modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md},
    modalCard: {backgroundColor: colors.surface, borderRadius: 16, width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border},
    modalTitleRow: {padding: spacing.md, paddingBottom: spacing.sm},
    modalTitle: {...typography.subtitle, color: colors.text},
    modalBody: {padding: spacing.md},
    modalLabel: {...typography.caption, color: colors.textSecondary, marginTop: spacing.sm},
    modalInput: {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border, marginTop: 4},
    modalButtons: {flexDirection: 'row', gap: 8, marginTop: spacing.md},
    modalCancel: {flex: 1, padding: spacing.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center'},
    modalCancelText: {color: colors.textSecondary},
    modalSave: {flex: 1, padding: spacing.sm, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center'},
    modalSaveText: {color: '#fff', fontWeight: '700'},
  });
