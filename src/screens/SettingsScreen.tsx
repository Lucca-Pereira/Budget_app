import React, {useState, useEffect, useRef} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Share, Platform, Modal, Pressable,
  PanResponder, Animated, Switch,
} from 'react-native';
import notifee, {AndroidNotificationSetting} from '@notifee/react-native';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme, ThemeMode} from '../context/ThemeContext';
import {PALETTES, PaletteKey, spacing, typography} from '../theme';
import {buildCSV} from '../utils/helpers';
import {requestPermissions, scheduleDailyReminder, cancelDailyReminder} from '../utils/notifications';
import {format} from 'date-fns';
import {Category, SubCategory} from '../types';

const PRESET_COLORS = ['#FF6B6B','#FFA36C','#FFD93D','#6BCB77','#4D96FF','#C77DFF','#F72585','#4CC9F0'];
const PRESET_ICONS  = ['🏠','🚗','🍔','🛒','💊','🎬','✈️','👕','📚','💻','🎮','🐾','💪','☕','🍷','💰'];

// ─── Swipeable bottom sheet ───────────────────────────────────────────────────
function BottomSheet({visible, onClose, title, children}: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const translateY = useRef(new Animated.Value(0)).current;

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 0.5) {
        Animated.timing(translateY, {toValue: 800, duration: 200, useNativeDriver: true}).start(onClose);
      } else {
        Animated.spring(translateY, {toValue: 0, useNativeDriver: true}).start();
      }
    },
  })).current;

  useEffect(() => { if (visible) translateY.setValue(0); }, [visible]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetOverlay} onPress={onClose}>
        <Animated.View style={[s.sheetCard, {transform: [{translateY}]}]}>
          <View {...pan.panHandlers} style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <Text style={s.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 32}}>
            {children}
          </ScrollView>
        </Animated.View>
      </Pressable>
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
  const {colors, themeMode, setThemeMode, paletteKey, setPaletteKey} = useTheme();
  const s = makeStyles(colors);
  const {categories, expenses, settings, addCategory, deleteCategory, updateCategory, updateSettings} = useBudget();

  const [income, setIncome] = useState(String(settings.incomeAmount));
  const [currency, setCurrency] = useState(settings.currency);
  const [notifEnabled, setNotifEnabled] = useState(settings.notificationsEnabled);
  const [reminderHour, setReminderHour] = useState(String(settings.reminderHour));
  const [reminderMinute, setReminderMinute] = useState(String(settings.reminderMinute).padStart(2, '0'));

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
    Alert.alert(`Delete "${name}"?`, 'Expenses will lose their label.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => deleteCategory(id)},
    ]);
  };

  const handleExportCSV = async () => {
    if (expenses.length === 0) { Alert.alert('Nothing to export', 'No expenses yet.'); return; }
    const csv = buildCSV(expenses, categories, settings.currency);
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
                  {cat.budget > 0 ? `€${cat.budget}/mo` : 'No limit'}
                  {cat.expectedAmount > 0 ? ` · exp €${cat.expectedAmount}+${cat.buffer}` : ''}
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
              <TextInput style={s.input} placeholder="€" placeholderTextColor={colors.textSecondary} value={currency} onChangeText={setCurrency} maxLength={4} onBlur={() => handleSaveSettings()} />
            </View>
            <View style={{flex: 1}}>
              <Text style={s.fieldLabel}>Monthly income / allowance</Text>
              <TextInput style={s.input} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textSecondary} value={income} onChangeText={setIncome} onBlur={() => handleSaveSettings()} />
            </View>
          </View>
          <TouchableOpacity style={s.saveBtn} onPress={() => handleSaveSettings().then(() => Alert.alert('✅ Saved', 'Budget settings updated.'))}>
            <Text style={s.saveBtnText}>Save</Text>
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

        {/* ── Data ── */}
        <Text style={s.sectionTitle}>Data</Text>
        <View style={s.card}>
          <SettingsRow icon="📤" label="Export as CSV" hint={`${expenses.length} expense${expenses.length !== 1 ? 's' : ''} ready to export`} onPress={handleExportCSV} noBorder />
        </View>

      </ScrollView>

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
    sheetOverlay: {flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end'},
    sheetCard: {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', borderWidth: 0},
    sheetHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border},
    sheetTitle: {...typography.subtitle, color: colors.text, fontWeight: '700'},
    sheetClose: {fontSize: 18, color: colors.textSecondary, padding: 4},
  });
