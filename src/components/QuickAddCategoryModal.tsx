/**
 * QuickAddCategoryModal.tsx
 *
 * Lightweight "create category on the fly" sheet.
 * Shows Name, Icon, and Colour pickers only — enough to create
 * a usable category without leaving the current flow.
 * On save it calls onCreated(newCategory) so the caller can
 * auto-select the newly created category.
 */
import React, {useState} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, Pressable,
} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {Category} from '../types';
import {spacing, typography} from '../theme';

const PRESET_ICONS  = ['🏠','🚗','🍔','🛒','💊','🎬','✈️','👕','📚','💻','🎮','🐾','💪','☕','🍷','💰','🎁','💡','🏋️','🎵'];
const PRESET_COLORS = ['#FF6B6B','#FFA36C','#FFD93D','#6BCB77','#4D96FF','#C77DFF','#F72585','#4CC9F0','#06D6A0','#FB5607'];

export function QuickAddCategoryModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (cat: Category) => void;
}) {
  const {colors} = useTheme();
  const {addCategory} = useBudget();
  const s = makeStyles(colors);

  const [name, setName]   = useState('');
  const [icon, setIcon]   = useState('💰');
  const [color, setColor] = useState('#4D96FF');

  const reset = () => { setName(''); setIcon('💰'); setColor('#4D96FF'); };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cat: Category = {
      id: uuidv4(),
      name: trimmed,
      icon,
      color,
      budget: 0,
      isFixed: false,
      rollover: false,
      weeklyTracking: false,
      expectedAmount: 0,
      buffer: 0,
      subCategories: [],
    };
    addCategory(cat);
    onCreated(cat);
    reset();
    onClose();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal transparent statusBarTranslucent animationType="slide" visible={visible} onRequestClose={handleClose}>
      <Pressable style={s.overlay} onPress={handleClose}>
        <Pressable style={[s.sheet, {backgroundColor: colors.surface}]} onPress={() => {}}>
          <View style={[s.handle, {backgroundColor: colors.border}]} />
          <Text style={[s.title, {color: colors.text}]}>New Category</Text>

          <Text style={[s.label, {color: colors.textSecondary}]}>Name</Text>
          <TextInput
            style={[s.input, {color: colors.text, borderColor: colors.border, backgroundColor: colors.background}]}
            placeholder="e.g. Groceries"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={[s.label, {color: colors.textSecondary}]}>Icon</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 4}}>
            <View style={{flexDirection: 'row', gap: 6}}>
              {PRESET_ICONS.map(i => (
                <TouchableOpacity
                  key={i}
                  style={[s.iconChip, icon === i && {borderColor: color, backgroundColor: color + '22'}]}
                  onPress={() => setIcon(i)}>
                  <Text style={{fontSize: 20}}>{i}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[s.label, {color: colors.textSecondary}]}>Colour</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md}}>
            {PRESET_COLORS.map(col => (
              <TouchableOpacity
                key={col}
                style={[s.colorCircle, {backgroundColor: col}, color === col && s.colorCircleSelected]}
                onPress={() => setColor(col)}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[s.saveBtn, {backgroundColor: name.trim() ? color : colors.border}]}
            onPress={handleSave}
            disabled={!name.trim()}>
            <Text style={s.saveBtnText}>Create Category</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40},
  handle: {width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16},
  title: {fontSize: 18, fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center'},
  label: {...typography.caption, marginBottom: 6, marginTop: spacing.sm},
  input: {borderRadius: 10, padding: spacing.sm, ...typography.body, borderWidth: 1, marginBottom: 4},
  iconChip: {padding: 6, borderRadius: 8, borderWidth: 2, borderColor: 'transparent'},
  colorCircle: {width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent'},
  colorCircleSelected: {borderColor: '#000', opacity: 0.9},
  saveBtn: {borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4},
  saveBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});
