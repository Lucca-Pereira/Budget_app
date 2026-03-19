/**
 * AppModals.tsx
 *
 * Shared themed modal components used across the app.
 * Replaces native Alert.alert boxes with in-app UI that respects
 * the active theme and palette.
 *
 *  - ConfirmModal  : confirmation dialog with optional icon, message, and danger/primary action
 *  - ToastModal    : lightweight success/info overlay that auto-dismisses after 1.8s
 */
import React, {useEffect} from 'react';
import {
  Modal, View, Text, TouchableOpacity, Pressable, StyleSheet,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

export interface ConfirmModalProps {
  visible: boolean;
  icon?: string;
  title: string;
  message: string;
  confirmLabel: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible, icon, title, message,
  confirmLabel, confirmDanger,
  onConfirm, onCancel,
}: ConfirmModalProps) {
  const {colors} = useTheme();
  const confirmColor = confirmDanger ? '#EF4444' : colors.primary;
  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <Pressable style={s.overlay} onPress={onCancel}>
        <Pressable style={[s.card, {backgroundColor: colors.surface}]} onPress={() => {}}>
          {icon ? <Text style={s.icon}>{icon}</Text> : null}
          <Text style={[s.title, {color: colors.text}]}>{title}</Text>
          <Text style={[s.message, {color: colors.textSecondary}]}>{message}</Text>
          <View style={[s.divider, {backgroundColor: colors.border}]} />
          <TouchableOpacity
            style={[s.confirmBtn, {backgroundColor: confirmColor}]}
            onPress={onConfirm}
            activeOpacity={0.85}>
            <Text style={s.confirmBtnText}>{confirmLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <Text style={[s.cancelBtnText, {color: colors.textSecondary}]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── ToastModal ───────────────────────────────────────────────────────────────

export function ToastModal({visible, icon, message, onDone}: {
  visible: boolean;
  icon: string;
  message: string;
  onDone: () => void;
}) {
  const {colors} = useTheme();
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 1800);
      return () => clearTimeout(t);
    }
  }, [visible, onDone]);
  if (!visible) return null;
  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible={visible} onRequestClose={onDone}>
      <Pressable style={s.overlay} onPress={onDone}>
        <View style={[s.toastCard, {backgroundColor: colors.surface}]}>
          <Text style={s.toastIcon}>{icon}</Text>
          <Text style={[s.toastText, {color: colors.text}]}>{message}</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32},
  card: {width: '100%', borderRadius: 24, padding: 28, alignItems: 'center', elevation: 12, shadowColor: '#000', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.18, shadowRadius: 20},
  icon: {fontSize: 44, marginBottom: 12},
  title: {fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8},
  message: {fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20},
  divider: {height: 1, width: '100%', marginBottom: 16},
  confirmBtn: {width: '100%', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10},
  confirmBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  cancelBtn: {paddingVertical: 8, paddingHorizontal: 24},
  cancelBtnText: {fontSize: 14, fontWeight: '500'},
  // Toast
  toastCard: {borderRadius: 20, paddingVertical: 24, paddingHorizontal: 32, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.15, shadowRadius: 16},
  toastIcon: {fontSize: 40, marginBottom: 10},
  toastText: {fontSize: 15, fontWeight: '600', textAlign: 'center'},
});
