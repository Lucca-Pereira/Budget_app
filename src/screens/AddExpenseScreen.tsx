import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {Expense} from '../types';
import {colors, spacing, typography} from '../theme';
import {dateToString, todayString} from '../utils/helpers';

export default function AddExpenseScreen() {
  const {categories, addExpense, settings} = useBudget();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState('1');

  const resetForm = () => {
    setAmount('');
    setNote('');
    setSelectedCategory(null);
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>

      {/* Amount */}
      <Text style={styles.label}>Amount ({settings.currency})</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
        value={amount}
        onChangeText={setAmount}
      />

      {/* Date picker */}
      <Text style={styles.label}>Date</Text>
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dateButtonText}>
          📅 {dateToString(date)}
        </Text>
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
          locale="es-ES"
        />
      )}

      {/* Category */}
      <Text style={styles.label}>Category</Text>
      {categories.length === 0 ? (
        <Text style={styles.empty}>No categories yet — add some in Settings first.</Text>
      ) : (
        <View style={styles.catGrid}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.catChip,
                selectedCategory === cat.id && {
                  backgroundColor: cat.color,
                  borderColor: cat.color,
                },
              ]}
              onPress={() => setSelectedCategory(cat.id)}>
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text
                style={[
                  styles.catChipText,
                  selectedCategory === cat.id && {color: '#fff'},
                ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Note */}
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        placeholder="What was this for?"
        placeholderTextColor={colors.textSecondary}
        value={note}
        onChangeText={setNote}
        multiline
      />

      {/* Recurring toggle */}
      <TouchableOpacity
        style={[styles.toggleRow, isRecurring && styles.toggleRowActive]}
        onPress={() => setIsRecurring(v => !v)}>
        <Text style={styles.toggleLabel}>
          {isRecurring ? '🔁 Recurring expense' : '🔁 Make recurring'}
        </Text>
        <Text style={styles.toggleHint}>
          {isRecurring
            ? 'Will auto-log every month'
            : 'Tap to enable monthly recurrence'}
        </Text>
      </TouchableOpacity>

      {isRecurring && (
        <>
          <Text style={styles.label}>Day of month (1–28)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="e.g. 1"
            placeholderTextColor={colors.textSecondary}
            value={recurringDay}
            onChangeText={setRecurringDay}
            maxLength={2}
          />
        </>
      )}

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitBtnText}>Add Expense</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  label: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteInput: {height: 80, textAlignVertical: 'top'},
  dateButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButtonText: {...typography.body, color: colors.text},
  catGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4},
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  catIcon: {fontSize: 14, marginRight: 4},
  catChipText: {...typography.caption, color: colors.text},
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  toggleRow: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleRowActive: {borderColor: colors.primary},
  toggleLabel: {...typography.body, color: colors.text},
  toggleHint: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  submitBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});
