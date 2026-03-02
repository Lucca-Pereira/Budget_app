import React, {useState} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {Expense} from '../types';
import {spacing, typography} from '../theme';
import {dateToString} from '../utils/helpers';

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
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState('1');

  const activeCat = categories.find(c => c.id === selectedCategory);
  const subCats = activeCat?.subCategories ?? [];

  const resetForm = () => {
    setAmount('');
    setNote('');
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setDate(new Date());
    setIsRecurring(false);
    setRecurringDay('1');
  };

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Error', 'Please enter a valid amount greater than 0.');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Error', 'Please select a category.');
      return;
    }

    let recurringDayOfMonth: number | undefined;
    if (isRecurring) {
      const day = parseInt(recurringDay, 10);
      if (isNaN(day) || day < 1 || day > 28) {
        Alert.alert('Error', 'Recurring day must be between 1 and 28.');
        return;
      }
      recurringDayOfMonth = day;
    }

    const expense: Expense = {
      id: uuidv4(),
      categoryId: selectedCategory,
      subCategoryId: selectedSubCategory ?? undefined,
      amount: parsed,
      note: note.trim(),
      date: date.toISOString(),
      isRecurring,
      recurringDayOfMonth,
    };

    addExpense(expense);
    resetForm();
    Alert.alert('✅ Added', isRecurring
      ? `Expense added as a recurring entry on day ${recurringDayOfMonth} each month.`
      : 'Expense logged successfully!');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

      <Text style={s.label}>Amount ({settings.currency})</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textSecondary} value={amount} onChangeText={setAmount} />

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
      {categories.length === 0 ? (
        <Text style={s.empty}>No categories yet — add some in Settings first.</Text>
      ) : (
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
        </View>
      )}

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

      <TouchableOpacity style={[s.toggleRow, isRecurring && s.toggleRowActive]} onPress={() => setIsRecurring(v => !v)}>
        <Text style={s.toggleLabel}>{isRecurring ? '🔁 Recurring expense' : '🔁 Make recurring'}</Text>
        <Text style={s.toggleHint}>{isRecurring ? 'Will auto-log every month' : 'Tap to enable monthly recurrence'}</Text>
      </TouchableOpacity>

      {isRecurring && (
        <>
          <Text style={s.label}>Day of month (1–28)</Text>
          <TextInput style={s.input} keyboardType="number-pad" placeholder="e.g. 1" placeholderTextColor={colors.textSecondary} value={recurringDay} onChangeText={setRecurringDay} maxLength={2} />
        </>
      )}

      <TouchableOpacity style={s.submitBtn} onPress={handleSubmit}>
        <Text style={s.submitBtnText}>Add Expense</Text>
      </TouchableOpacity>
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
    toggleRow: {marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm, borderWidth: 1, borderColor: colors.border},
    toggleRowActive: {borderColor: colors.primary},
    toggleLabel: {...typography.body, color: colors.text},
    toggleHint: {...typography.caption, color: colors.textSecondary, marginTop: 2},
    submitBtn: {backgroundColor: colors.primary, borderRadius: 14, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg},
    submitBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  });
