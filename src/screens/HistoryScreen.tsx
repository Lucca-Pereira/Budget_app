import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import {format} from 'date-fns';
import {useBudget} from '../context/BudgetContext';
import {colors, spacing, typography} from '../theme';
import {
  expensesForMonth,
  formatAmount,
  currentMonth,
  prevMonth,
  nextMonth,
  monthLabel,
} from '../utils/helpers';
import {Expense} from '../types';

export default function HistoryScreen() {
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
      (a: Expense, b: Expense) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    if (filterCatId) list = list.filter(e => e.categoryId === filterCatId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        e =>
          e.note.toLowerCase().includes(q) ||
          (getCat(e.categoryId)?.name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [expenses, monthKey, filterCatId, search]);

  const monthTotal = useMemo(
    () => monthExpenses.reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );

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
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Error', 'Enter a valid amount.');
      return;
    }
    updateExpense({...editingExpense, amount: parsed, note: editNote.trim()});
    setEditingExpense(null);
  };

  return (
    <View style={styles.container}>
      {/* Month navigator */}
      <View style={styles.navigator}>
        <TouchableOpacity
          onPress={() => setMonthKey(prevMonth(monthKey))}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navLabel}>{monthLabel(monthKey)}</Text>
        <TouchableOpacity
          onPress={() => setMonthKey(nextMonth(monthKey))}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search by note or category..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{paddingHorizontal: spacing.md, gap: 8}}>
        <TouchableOpacity
          style={[styles.filterChip, filterCatId === null && styles.filterChipActive]}
          onPress={() => setFilterCatId(null)}>
          <Text style={styles.filterChipText}>All</Text>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.filterChip,
              filterCatId === cat.id && {
                backgroundColor: cat.color,
                borderColor: cat.color,
              },
            ]}
            onPress={() =>
              setFilterCatId(filterCatId === cat.id ? null : cat.id)
            }>
            <Text style={styles.filterChipText}>
              {cat.icon} {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Total for visible expenses */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>
          {monthExpenses.length} expense{monthExpenses.length !== 1 ? 's' : ''}
        </Text>
        <Text style={styles.totalAmount}>
          {formatAmount(monthTotal, settings.currency)}
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}>
        {monthExpenses.length === 0 && (
          <Text style={styles.empty}>No expenses found.</Text>
        )}

        {monthExpenses.map(exp => {
          const cat = getCat(exp.categoryId);
          return (
            <TouchableOpacity
              key={exp.id}
              style={styles.expenseRow}
              onPress={() => openEdit(exp)}
              onLongPress={() => handleDelete(exp.id)}>
              <Text style={styles.expIcon}>{cat?.icon ?? '❓'}</Text>
              <View style={styles.expInfo}>
                <View style={styles.expTopRow}>
                  <Text style={styles.expCategory}>{cat?.name ?? 'Unknown'}</Text>
                  {exp.isRecurring && (
                    <Text style={styles.recurringBadge}>🔁</Text>
                  )}
                </View>
                {exp.note ? (
                  <Text style={styles.expNote}>{exp.note}</Text>
                ) : null}
                <Text style={styles.expDate}>
                  {format(new Date(exp.date), 'dd MMM yyyy')}
                </Text>
              </View>
              <Text style={styles.expAmount}>
                {formatAmount(exp.amount, settings.currency)}
              </Text>
              <TouchableOpacity
                onPress={() => handleDelete(exp.id)}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Edit modal */}
      <Modal
        visible={editingExpense !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingExpense(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Expense</Text>
            <Text style={styles.modalLabel}>Amount ({settings.currency})</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="decimal-pad"
              value={editAmount}
              onChangeText={setEditAmount}
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={styles.modalLabel}>Note</Text>
            <TextInput
              style={styles.modalInput}
              value={editNote}
              onChangeText={setEditNote}
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditingExpense(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveEdit}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  navigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navArrow: {fontSize: 28, color: colors.primary, lineHeight: 32},
  navLabel: {...typography.subtitle, color: colors.text},
  searchRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterRow: {
    maxHeight: 48,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.background,
    alignSelf: 'center',
  },
  filterChipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  filterChipText: {...typography.caption, color: colors.text},
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  totalLabel: {...typography.caption, color: colors.textSecondary},
  totalAmount: {...typography.caption, color: colors.text, fontWeight: '700'},
  list: {flex: 1},
  listContent: {padding: spacing.md, paddingBottom: spacing.xl},
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  expIcon: {fontSize: 22, marginRight: spacing.sm},
  expInfo: {flex: 1},
  expTopRow: {flexDirection: 'row', alignItems: 'center'},
  expCategory: {...typography.body, color: colors.text, fontWeight: '600'},
  recurringBadge: {fontSize: 12, marginLeft: 4},
  expNote: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  expDate: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  expAmount: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  deleteIcon: {fontSize: 16},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {...typography.subtitle, color: colors.text, marginBottom: spacing.sm},
  modalLabel: {...typography.caption, color: colors.textSecondary, marginTop: spacing.sm},
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  modalCancel: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: {color: colors.textSecondary},
  modalSave: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalSaveText: {color: '#fff', fontWeight: '700'},
});
