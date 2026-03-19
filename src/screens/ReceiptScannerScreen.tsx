/**
 * ReceiptScannerScreen.tsx
 *
 * Two-phase screen:
 *  1. Capture — pick an image from camera or gallery
 *  2. Review  — show extracted line items, let user tweak category/amount, then save all
 */
import React, {useState, useCallback} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Image, Modal,
  Pressable, Platform,
} from 'react-native';
import {launchCamera, launchImageLibrary, ImagePickerResponse, Asset} from 'react-native-image-picker';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {Expense} from '../types';
import {spacing, typography} from '../theme';
import {dateToString} from '../utils/helpers';
import {scanReceipt, ReceiptItem, ReceiptResult} from '../utils/receiptApi';
import DateTimePicker from '@react-native-community/datetimepicker';
import {QuickAddCategoryModal} from '../components/QuickAddCategoryModal';
import {ConfirmModal, ToastModal} from '../components/AppModals';
import * as storage from '../utils/storage';

// ─── Editable row ─────────────────────────────────────────────────────────────

interface EditableItem extends ReceiptItem {
  _id: string;           // local key
  enabled: boolean;      // whether to save this item
  editedAmount: string;  // string for TextInput
  editedCategoryId: string | null;
  editedSubCategoryId: string | null;
}

function toEditable(items: ReceiptItem[]): EditableItem[] {
  return items.map(item => ({
    ...item,
    _id: uuidv4(),
    enabled: true,
    editedAmount: item.amount.toFixed(2),
    // Don't pre-fill category if Gemini wasn't confident — force user to pick
    editedCategoryId: item.confidence === 'low' ? null : item.suggestedCategoryId,
    editedSubCategoryId: item.confidence === 'low' ? null : item.suggestedSubCategoryId,
  }));
}

// ─── Category picker modal ────────────────────────────────────────────────────

