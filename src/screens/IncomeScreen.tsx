/**
 * IncomeScreen.tsx
 *
 * Log and browse income/reimbursement events.
 *  - Month navigator to browse past months
 *  - List of events for the selected month
 *  - Tap a row to edit; tap 🗑 or long-press to delete
 *  - FAB opens an "Add" slide-up sheet
 */
import React, {useMemo, useState} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, Pressable, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {v4 as uuidv4} from 'uuid';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {spacing, typography} from '../theme';
import {
  formatAmount, currentMonth, prevMonth, nextMonth,
  monthLabel, incomeEventsForMonth, totalReceived, todayString, dateToString,
} from '../utils/helpers';
import {ConfirmModal} from '../components/AppModals';
import {IncomeEvent} from '../types';

const TYPE_OPTIONS: {value: IncomeEvent['type']; label: string; icon: string}[] = [
  {value: 'reimbursement', label: 'Reimbursement', icon: '💸'},
  {value: 'freelance',     label: 'Freelance',     icon: '💼'},
  {value: 'gift',          label: 'Gift',           icon: '🎁'},
  {value: 'other',         label: 'Other',          icon: '💰'},
];

const typeIcon = (t: IncomeEvent['type']) =>
  TYPE_OPTIONS.find(o => o.value === t)?.icon ?? '💰';
const typeLabel = (t: IncomeEvent['type']) =>
  TYPE_OPTIONS.find(o => o.value === t)?.label ?? 'Other';

