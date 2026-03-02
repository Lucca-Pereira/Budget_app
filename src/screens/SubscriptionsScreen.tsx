import React, {useState} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, Pressable,
} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {spacing, typography} from '../theme';
import {formatAmount} from '../utils/helpers';
import {Subscription} from '../types';

export default function SubscriptionsScreen() {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const {subscriptions, categories, settings, addSubscription, deleteSubscription, updateSubscription} = useBudget();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [categoryId, setCategoryId] = useState('');

  const totalMonthly = subscriptions.filter(s => s.isActive).reduce((sum, s) => sum + s.amount, 0);

  const openAdd = () => {
    setEditingSub(null);
    setName(''); setAmount(''); setDayOfMonth('1');
    setCategoryId(categories[0]?.id ?? '');
    setModalVisible(true);
  };

  const openEdit = (sub: Subscription) => {
    setEditingSub(sub);
    setName(sub.name); setAmount(String(sub.amount));
    setDayOfMonth(String(sub.dayOfMonth)); setCategoryId(sub.categoryId);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Error', 'Name is required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Enter a valid amount.'); return; }
    const day = parseInt(dayOfMonth, 10);
    if (isNaN(day) || day < 1 || day > 28) { Alert.alert('Error', 'Day must be between 1 and 28.'); return; }
    if (!categoryId) { Alert.alert('Error', 'Select a category.'); return; }
    if (editingSub) {
      updateSubscription({...editingSub, name: name.trim(), amount: amt, dayOfMonth: day, categoryId});
    } else {
      addSubscription({id: uuidv4(), name: name.trim(), amount: amt, dayOfMonth: day, categoryId, isActive: true});
    }
    setModalVisible(false);
  };

  const handleDelete = (sub: Subscription) => {
    Alert.alert(`Delete "${sub.name}"?`, "This will also remove it from this month's expenses.", [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => deleteSubscription(sub.id)},
    ]);
  };

  const getNextBillingDate = (day: number): string => {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), day);
    if (thisMonth >= today) return thisMonth.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
    const next = new Date(today.getFullYear(), today.getMonth() + 1, day);
    return next.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total monthly subscriptions</Text>
          <Text style={s.summaryAmount}>{formatAmount(totalMonthly, settings.currency)}</Text>
          <Text style={s.summaryCount}>{subscriptions.filter(sub => sub.isActive).length} active</Text>
        </View>

        {subscriptions.length === 0 && <Text style={s.empty}>No subscriptions yet. Tap ➕ to add one.</Text>}

        {subscriptions.map(sub => {
          const cat = categories.find(c => c.id === sub.categoryId);
          return (
            <TouchableOpacity key={sub.id} style={[s.subCard, !sub.isActive && s.subCardInactive]} onPress={() => openEdit(sub)}>
              <View style={[s.catBar, {backgroundColor: cat?.color ?? colors.border}]} />
              <View style={s.subInfo}>
                <View style={s.subTopRow}>
                  <Text style={[s.subName, !sub.isActive && s.textMuted]}>{sub.name}</Text>
                  <Text style={[s.subAmount, !sub.isActive && s.textMuted]}>{formatAmount(sub.amount, settings.currency)}</Text>
                </View>
                <View style={s.subBottomRow}>
                  <Text style={s.subMeta}>{cat?.icon} {cat?.name ?? 'Unknown'} · Next: {getNextBillingDate(sub.dayOfMonth)}</Text>
                  <Text style={s.subRecurring}>🔁 day {sub.dayOfMonth}</Text>
                </View>
              </View>
              <View style={s.subActions}>
                <TouchableOpacity onPress={() => updateSubscription({...sub, isActive: !sub.isActive})} style={s.actionBtn}>
                  <Text style={s.actionIcon}>{sub.isActive ? '⏸' : '▶️'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(sub)} style={s.actionBtn} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                  <Text style={s.actionIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={openAdd} activeOpacity={0.85}>
        <Text style={s.fabText}>➕</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingSub ? 'Edit Subscription' : 'Add Subscription'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Name</Text>
              <TextInput style={s.input} placeholder="e.g. Netflix" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} />
              <Text style={s.label}>Amount ({settings.currency})</Text>
              <TextInput style={s.input} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textSecondary} value={amount} onChangeText={setAmount} />
              <Text style={s.label}>Billing day of month (1–28)</Text>
              <TextInput style={s.input} keyboardType="number-pad" placeholder="1" placeholderTextColor={colors.textSecondary} value={dayOfMonth} onChangeText={setDayOfMonth} maxLength={2} />
              <Text style={s.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catPicker}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[s.catChip, categoryId === cat.id && {backgroundColor: cat.color, borderColor: cat.color}]}
                    onPress={() => setCategoryId(cat.id)}>
                    <Text style={s.catChipText}>{cat.icon} {cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={s.saveBtnText}>{editingSub ? 'Save Changes' : 'Add Subscription'}</Text>
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
    container: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.md, paddingBottom: 100},
    summaryCard: {backgroundColor: colors.surface, borderRadius: 16, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center'},
    summaryLabel: {...typography.caption, color: colors.textSecondary, marginBottom: 4},
    summaryAmount: {...typography.heading, color: colors.primary},
    summaryCount: {...typography.caption, color: colors.textSecondary, marginTop: 4},
    empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xl},
    subCard: {flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', alignItems: 'center'},
    subCardInactive: {opacity: 0.5},
    catBar: {width: 4, alignSelf: 'stretch'},
    subInfo: {flex: 1, padding: spacing.sm},
    subTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    subBottomRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4},
    subName: {...typography.body, color: colors.text, fontWeight: '600'},
    subAmount: {...typography.body, color: colors.text, fontWeight: '700'},
    subMeta: {...typography.caption, color: colors.textSecondary},
    subRecurring: {...typography.caption, color: colors.textSecondary},
    textMuted: {color: colors.textSecondary},
    subActions: {flexDirection: 'row', paddingRight: spacing.sm, gap: 4},
    actionBtn: {padding: 6},
    actionIcon: {fontSize: 16},
    fab: {position: 'absolute', bottom: 28, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 6},
    fabText: {fontSize: 24},
    modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end'},
    modalCard: {backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.md, maxHeight: '85%', borderWidth: 1, borderColor: colors.border},
    modalHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm},
    modalTitle: {...typography.subtitle, color: colors.text},
    modalClose: {fontSize: 18, color: colors.textSecondary, padding: 4},
    label: {...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: 4},
    input: {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border},
    catPicker: {marginTop: 4},
    catChip: {borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: 6, marginRight: 8, backgroundColor: colors.background},
    catChipText: {...typography.caption, color: colors.text},
    saveBtn: {backgroundColor: colors.primary, borderRadius: 10, padding: spacing.sm, alignItems: 'center', marginTop: spacing.md},
    saveBtnText: {color: '#fff', fontWeight: '700'},
  });