function CategoryPickerModal({
  visible, onClose, onSelect, categories, onQuickAdd, title,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (catId: string, subId: string | null) => void;
  categories: ReturnType<typeof useBudget>['categories'];
  onQuickAdd: () => void;
  title?: string;
}) {
  const {colors} = useTheme();
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const selectedCat = expandedCat ? categories.find(c => c.id === expandedCat) : null;

  return (
    <Modal transparent statusBarTranslucent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={cpStyles.overlay} onPress={onClose}>
        <View style={[cpStyles.sheet, {backgroundColor: colors.surface}]}>
          <View style={[cpStyles.header, {borderBottomColor: colors.border}]}>
            <Text style={[cpStyles.title, {color: colors.text}]}>{title ?? 'Choose Category'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{color: colors.primary, fontSize: 16}}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={cpStyles.content} showsVerticalScrollIndicator={false}>
            <Text style={[cpStyles.sectionLabel, {color: colors.textSecondary}]}>Category</Text>
            <View style={cpStyles.chipGrid}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[cpStyles.chip, {borderColor: colors.border, backgroundColor: colors.background},
                    expandedCat === cat.id && {backgroundColor: cat.color, borderColor: cat.color}]}
                  onPress={() => {
                    if (cat.subCategories.length === 0) {
                      onSelect(cat.id, null);
                      onClose();
                    } else {
                      setExpandedCat(prev => prev === cat.id ? null : cat.id);
                    }
                  }}>
                  <Text style={cpStyles.catIcon}>{cat.icon}</Text>
                  <Text style={[cpStyles.catName, {color: colors.text},
                    expandedCat === cat.id && {color: '#fff'}]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
              {/* Quick-add chip */}
              <TouchableOpacity
                style={[cpStyles.chip, {borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.background}]}
                onPress={onQuickAdd}>
                <Text style={cpStyles.catIcon}>＋</Text>
                <Text style={[cpStyles.catName, {color: colors.primary}]}>New</Text>
              </TouchableOpacity>
            </View>
            {expandedCat && (
              <>
                <Text style={[cpStyles.sectionLabel, {color: colors.textSecondary, marginTop: 8}]}>Subcategory</Text>
                <View style={cpStyles.chipGrid}>
                  {selectedCat?.subCategories.map(sub => (
                    <TouchableOpacity
                      key={sub.id}
                      style={[cpStyles.chip, {borderColor: colors.border, backgroundColor: colors.background}]}
                      onPress={() => { onSelect(expandedCat, sub.id); onClose(); }}>
                      <Text style={cpStyles.catIcon}>{sub.icon}</Text>
                      <Text style={[cpStyles.catName, {color: colors.text}]}>{sub.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
          <TouchableOpacity style={[cpStyles.cancelBtn, {borderTopColor: colors.border}]} onPress={onClose}>
            <Text style={{color: colors.danger, fontSize: 16, fontWeight: '600'}}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const cpStyles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: 16},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth},
  title: {fontSize: 18, fontWeight: '700'},
  content: {paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8},
  sectionLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10},
  chipGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16},
  chip: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8},
  catIcon: {fontSize: 16, marginRight: 6},
  catName: {fontSize: 14, fontWeight: '600'},
  subRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 40, borderBottomWidth: StyleSheet.hairlineWidth},
  subName: {fontSize: 14},
  cancelBtn: {borderTopWidth: StyleSheet.hairlineWidth, padding: 16, alignItems: 'center'},
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReceiptScannerScreen() {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const {categories, addExpense, settings} = useBudget();

  const [phase, setPhase] = useState<'capture' | 'scanning' | 'review'>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [pickerTarget, setPickerTarget] = useState<string | null>(null); // _id of item being edited, or '__bulk__'
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [expenseDate, setExpenseDate] = useState(dateToString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);

  type ConfirmConfig = {icon?: string; title: string; message: string; confirmLabel: string; confirmDanger?: boolean; onConfirm: () => void};
  const [confirmModal, setConfirmModal] = useState<ConfirmConfig | null>(null);
  const [toast, setToast] = useState<{icon: string; message: string} | null>(null);
  const showConfirm = (cfg: ConfirmConfig) => setConfirmModal(cfg);
  const showToast = (icon: string, message: string) => setToast({icon, message});

  // ── Image helpers ──────────────────────────────────────────────────────────

  const processAsset = useCallback(async (asset: Asset) => {
    if (!asset.uri) return;
    setImageUri(asset.uri);
    setPhase('scanning');

    try {
      // Use base64 directly from image picker (includeBase64: true)
      const base64 = asset.base64;
      if (!base64) throw new Error('Could not read image data.');

      // Read categories fresh from storage — avoids stale closure if context
      // hasn't loaded yet when the screen first mounts.
      const freshCategories = await storage.getCategories();
      const mediaType = (asset.type as 'image/jpeg' | 'image/png' | 'image/webp') ?? 'image/jpeg';
      const scanned = await scanReceipt(base64, mediaType, freshCategories);

      setResult(scanned);
      setItems(toEditable(scanned.items));
      if (scanned.date) setExpenseDate(scanned.date);
      setPhase('review');
    } catch (err: any) {
      Alert.alert('Scan failed', err?.message ?? 'Something went wrong. Please try again.');
      setPhase('capture');
      setImageUri(null);
    }
  }, []);

  const handleCamera = useCallback(() => {
    launchCamera({mediaType: 'photo', quality: 0.4, maxWidth: 1280, maxHeight: 1280, includeBase64: true}, (res: ImagePickerResponse) => {
      if (res.didCancel || res.errorCode) return;
      const asset = res.assets?.[0];
      if (asset) processAsset(asset);
    });
  }, [processAsset]);

  const handleGallery = useCallback(() => {
    launchImageLibrary({mediaType: 'photo', quality: 0.4, maxWidth: 1280, maxHeight: 1280, includeBase64: true}, (res: ImagePickerResponse) => {
      if (res.didCancel || res.errorCode) return;
      const asset = res.assets?.[0];
      if (asset) processAsset(asset);
    });
  }, [processAsset]);

  // ── Item editing ───────────────────────────────────────────────────────────

  const updateItem = useCallback((id: string, patch: Partial<EditableItem>) => {
    setItems(prev => prev.map(item => item._id === id ? {...item, ...patch} : item));
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const toSave = items.filter(i => i.enabled);
    if (toSave.length === 0) {
      showToast('⚠️', 'Enable at least one item to save.');
      return;
    }

    const invalid = toSave.filter(i => {
      const amt = parseFloat(i.editedAmount);
      return isNaN(amt) || amt <= 0;
    });
    if (invalid.length > 0) {
      showToast('⚠️', 'Some items have invalid amounts. Please fix them first.');
      return;
    }

    const doSave = (itemsToSave: EditableItem[]) => {
      itemsToSave.forEach(item => {
        if (!item.editedCategoryId) return;
        const expense: Expense = {
          id: uuidv4(),
          categoryId: item.editedCategoryId,
          subCategoryId: item.editedSubCategoryId ?? undefined,
          amount: parseFloat(item.editedAmount),
          note: item.description,
          date: expenseDate,
          isRecurring: false,
        };
        addExpense(expense);
      });
      const count = itemsToSave.filter(i => i.editedCategoryId).length;
      showToast('✅', `${count} expense${count !== 1 ? 's' : ''} saved from receipt`);
      setPhase('capture');
      setImageUri(null);
      setResult(null);
      setItems([]);
    };

    const noCat = toSave.filter(i => !i.editedCategoryId);
    if (noCat.length > 0) {
      showConfirm({
        icon: '📂',
        title: 'Missing categories',
        message: `${noCat.length} item${noCat.length !== 1 ? 's' : ''} have no category assigned. Save without them?`,
        confirmLabel: 'Save anyway',
        onConfirm: () => { setConfirmModal(null); doSave(toSave); },
      });
      return;
    }

    doSave(toSave);
  }, [items, expenseDate, addExpense]);

  // ── Render: capture phase ──────────────────────────────────────────────────

  if (phase === 'capture') {
    return (
      <View style={s.container}>
        <View style={s.captureCard}>
          <Text style={s.receiptEmoji}>🧾</Text>
          <Text style={s.captureTitle}>Scan a Receipt</Text>
          <Text style={s.captureSubtitle}>
            Take a photo or choose from your gallery. We'll read the items and suggest categories automatically.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={handleCamera}>
            <Text style={s.primaryBtnText}>📷  Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.secondaryBtn, {borderColor: colors.border}]} onPress={handleGallery}>
            <Text style={[s.secondaryBtnText, {color: colors.text}]}>🖼   Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: scanning phase ─────────────────────────────────────────────────

  if (phase === 'scanning') {
    return (
      <View style={s.container}>
        <View style={s.scanningCard}>
          {imageUri && (
            <Image source={{uri: imageUri}} style={s.previewImage} resizeMode="cover" />
          )}
          <ActivityIndicator size="large" color={colors.primary} style={{marginTop: 24}} />
          <Text style={[s.scanningText, {color: colors.text}]}>Reading receipt…</Text>
          <Text style={[s.scanningSubtext, {color: colors.textSecondary}]}>Scanning receipt…</Text>
        </View>
      </View>
    );
  }

  // ── Render: review phase ───────────────────────────────────────────────────

  const enabledCount = items.filter(i => i.enabled).length;
  const enabledTotal = items
    .filter(i => i.enabled)
    .reduce((sum, i) => sum + (parseFloat(i.editedAmount) || 0), 0);

  return (
    <View style={s.container}>
      {/* Category picker modal */}
      <CategoryPickerModal
        visible={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        categories={categories}
        onSelect={(catId, subId) => {
          if (pickerTarget === '__bulk__') {
            // Apply to all enabled items that have no category yet
            setItems(prev => prev.map(item =>
              item.enabled && !item.editedCategoryId
                ? {...item, editedCategoryId: catId, editedSubCategoryId: subId}
                : item
            ));
          } else if (pickerTarget) {
            updateItem(pickerTarget, {editedCategoryId: catId, editedSubCategoryId: subId});
          }
        }}
        onQuickAdd={() => setShowQuickAdd(true)}
        title={pickerTarget === '__bulk__' ? 'Assign all uncategorised items' : undefined}
      />

      {/* Quick-add category modal */}
      <QuickAddCategoryModal
        visible={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onCreated={cat => {
          if (pickerTarget) updateItem(pickerTarget, {editedCategoryId: cat.id, editedSubCategoryId: null});
          setShowQuickAdd(false);
          setPickerTarget(null);
        }}
      />

      <ScrollView style={s.container} contentContainerStyle={s.reviewContent} showsVerticalScrollIndicator={false}>

        {/* Header summary */}
        <View style={[s.summaryCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          {result?.storeName && <Text style={[s.storeName, {color: colors.text}]}>{result.storeName}</Text>}
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={s.datePillRow}>
            <Text style={[s.summaryDate, {color: colors.textSecondary}]}>📅 {expenseDate}</Text>
            <Text style={[s.dateEditHint, {color: colors.primary}]}>edit</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={new Date(expenseDate)}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={(_, date) => {
                setShowDatePicker(false);
                if (date) setExpenseDate(dateToString(date));
              }}
            />
          )}
          {result?.total != null && (
            <Text style={[s.summaryTotal, {color: colors.textSecondary}]}>
              Receipt total: {settings.currency}{result.total.toFixed(2)}
            </Text>
          )}
        </View>

        <Text style={[s.sectionLabel, {color: colors.textSecondary}]}>
          {items.length} item{items.length !== 1 ? 's' : ''} found — tap to edit
        </Text>

        {/* Bulk-assign banner — shown when 2+ enabled items have no category */}
        {items.filter(i => i.enabled && !i.editedCategoryId).length >= 2 && (
          <TouchableOpacity
            style={[s.bulkBanner, {backgroundColor: colors.surface, borderColor: '#F59E0B'}]}
            onPress={() => setPickerTarget('__bulk__')}
            activeOpacity={0.8}>
            <Text style={s.bulkBannerEmoji}>📂</Text>
            <View style={{flex: 1}}>
              <Text style={[s.bulkBannerTitle, {color: colors.text}]}>
                Assign all to one category?
              </Text>
              <Text style={[s.bulkBannerHint, {color: colors.textSecondary}]}>
                {items.filter(i => i.enabled && !i.editedCategoryId).length} items need a category — tap to set them all at once
              </Text>
            </View>
            <Text style={{color: '#F59E0B', fontSize: 18}}>›</Text>
          </TouchableOpacity>
        )}

        {/* Item rows */}
        {items.map(item => {
          const cat = categories.find(c => c.id === item.editedCategoryId);
          const sub = cat?.subCategories.find(s => s.id === item.editedSubCategoryId);
          return (
            <View
              key={item._id}
              style={[
                s.itemCard,
                {backgroundColor: colors.surface, borderColor: item.enabled ? cat?.color ?? colors.border : colors.border},
                !item.enabled && s.itemCardDisabled,
              ]}>
              {/* Toggle + description row */}
              <View style={s.itemHeader}>
                <TouchableOpacity
                  style={[s.checkbox, item.enabled && {backgroundColor: colors.primary, borderColor: colors.primary}]}
                  onPress={() => updateItem(item._id, {enabled: !item.enabled})}>
                  {item.enabled && <Text style={s.checkmark}>✓</Text>}
                </TouchableOpacity>
                <Text style={[s.itemDescription, {color: item.enabled ? colors.text : colors.textSecondary}]} numberOfLines={2}>
                  {item.description}
                </Text>

              </View>

              {item.enabled && (
                <View style={s.itemBody}>
                  {/* Amount */}
                  <View style={s.amountRow}>
                    <Text style={[s.amountLabel, {color: colors.textSecondary}]}>Amount ({settings.currency})</Text>
                    <TextInput
                      style={[s.amountInput, {color: colors.text, borderColor: colors.border, backgroundColor: colors.background}]}
                      keyboardType="decimal-pad"
                      value={item.editedAmount}
                      onChangeText={val => updateItem(item._id, {editedAmount: val})}
                    />
                  </View>

                  {/* Category */}
                  <TouchableOpacity
                    style={[s.categoryPill, {borderColor: cat ? cat.color : '#F59E0B', borderWidth: cat ? 1.5 : 2}]}
                    onPress={() => setPickerTarget(item._id)}>
                    <Text style={s.categoryPillIcon}>{sub?.icon ?? cat?.icon ?? '📂'}</Text>
                    <Text style={[s.categoryPillText, {color: cat ? colors.text : '#F59E0B', fontWeight: cat ? '500' : '700'}]}>
                      {sub
                        ? `${cat?.name} › ${sub.name}`
                        : cat?.name
                        ?? (item.confidence === 'low'
                          ? "⚠️ Couldn't decide — tap to assign"
                          : '⚠️ Needs a category — tap to assign')}
                    </Text>
                    <Text style={{color: colors.textSecondary, marginLeft: 'auto'}}>›</Text>
                  </TouchableOpacity>

                  {/* Low confidence warning — shown when Gemini gave a medium/high guess */}
                  {item.confidence === 'medium' && cat && (
                    <Text style={[s.confidenceHint, {color: colors.textSecondary}]}>
                      Best guess — tap to change
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Rescan button */}
        <TouchableOpacity style={[s.rescanBtn, {borderColor: colors.border}]} onPress={() => {
          setPhase('capture');
          setImageUri(null);
          setResult(null);
          setItems([]);
        }}>
          <Text style={[s.rescanBtnText, {color: colors.textSecondary}]}>🔄  Scan a different receipt</Text>
        </TouchableOpacity>

        <View style={{height: 100}} />
      </ScrollView>

      {/* Themed confirm dialog */}
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
      <ToastModal
        visible={!!toast}
        icon={toast?.icon ?? '✅'}
        message={toast?.message ?? ''}
        onDone={() => setToast(null)}
      />

      {/* Sticky save bar */}
      <View style={[s.saveBar, {backgroundColor: colors.surface, borderTopColor: colors.border}]}>
        <View>
          <Text style={[s.saveBarCount, {color: colors.text}]}>
            {enabledCount} item{enabledCount !== 1 ? 's' : ''} selected
          </Text>
          <Text style={[s.saveBarTotal, {color: colors.primary}]}>
            {settings.currency}{enabledTotal.toFixed(2)}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.saveBtn, {backgroundColor: enabledCount > 0 ? colors.primary : colors.border}]}
          onPress={handleSave}
          disabled={enabledCount === 0}>
          <Text style={s.saveBtnText}>Save Expenses</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},

    // Capture
    captureCard: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg},
    receiptEmoji: {fontSize: 64, marginBottom: spacing.md},
    captureTitle: {...typography.heading, color: colors.text, marginBottom: spacing.sm, textAlign: 'center'},
    captureSubtitle: {...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg},
    primaryBtn: {backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: spacing.sm},
    primaryBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
    secondaryBtn: {borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center'},
    secondaryBtnText: {fontSize: 16, fontWeight: '600'},

    // Scanning
    scanningCard: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg},
    previewImage: {width: 200, height: 260, borderRadius: 12},
    scanningText: {...typography.subtitle, marginTop: spacing.md},
    scanningSubtext: {...typography.body, marginTop: spacing.xs, textAlign: 'center'},

    // Review
    reviewContent: {padding: spacing.md},
    summaryCard: {borderRadius: 14, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md},
    storeName: {...typography.subtitle, marginBottom: 4},
    datePillRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
    summaryDate: {...typography.body},
    dateEditHint: {fontSize: 12, fontWeight: '600'},
    summaryTotal: {...typography.body, marginTop: 4},
    sectionLabel: {...typography.caption, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5},

    itemCard: {borderRadius: 14, borderWidth: 1.5, padding: spacing.sm, marginBottom: spacing.sm},
    itemCardDisabled: {opacity: 0.45},
    itemHeader: {flexDirection: 'row', alignItems: 'center', gap: 10},
    checkbox: {width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#999', alignItems: 'center', justifyContent: 'center'},
    checkmark: {color: '#fff', fontSize: 13, fontWeight: '700'},
    itemDescription: {...typography.body, flex: 1, fontWeight: '500'},
    confidenceHint: {fontSize: 12, marginTop: 6, fontWeight: '500'},

    itemBody: {marginTop: spacing.sm, paddingLeft: 32},
    amountRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs},
    amountLabel: {...typography.caption},
    amountInput: {borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 6, width: 90, textAlign: 'right', ...typography.body},

    categoryPill: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: spacing.sm, paddingVertical: 7, marginTop: 4},
    categoryPillIcon: {fontSize: 14, marginRight: 6},
    categoryPillText: {...typography.caption},

    bulkBanner: {flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 14, padding: spacing.sm, marginBottom: spacing.sm, gap: 10},
    bulkBannerEmoji: {fontSize: 24},
    bulkBannerTitle: {fontSize: 14, fontWeight: '700', marginBottom: 2},
    bulkBannerHint: {fontSize: 12},

    rescanBtn: {borderWidth: 1, borderRadius: 12, padding: spacing.sm, alignItems: 'center', marginTop: spacing.sm},
    rescanBtnText: {...typography.body},

    // Save bar
    saveBar: {position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, elevation: 8},
    saveBarCount: {...typography.caption},
    saveBarTotal: {fontSize: 18, fontWeight: '700'},
    saveBtn: {borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24},
    saveBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  });
