import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  Platform,
} from 'react-native';
import notifee, {AndroidNotificationSetting} from '@notifee/react-native';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {colors, spacing, typography} from '../theme';
import {buildCSV} from '../utils/helpers';
import {
  requestPermissions,
  scheduleDailyReminder,
  cancelDailyReminder,
} from '../utils/notifications';
import {format} from 'date-fns';

const PRESET_COLORS = [
  '#FF6B6B', '#FFA36C', '#FFD93D', '#6BCB77',
  '#4D96FF', '#C77DFF', '#F72585', '#4CC9F0',
];

const PRESET_ICONS = [
  '🏠','🚗','🍔','🛒','💊','🎬','✈️','👕',
  '📚','💻','🎮','🐾','💪','☕','🍷','💰',
];

export default function SettingsScreen() {
  const {
    categories,
    expenses,
    settings,
    addCategory,
    deleteCategory,
    updateSettings,
  } = useBudget();

  const [income, setIncome] = useState(String(settings.incomeAmount));
  const [currency, setCurrency] = useState(settings.currency);
  const [notifEnabled, setNotifEnabled] = useState(settings.notificationsEnabled);
  const [reminderHour, setReminderHour] = useState(String(settings.reminderHour));
  const [reminderMinute, setReminderMinute] = useState(
    String(settings.reminderMinute).padStart(2, '0'),
  );

  const [newCatName, setNewCatName] = useState('');
  const [newCatBudget, setNewCatBudget] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('💰');
  const [newCatColor, setNewCatColor] = useState('#6C63FF');
  const [newCatFixed, setNewCatFixed] = useState(false);
  const [newCatRollover, setNewCatRollover] = useState(false);

  useEffect(() => {
    setIncome(String(settings.incomeAmount));
    setCurrency(settings.currency);
    setNotifEnabled(settings.notificationsEnabled);
    setReminderHour(String(settings.reminderHour));
    setReminderMinute(String(settings.reminderMinute).padStart(2, '0'));
  }, [settings]);

  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const result = await requestPermissions();
      if (result === 'denied') {
        Alert.alert(
          'Notification permission required',
          'Please allow notifications for Budget Tracker in your phone settings.',
        );
        return;
      }
      if (result === 'inexact') {
        // Still enable — inexact is fine for a daily reminder
        Alert.alert(
          '🔔 Notifications enabled (inexact)',
          'Reminders will fire within ~15 minutes of your set time.\n\nFor precise timing, go to Settings → Apps → Special app access → Alarms & reminders and enable it for Budget Tracker.',
        );
      }
    }
    setNotifEnabled(enabled);
  };

  const handleSaveSettings = async () => {
    const parsedIncome = parseFloat(income);
    if (isNaN(parsedIncome) || parsedIncome < 0) {
      Alert.alert('Error', 'Income must be 0 or more.');
      return;
    }
    if (!currency.trim()) {
      Alert.alert('Error', 'Currency symbol cannot be empty.');
      return;
    }
    const h = parseInt(reminderHour, 10);
    const min = parseInt(reminderMinute, 10);
    if (isNaN(h) || h < 0 || h > 23 || isNaN(min) || min < 0 || min > 59) {
      Alert.alert('Error', 'Reminder time must be valid: hour 0–23, minute 0–59.');
      return;
    }

    const newSettings = {
      currency: currency.trim(),
      incomeAmount: parsedIncome,
      notificationsEnabled: notifEnabled,
      reminderHour: h,
      reminderMinute: min,
    };

    await updateSettings(newSettings);

    // Apply notification change immediately after saving
    if (notifEnabled) {
      try {
        await scheduleDailyReminder(h, min);
        const notifSettings = await notifee.getNotificationSettings();
        const isExact =
          notifSettings.android.alarm === AndroidNotificationSetting.ENABLED;
        Alert.alert(
          '✅ Saved',
          `Daily reminder set for ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} — ${isExact ? 'exact timing active ✓' : 'approximate timing (±15 min).'}\n${!isExact ? '\nFor exact timing: Settings → Apps → Special app access → Alarms & reminders → enable Budget Tracker.' : ''}`,
        );
      } catch (e) {
        Alert.alert(
          '⚠️ Saved with warning',
          'Settings saved but the notification could not be scheduled. Check notification permissions in your phone settings.',
        );
      }
    } else {
      await cancelDailyReminder();
      Alert.alert('✅ Saved', 'Settings updated.');
    }
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) {
      Alert.alert('Error', 'Category name cannot be empty.');
      return;
    }
    const budget = parseFloat(newCatBudget);
    if (newCatBudget && (isNaN(budget) || budget < 0)) {
      Alert.alert('Error', 'Budget must be 0 or more.');
      return;
    }
    addCategory({
      id: uuidv4(),
      name: newCatName.trim(),
      icon: newCatIcon,
      color: newCatColor,
      budget: newCatBudget ? budget : 0,
      isFixed: newCatFixed,
      rollover: newCatRollover,
    });
    setNewCatName('');
    setNewCatBudget('');
    setNewCatFixed(false);
    setNewCatRollover(false);
  };

  const handleDeleteCategory = (id: string, name: string) => {
    Alert.alert(
      `Delete "${name}"?`,
      'Existing expenses in this category will lose their label.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Delete', style: 'destructive', onPress: () => deleteCategory(id)},
      ],
    );
  };

  const handleExportCSV = async () => {
    if (expenses.length === 0) {
      Alert.alert('Nothing to export', 'You have no expenses yet.');
      return;
    }
    const csv = buildCSV(expenses, categories, settings.currency);
    const filename = `budget_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    try {
      await Share.share({
        title: filename,
        message: Platform.OS === 'android' ? csv : undefined,
        url:
          Platform.OS === 'ios'
            ? `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
            : undefined,
      });
    } catch {
      Alert.alert('Export failed', 'Could not share the file.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>

      {/* ── Budget settings ── */}
      <Text style={styles.sectionTitle}>Monthly Budget</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Monthly income</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textSecondary}
          value={income}
          onChangeText={setIncome}
        />
        <Text style={styles.label}>Currency symbol</Text>
        <TextInput
          style={styles.input}
          placeholder="€"
          placeholderTextColor={colors.textSecondary}
          value={currency}
          onChangeText={setCurrency}
          maxLength={4}
        />
      </View>

      {/* ── Notifications ── */}
      <Text style={styles.sectionTitle}>Daily Reminder</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.toggleRow, notifEnabled && styles.toggleRowActive]}
          onPress={() => handleToggleNotifications(!notifEnabled)}>
          <Text style={styles.toggleLabel}>
            {notifEnabled ? '🔔 Enabled' : '🔕 Disabled'}
          </Text>
          <Text style={styles.toggleHint}>
            Tap to {notifEnabled ? 'disable' : 'enable'} the daily reminder
          </Text>
        </TouchableOpacity>

        {notifEnabled && (
          <>
            <Text style={styles.label}>Reminder time</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={[styles.input, styles.timeInput]}
                keyboardType="number-pad"
                placeholder="20"
                placeholderTextColor={colors.textSecondary}
                value={reminderHour}
                onChangeText={setReminderHour}
                maxLength={2}
              />
              <Text style={styles.timeSep}>:</Text>
              <TextInput
                style={[styles.input, styles.timeInput]}
                keyboardType="number-pad"
                placeholder="00"
                placeholderTextColor={colors.textSecondary}
                value={reminderMinute}
                onChangeText={setReminderMinute}
                maxLength={2}
              />
            </View>
            <Text style={styles.notifHint}>
              You'll get a notification every day at this time reminding you to
              log your expenses. Android 12+ will ask for exact alarm permission
              the first time.
            </Text>
          </>
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>
      </View>

      {/* ── Export ── */}
      <Text style={styles.sectionTitle}>Export</Text>
      <View style={styles.card}>
        <Text style={styles.exportHint}>
          Exports all {expenses.length} expense{expenses.length !== 1 ? 's' : ''} as
          a CSV file you can open in Excel or Google Sheets.
        </Text>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Text style={styles.exportBtnText}>📤 Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* ── Add new category ── */}
      <Text style={styles.sectionTitle}>Add Category</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Groceries"
          placeholderTextColor={colors.textSecondary}
          value={newCatName}
          onChangeText={setNewCatName}
        />

        <Text style={styles.label}>Monthly budget limit (optional)</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="Leave blank for no limit"
          placeholderTextColor={colors.textSecondary}
          value={newCatBudget}
          onChangeText={setNewCatBudget}
        />

        <Text style={styles.label}>Icon</Text>
        <View style={styles.presetRow}>
          {PRESET_ICONS.map(icon => (
            <TouchableOpacity
              key={icon}
              style={[
                styles.presetItem,
                newCatIcon === icon && styles.presetItemSelected,
              ]}
              onPress={() => setNewCatIcon(icon)}>
              <Text style={styles.presetEmoji}>{icon}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Colour</Text>
        <View style={styles.presetRow}>
          {PRESET_COLORS.map(col => (
            <TouchableOpacity
              key={col}
              style={[
                styles.colorDot,
                {backgroundColor: col},
                newCatColor === col && styles.colorDotSelected,
              ]}
              onPress={() => setNewCatColor(col)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setNewCatFixed(v => !v)}>
          <Text style={styles.toggleLabel}>
            {newCatFixed ? '🔒 Fixed expense' : '📊 Variable expense'}
          </Text>
          <Text style={styles.toggleHint}>
            {newCatFixed
              ? 'Same amount each month (e.g. rent)'
              : 'Changes month to month (e.g. food)'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleRow, newCatRollover && styles.toggleRowActive]}
          onPress={() => setNewCatRollover(v => !v)}>
          <Text style={styles.toggleLabel}>
            {newCatRollover ? '♻️ Rollover enabled' : '♻️ Enable rollover'}
          </Text>
          <Text style={styles.toggleHint}>
            {newCatRollover
              ? 'Unspent budget carries to next month'
              : 'Budget resets to zero each month'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.addBtn} onPress={handleAddCategory}>
          <Text style={styles.addBtnText}>Add Category</Text>
        </TouchableOpacity>
      </View>

      {/* ── Existing categories ── */}
      <Text style={styles.sectionTitle}>Categories ({categories.length})</Text>

      {categories.length === 0 && (
        <Text style={styles.empty}>No categories yet.</Text>
      )}

      {categories.map(cat => (
        <View key={cat.id} style={styles.catRow}>
          <View style={[styles.catColorBar, {backgroundColor: cat.color}]} />
          <Text style={styles.catIcon}>{cat.icon}</Text>
          <View style={styles.catInfo}>
            <Text style={styles.catName}>{cat.name}</Text>
            <Text style={styles.catMeta}>
              {cat.budget > 0
                ? `${settings.currency}${cat.budget.toFixed(2)}/mo`
                : 'No limit'}
              {' · '}
              {cat.isFixed ? '🔒' : '📊'}
              {cat.rollover ? ' · ♻️' : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDeleteCategory(cat.id, cat.name)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={styles.deleteIcon}>🗑</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4},
  timeInput: {flex: 1, textAlign: 'center'},
  timeSep: {color: colors.text, fontSize: 22, fontWeight: '700'},
  notifHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnText: {color: '#fff', fontWeight: '700'},
  exportHint: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  exportBtn: {
    backgroundColor: colors.success,
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: 'center',
  },
  exportBtnText: {color: '#fff', fontWeight: '700'},
  presetRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4},
  presetItem: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetItemSelected: {borderColor: colors.primary},
  presetEmoji: {fontSize: 20},
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {borderColor: colors.text},
  toggleRow: {
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleRowActive: {borderColor: colors.primary},
  toggleLabel: {...typography.body, color: colors.text},
  toggleHint: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  addBtn: {
    backgroundColor: colors.success,
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  addBtnText: {color: '#fff', fontWeight: '700'},
  empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic'},
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  catColorBar: {width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: spacing.sm},
  catIcon: {fontSize: 20, marginRight: spacing.sm},
  catInfo: {flex: 1},
  catName: {...typography.body, color: colors.text, fontWeight: '600'},
  catMeta: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  deleteIcon: {fontSize: 16},
});
