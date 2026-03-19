/**
 * AddExpenseScreen.tsx
 *
 * Form for logging a new expense. Supports:
 *  - Amount, date picker, category + sub-category selection
 *  - Optional note
 *
 * For recurring bills, use the Subscriptions screen instead.
 */
import React, {useState} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {Expense} from '../types';
import {spacing, typography} from '../theme';
import {dateToString} from '../utils/helpers';
import {QuickAddCategoryModal} from '../components/QuickAddCategoryModal';
import {ToastModal} from '../components/AppModals';

export default function AddExpenseScreen() {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const {categories, addExpense, settings} = useBudget();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [toast, setToast] = useState<{icon: string; message: string} | null>(null);
  const [amountError, setAmountError] = useState('');
  const [catError, setCatError] = useState('');

  const activeCat = categories.find(c => c.id === selectedCategory);
  const subCats = activeCat?.subCategories ?? [];

  const resetForm = () => {
    setAmount('');
    setNote('');
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setDate(new Date());

  };

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    let hasError = false;
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setAmountError('Enter a valid amount greater than 0');
      hasError = true;
    } else {
      setAmountError('');
    }
    if (!selectedCategory) {
      setCatError('Please select a category');
      hasError = true;
    } else {
      setCatError('');
    }
    if (hasError) return;

    const expense: Expense = {
      id: uuidv4(),
      categoryId: selectedCategory!,
      subCategoryId: selectedSubCategory ?? undefined,
      amount: parsed,
      note: note.trim(),
      date: dateToString(date),
      isRecurring: false,
    };

    addExpense(expense);
    resetForm();
    setToast({icon: '✅', message: 'Expense logged!'});
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

      <Text style={s.label}>Amount ({settings.currency})</Text>
      <TextInput
        style={[s.input, amountError ? {borderColor: colors.danger} : {}]}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
        value={amount}
        onChangeText={v => { setAmount(v); if (amountError) setAmountError(''); }}
      />
      {!!amountError && <Text style={[s.errorText, {color: colors.danger}]}>{amountError}</Text>}

      <Text style={s.label}>Date</Text>
      <TouchableOpacity style={s.dateButton} onPress={() => setShowDatePicker(true)}>
        <Text style={s.dateButtonText}>📅 {dateToString(date)}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'android' ? 'default' : 'spinner'}
          onChange={(_, selected) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selected) setDate(selected);
          }}
          maximumDate={new Date()}
        />
      )}

      <Text style={s.label}>Category</Text>
      {!!catError && <Text style={[s.errorText, {color: colors.danger}]}>{catError}</Text>}
      <View style={s.catGrid}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[s.catChip, selectedCategory === cat.id && {backgroundColor: cat.color, borderColor: cat.color}]}
            onPress={() => { setSelectedCategory(cat.id); setSelectedSubCategory(null); }}>
            <Text style={s.catIcon}>{cat.icon}</Text>
            <Text style={[s.catChipText, selectedCategory === cat.id && {color: '#fff'}]}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
        {/* Inline quick-add chip */}
        <TouchableOpacity
          style={[s.catChip, {borderStyle: 'dashed', borderColor: colors.primary}]}
          onPress={() => setShowQuickAdd(true)}>
          <Text style={s.catIcon}>＋</Text>
          <Text style={[s.catChipText, {color: colors.primary}]}>New</Text>
        </TouchableOpacity>
      </View>

      {subCats.length > 0 && (
        <>
          <Text style={s.label}>Sub-category</Text>
          <View style={s.catGrid}>
            {subCats.map(sub => (
              <TouchableOpacity
                key={sub.id}
                style={[s.catChip, selectedSubCategory === sub.id && {backgroundColor: activeCat!.color, borderColor: activeCat!.color}]}
                onPress={() => setSelectedSubCategory(prev => prev === sub.id ? null : sub.id)}>
                <Text style={s.catIcon}>{sub.icon}</Text>
                <Text style={[s.catChipText, selectedSubCategory === sub.id && {color: '#fff'}]}>{sub.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={s.label}>Note (optional)</Text>
      <TextInput style={[s.input, s.noteInput]} placeholder="What was this for?" placeholderTextColor={colors.textSecondary} value={note} onChangeText={setNote} multiline />

      <View style={s.recurringTip}>
        <Text style={s.recurringTipText}>🔁 For recurring bills like subscriptions, use 💳 Subscriptions in the menu.</Text>
      </View>

      <TouchableOpacity style={s.submitBtn} onPress={handleSubmit}>
        <Text style={s.submitBtnText}>Add Expense</Text>
      </TouchableOpacity>

      <QuickAddCategoryModal
        visible={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onCreated={cat => { setSelectedCategory(cat.id); setSelectedSubCategory(null); setCatError(''); }}
      />
      <ToastModal
        visible={!!toast}
        icon={toast?.icon ?? '✅'}
        message={toast?.message ?? ''}
        onDone={() => setToast(null)}
      />
    </ScrollView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.md, paddingBottom: spacing.xl},
    label: {...typography.subtitle, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md},
    input: {backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border},
    noteInput: {height: 80, textAlignVertical: 'top'},
    dateButton: {backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, borderWidth: 1, borderColor: colors.border},
    dateButtonText: {...typography.body, color: colors.text},
    catGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4},
    catChip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.surface},
    catIcon: {fontSize: 14, marginRight: 4},
    catChipText: {...typography.caption, color: colors.text},
    empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs},
    errorText: {fontSize: 12, marginTop: 4, fontWeight: '500'},
    recurringTip: {marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, borderWidth: 1, borderColor: colors.border},
    recurringTipText: {...typography.caption, color: colors.textSecondary, lineHeight: 18},
    submitBtn: {backgroundColor: colors.primary, borderRadius: 14, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg},
    submitBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  });