export default function IncomeScreen() {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const {settings, incomeEvents, addIncomeEvent, updateIncomeEvent, deleteIncomeEvent} = useBudget();

  const [monthKey, setMonthKey] = useState(currentMonth());
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<IncomeEvent | null>(null);

  // Shared form state (used for both add and edit)
  const [amount, setAmount]         = useState('');
  const [note, setNote]             = useState('');
  const [date, setDate]             = useState(todayString());
  const [type, setType]             = useState<IncomeEvent['type']>('other');
  const [showDatePicker, setShowDatePicker] = useState(false);

  type ConfirmConfig = {icon?: string; title: string; message: string; confirmLabel: string; confirmDanger?: boolean; onConfirm: () => void};
  const [confirmModal, setConfirmModal] = useState<ConfirmConfig | null>(null);

  const monthEvents = useMemo(
    () => incomeEventsForMonth(incomeEvents, monthKey)
            .sort((a, b) => b.date.localeCompare(a.date)),
    [incomeEvents, monthKey],
  );
  const monthTotal = useMemo(() => totalReceived(monthEvents), [monthEvents]);

  const openAdd = () => {
    setEditingEvent(null);
    setAmount(''); setNote(''); setDate(todayString()); setType('other');
    setShowDatePicker(false);
    setModalVisible(true);
  };

  const openEdit = (ev: IncomeEvent) => {
    setEditingEvent(ev);
    setAmount(String(ev.amount));
    setNote(ev.note);
    setDate(ev.date);
    setType(ev.type);
    setShowDatePicker(false);
    setModalVisible(true);
  };

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Enter a valid amount.'); return; }
    if (editingEvent) {
      updateIncomeEvent({...editingEvent, amount: amt, note: note.trim(), date, type});
    } else {
      addIncomeEvent({id: uuidv4(), amount: amt, note: note.trim(), date, type});
    }
    setModalVisible(false);
  };

  const handleDelete = (ev: IncomeEvent) => {
    setConfirmModal({
      icon: '🗑️',
      title: 'Delete this entry?',
      message: `${typeLabel(ev.type)} · ${formatAmount(ev.amount, settings.currency)}`,
      confirmLabel: 'Delete',
      confirmDanger: true,
      onConfirm: () => { setConfirmModal(null); deleteIncomeEvent(ev.id); },
    });
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

      {/* Summary */}
      <View style={s.summaryCard}>
        <Text style={s.summaryLabel}>Total received this month</Text>
        <Text style={s.summaryAmount}>{formatAmount(monthTotal, settings.currency)}</Text>
        <Text style={s.summaryCount}>{monthEvents.length} event{monthEvents.length !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {monthEvents.length === 0 && (
          <Text style={s.empty}>No income events this month. Tap ➕ to add one.</Text>
        )}

        {monthEvents.map(ev => (
          <TouchableOpacity
            key={ev.id}
            style={s.row}
            onPress={() => openEdit(ev)}
            onLongPress={() => handleDelete(ev)}>
            <View style={s.greenBar} />
            <View style={s.iconBubble}>
              <Text style={s.icon}>{typeIcon(ev.type)}</Text>
            </View>
            <View style={s.info}>
              <View style={s.topRow}>
                <Text style={s.typeLabel}>{typeLabel(ev.type)}</Text>
                <Text style={s.amount}>{formatAmount(ev.amount, settings.currency)}</Text>
              </View>
              {ev.note ? <Text style={s.note}>{ev.note}</Text> : null}
              <Text style={s.date}>{ev.date}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(ev)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <Text style={s.deleteIcon}>🗑</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={[s.fab, {bottom: 28 + insets.bottom}]} onPress={openAdd} activeOpacity={0.85}>
        <Text style={s.fabText}>➕</Text>
      </TouchableOpacity>

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

      {/* Add / Edit modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingEvent ? 'Edit Income Event' : 'Add Income Event'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Type chips */}
              <Text style={s.label}>Type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.typeRow}
                contentContainerStyle={{gap: 8, paddingVertical: 4}}>
                {TYPE_OPTIONS.map(opt => {
                  const sel = type === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.typeChip, sel && {backgroundColor: colors.success, borderColor: colors.success}]}
                      onPress={() => setType(opt.value)}>
                      <Text style={[s.typeChipText, sel && {color: '#fff', fontWeight: '700'}]}>
                        {opt.icon} {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={s.label}>Amount ({settings.currency})</Text>
              <TextInput
                style={s.input}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={s.label}>Date</Text>
              <TouchableOpacity style={s.input} onPress={() => setShowDatePicker(true)}>
                <Text style={{color: colors.text}}>{date}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={new Date(date)}
                  mode="date"
                  display={Platform.OS === 'android' ? 'default' : 'spinner'}
                  maximumDate={new Date()}
                  onChange={(_, selected) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selected) setDate(dateToString(selected));
                  }}
                />
              )}

              <Text style={s.label}>Note (optional)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Expense claim from work"
                placeholderTextColor={colors.textSecondary}
                value={note}
                onChangeText={setNote}
              />

              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={s.saveBtnText}>{editingEvent ? 'Save Changes' : 'Add Event'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container:     {flex: 1, backgroundColor: colors.background},
    navigator:     {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 2, borderBottomColor: colors.success + '55'},
    navArrow:      {fontSize: 32, color: colors.success, lineHeight: 36},
    navLabel:      {...typography.subtitle, color: colors.text},
    summaryCard:   {backgroundColor: colors.surface, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center'},
    summaryLabel:  {...typography.caption, color: colors.textSecondary, marginBottom: 4},
    summaryAmount: {...typography.heading, color: colors.success},
    summaryCount:  {...typography.caption, color: colors.textSecondary, marginTop: 4},
    content:       {padding: spacing.md, paddingBottom: 100},
    empty:         {...typography.body, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xl},
    row:           {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden'},
    greenBar:      {width: 4, alignSelf: 'stretch', backgroundColor: colors.success},
    iconBubble:    {width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginHorizontal: spacing.sm, backgroundColor: colors.success + '22'},
    icon:          {fontSize: 20},
    info:          {flex: 1, paddingVertical: spacing.sm, paddingRight: spacing.sm},
    topRow:        {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    typeLabel:     {...typography.body, color: colors.text, fontWeight: '600'},
    amount:        {...typography.body, color: colors.success, fontWeight: '700'},
    note:          {...typography.caption, color: colors.textSecondary, marginTop: 2},
    date:          {...typography.caption, color: colors.textSecondary, marginTop: 2},
    deleteIcon:    {fontSize: 16, paddingHorizontal: spacing.sm},
    fab:           {position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, justifyContent: 'center', alignItems: 'center', elevation: 6},
    fabText:       {fontSize: 24},
    modalOverlay:  {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end'},
    modalCard:     {backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.md, maxHeight: '85%', borderWidth: 1, borderColor: colors.border},
    modalHeader:   {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm},
    modalTitle:    {...typography.subtitle, color: colors.text},
    modalClose:    {fontSize: 18, color: colors.textSecondary, padding: 4},
    label:         {...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: 4},
    typeRow:       {marginTop: 4},
    typeChip:      {borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.background},
    typeChipText:  {...typography.caption, color: colors.text},
    input:         {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border},
    saveBtn:       {backgroundColor: colors.success, borderRadius: 10, padding: spacing.sm, alignItems: 'center', marginTop: spacing.md},
    saveBtnText:   {color: '#fff', fontWeight: '700'},
  });
