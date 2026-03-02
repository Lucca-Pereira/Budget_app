import React, {useMemo, useState, useRef} from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, Pressable, PanResponder, Animated,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {format} from 'date-fns';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {
  currentMonth, expensesForMonth, expensesForWeek,
  totalByCategory, totalSpent, formatAmount, monthLabel, currentWeekOfMonth,
} from '../utils/helpers';
import {Category, Expense} from '../types';
import {spacing, typography} from '../theme';

const WEEK_LABELS = ['', 'Week 1 (1–7)', 'Week 2 (8–14)', 'Week 3 (15–21)', 'Week 4 (22+)'];

function CategoryModal({cat, expenses, currency, onClose}: {
  cat: Category; expenses: Expense[]; currency: string; onClose: () => void;
}) {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(translateY, {toValue: 800, duration: 200, useNativeDriver: true}).start(onClose);
        } else {
          Animated.spring(translateY, {toValue: 0, useNativeDriver: true}).start();
        }
      },
    }),
  ).current;

  const catExpenses = expenses
    .filter(e => e.categoryId === cat.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = catExpenses.reduce((sum, e) => sum + e.amount, 0);
  const subCats = cat.subCategories ?? [];

  const subTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of catExpenses) {
      if (e.subCategoryId) map[e.subCategoryId] = (map[e.subCategoryId] || 0) + e.amount;
    }
    return map;
  }, [catExpenses]);

  const hasBuffer = cat.expectedAmount > 0;

  return (
    <Modal transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Animated.View style={[s.modalCard, {transform: [{translateY}]}]}>
          {/* Coloured header strip — also handles swipe down */}
          <View {...panResponder.panHandlers} style={[s.modalHeaderStrip, {backgroundColor: cat.color + '33'}]}>
            <View style={[s.modalIconCircle, {backgroundColor: cat.color}]}>
              <Text style={{fontSize: 22}}>{cat.icon}</Text>
            </View>
            <Text style={s.modalTitle}>{cat.name}</Text>
            <TouchableOpacity onPress={onClose} style={s.modalCloseBtn}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {hasBuffer && (
            <View style={[s.bufferCard, {borderLeftColor: cat.color, borderLeftWidth: 3}]}>
              <View style={s.bufferRow}>
                <Text style={s.bufferLabel}>Spent</Text>
                <Text style={s.bufferLabel}>Expected</Text>
                <Text style={s.bufferLabel}>Limit</Text>
              </View>
              <View style={s.bufferRow}>
                <Text style={[s.bufferValue,
                  total > cat.expectedAmount + cat.buffer && {color: colors.danger},
                  total > cat.expectedAmount && total <= cat.expectedAmount + cat.buffer && {color: colors.warning},
                ]}>
                  {formatAmount(total, currency)}
                </Text>
                <Text style={s.bufferValue}>{formatAmount(cat.expectedAmount, currency)}</Text>
                <Text style={s.bufferValue}>{formatAmount(cat.expectedAmount + cat.buffer, currency)}</Text>
              </View>
              <View style={s.segmentedTrack}>
                <View style={[s.segmentExpected, {flex: cat.expectedAmount}]} />
                <View style={[s.segmentBuffer, {flex: cat.buffer}]} />
              </View>
              <View style={s.segmentedFillWrapper}>
                <View style={[s.segmentedFill, {
                  width: `${Math.min((total / (cat.expectedAmount + cat.buffer)) * 100, 100)}%`,
                  backgroundColor: total > cat.expectedAmount + cat.buffer ? colors.danger : total > cat.expectedAmount ? colors.warning : colors.success,
                }]} />
              </View>
              <Text style={s.bufferHint}>
                {total <= cat.expectedAmount
                  ? '✅ Within expected amount'
                  : total <= cat.expectedAmount + cat.buffer
                  ? `⚠️ In buffer zone — ${formatAmount(cat.expectedAmount + cat.buffer - total, currency)} left`
                  : `🔴 ${formatAmount(total - cat.expectedAmount - cat.buffer, currency)} over limit`}
              </Text>
            </View>
          )}

          {!hasBuffer && (
            <View style={[s.totalPill, {backgroundColor: cat.color + '22'}]}>
              <Text style={[s.totalPillText, {color: cat.color}]}>Total: {formatAmount(total, currency)}</Text>
            </View>
          )}

          {subCats.length > 0 && (
            <>
              <Text style={s.subBreakdownTitle}>Breakdown</Text>
              {subCats.map(sub => {
                const subSpent = subTotals[sub.id] || 0;
                const hasBudget = sub.budget > 0;
                const progress = hasBudget ? subSpent / sub.budget : 0;
                return (
                  <View key={sub.id} style={s.subBreakRow}>
                    <Text style={s.subBreakIcon}>{sub.icon}</Text>
                    <View style={{flex: 1}}>
                      <View style={s.subBreakHeader}>
                        <Text style={s.subBreakName}>{sub.name}</Text>
                        <Text style={s.subBreakAmount}>
                          {formatAmount(subSpent, currency)}{hasBudget ? ` / ${formatAmount(sub.budget, currency)}` : ''}
                        </Text>
                      </View>
                      {hasBudget && (
                        <View style={s.progressTrack}>
                          <View style={[s.progressFill, {
                            width: `${Math.min(progress * 100, 100)}%`,
                            backgroundColor: progress > 1 ? colors.danger : cat.color,
                          }]} />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              {(() => {
                const uncatTotal = catExpenses.filter(e => !e.subCategoryId).reduce((sum, e) => sum + e.amount, 0);
                if (uncatTotal === 0) return null;
                return (
                  <View style={s.subBreakRow}>
                    <Text style={s.subBreakIcon}>📌</Text>
                    <View style={{flex: 1}}>
                      <View style={s.subBreakHeader}>
                        <Text style={s.subBreakName}>Other</Text>
                        <Text style={s.subBreakAmount}>{formatAmount(uncatTotal, currency)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </>
          )}

          <Text style={s.subBreakdownTitle}>Expenses</Text>
          <ScrollView style={s.modalList} showsVerticalScrollIndicator={false}>
            {catExpenses.length === 0 && <Text style={s.empty}>No expenses this month.</Text>}
            {catExpenses.map(exp => {
              const sub = subCats.find(sc => sc.id === exp.subCategoryId);
              return (
                <View key={exp.id} style={s.expRow}>
                  <View style={s.expInfo}>
                    {exp.note ? <Text style={s.expNote}>{exp.note}</Text> : null}
                    <Text style={s.expDate}>
                      {format(new Date(exp.date), 'dd MMM yyyy')}
                      {sub ? ` · ${sub.icon} ${sub.name}` : ''}
                      {exp.isRecurring ? ' · 🔁' : ''}
                    </Text>
                  </View>
                  <Text style={s.expAmount}>{formatAmount(exp.amount, currency)}</Text>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const {colors, isDark} = useTheme();
  const s = makeStyles(colors);
  const {categories, expenses, settings, isLoading, effectiveBudget} = useBudget();
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);

  const month = currentMonth();
  const week = currentWeekOfMonth();

  const monthlyExpenses = useMemo(() => expensesForMonth(expenses, month), [expenses, month]);
  const weeklyExpenses  = useMemo(() => expensesForWeek(expenses, month, week), [expenses, month, week]);
  const spentByCategory = useMemo(() => totalByCategory(monthlyExpenses), [monthlyExpenses]);
  const weeklySpentByCategory = useMemo(() => totalByCategory(weeklyExpenses), [weeklyExpenses]);
  const totalMonthlySpent = useMemo(() => totalSpent(monthlyExpenses), [monthlyExpenses]);

  const income = settings.incomeAmount;
  const remaining = income - totalMonthlySpent;
  const overallProgress = income > 0 ? totalMonthlySpent / income : 0;

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const getBarColor = (spent: number, cat: Category, budget: number) => {
    if (cat.expectedAmount > 0) {
      if (spent > cat.expectedAmount + cat.buffer) return colors.danger;
      if (spent > cat.expectedAmount) return colors.warning;
      return colors.success;
    }
    const p = budget > 0 ? spent / budget : 0;
    if (p > 1) return colors.danger;
    if (p > 0.9) return colors.danger + 'CC';
    if (p > 0.75) return colors.warning + 'CC';
    return cat.color;
  };

  const getProgressWidth = (spent: number, cat: Category, budget: number) => {
    if (cat.expectedAmount > 0) {
      const total = cat.expectedAmount + cat.buffer;
      return `${Math.min((spent / total) * 100, 100)}%` as `${number}%`;
    }
    if (budget <= 0) return '0%' as `${number}%`;
    return `${Math.min((spent / budget) * 100, 100)}%` as `${number}%`;
  };

  return (
    <View style={{flex: 1, backgroundColor: colors.background}}>
      <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Summary card — gradient-style tinted with primary */}
        <View style={[s.summaryCard, {borderColor: colors.primary + '44', backgroundColor: isDark ? '#0D2137' : '#EFF9FF'}]}>
          <View style={s.summaryTopRow}>
            <Text style={s.monthLabel}>{monthLabel(month)}</Text>

          </View>
          <View style={s.amountsRow}>
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>Spent</Text>
              <Text style={[s.amountValue, {color: colors.danger}]}>{formatAmount(totalMonthlySpent, settings.currency)}</Text>
            </View>
            <View style={[s.amountDivider, {backgroundColor: colors.primary + '33'}]} />
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>{remaining >= 0 ? 'Remaining' : 'Over budget'}</Text>
              <Text style={[s.amountValue, {color: remaining >= 0 ? colors.success : colors.danger}]}>{formatAmount(Math.abs(remaining), settings.currency)}</Text>
            </View>
            <View style={[s.amountDivider, {backgroundColor: colors.primary + '33'}]} />
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>Income</Text>
              <Text style={[s.amountValue, {color: colors.primary}]}>{formatAmount(income, settings.currency)}</Text>
            </View>
          </View>
          {income > 0 && (
            <View style={s.progressTrack}>
              <View style={[s.progressFill, {
                width: `${Math.min(overallProgress * 100, 100)}%`,
                backgroundColor: overallProgress > 0.9 ? colors.danger : overallProgress > 0.75 ? colors.warning : colors.primary,
              }]} />
            </View>
          )}
        </View>

        {/* Section header — coloured left border accent */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionAccent, {backgroundColor: colors.warning}]} />
          <Text style={s.sectionTitle}>📅 {WEEK_LABELS[week]}</Text>
        </View>
        {categories.filter(c => c.weeklyTracking).length === 0 && (
          <Text style={s.empty}>No weekly categories — enable 📅 Weekly tracking in Settings.</Text>
        )}
        {categories.filter(c => c.weeklyTracking).map(cat => {
          const spent = weeklySpentByCategory[cat.id] || 0;
          const budget = effectiveBudget(cat.id);
          const weeklyBudget = budget > 0 ? budget / 4 : 0;
          const hasBudget = weeklyBudget > 0;
          const isOver = hasBudget && spent > weeklyBudget;
          return (
            <TouchableOpacity
              key={cat.id}
              style={s.catCard}
              onPress={() => setSelectedCat(cat)}
              activeOpacity={0.75}>
              <View style={s.catHeader}>
                <View style={[s.colorDot, {backgroundColor: cat.color}]} />
                <Text style={s.catIconText}>{cat.icon}</Text>
                <View style={{flex: 1}}>
                  <Text style={s.catName}>{cat.name}</Text>
                  <Text style={s.catSubtitle}>Tap to view expenses</Text>
                </View>
                <Text style={[s.catSpent, isOver && {color: colors.danger}]}>
                  {formatAmount(spent, settings.currency)}
                  {hasBudget && ` / ${formatAmount(weeklyBudget, settings.currency)}`}
                </Text>
              </View>
              {hasBudget && (
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, {width: getProgressWidth(spent, cat, weeklyBudget), backgroundColor: getBarColor(spent, cat, weeklyBudget)}]} />
                </View>
              )}
              {isOver && <Text style={s.overLabel}>{formatAmount(spent - weeklyBudget, settings.currency)} over this week</Text>}
            </TouchableOpacity>
          );
        })}

        <View style={s.sectionHeader}>
          <View style={[s.sectionAccent, {backgroundColor: colors.primary}]} />
          <Text style={s.sectionTitle}>📊 This Month</Text>
        </View>
        {categories.map(cat => {
          const spent = spentByCategory[cat.id] || 0;
          const budget = effectiveBudget(cat.id);
          const hasBudget = budget > 0 || cat.expectedAmount > 0;
          const hasRollover = cat.rollover && cat.budget > 0 && budget > cat.budget;
          const hasSubs = (cat.subCategories?.length ?? 0) > 0;
          const hasBuffer = cat.expectedAmount > 0;

          return (
            <TouchableOpacity
              key={cat.id}
              style={s.catCard}
              onPress={() => setSelectedCat(cat)}
              activeOpacity={0.75}>
              <View style={s.catHeader}>
                <View style={[s.colorDot, {backgroundColor: cat.color}]} />
                <Text style={s.catIconText}>{cat.icon}</Text>
                <View style={{flex: 1}}>
                  <Text style={s.catName}>{cat.name}</Text>
                  {hasRollover && <Text style={s.rolloverLabel}>+{formatAmount(budget - cat.budget, settings.currency)} rollover</Text>}
                  {hasSubs && <Text style={s.catSubtitle}>{cat.subCategories.length} sub-categories</Text>}
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={[s.catSpent, spent > (cat.expectedAmount > 0 ? cat.expectedAmount + cat.buffer : budget) && {color: colors.danger}]}>
                    {formatAmount(spent, settings.currency)}
                    {budget > 0 && !hasBuffer && ` / ${formatAmount(budget, settings.currency)}`}
                  </Text>
                  {hasBuffer && (
                    <Text style={s.bufferBadge}>exp {formatAmount(cat.expectedAmount, settings.currency)} +{formatAmount(cat.buffer, settings.currency)}</Text>
                  )}
                </View>
              </View>
              {hasBudget && (
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, {width: getProgressWidth(spent, cat, budget), backgroundColor: getBarColor(spent, cat, budget)}]} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => navigation.navigate('Add')} activeOpacity={0.85}>
        <Text style={s.fabText}>➕</Text>
      </TouchableOpacity>

      {selectedCat && (
        <CategoryModal cat={selectedCat} expenses={monthlyExpenses} currency={settings.currency} onClose={() => setSelectedCat(null)} />
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.md, paddingBottom: 100},
    center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},

    // FAB
    fab: {position: 'absolute', bottom: 28, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: colors.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 8},
    fabText: {fontSize: 26},

    // Summary card
    summaryCard: {borderRadius: 18, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1.5},
    summaryTopRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm},
    monthLabel: {...typography.subtitle, color: colors.textSecondary},
    primaryPill: {borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3},
    primaryPillText: {fontSize: 12, fontWeight: '700'},
    amountsRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm},
    amountBlock: {flex: 1, alignItems: 'center'},
    amountDivider: {width: 1, height: 32, borderRadius: 1},
    amountLabel: {...typography.caption, color: colors.textSecondary, marginBottom: 2},
    amountValue: {fontSize: 17, fontWeight: '700'},
    progressTrack: {height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginTop: spacing.xs},
    progressFill: {height: '100%', borderRadius: 4},

    // Section headers
    sectionHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.xs},
    sectionAccent: {width: 4, height: 18, borderRadius: 2, marginRight: 8},
    sectionTitle: {...typography.subtitle, color: colors.text},

    empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic'},

    // Category cards
    catCard: {borderRadius: 14, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
    catHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
    colorDot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
    catIconText: {fontSize: 18, marginRight: spacing.xs},
    iconBubble: {width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm},
    catName: {...typography.body, color: colors.text, fontWeight: '700'},
    catSubtitle: {...typography.caption, color: colors.textSecondary, marginTop: 1},
    rolloverLabel: {...typography.caption, color: colors.success, marginTop: 1},
    catSpent: {...typography.body, color: colors.textSecondary, fontWeight: '600'},
    bufferBadge: {...typography.caption, color: colors.warning, marginTop: 2},
    overLabel: {...typography.caption, color: colors.danger, marginTop: 4, textAlign: 'right', fontWeight: '600'},

    // Modal
    modalOverlay: {flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end'},
    modalCard: {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', height: '75%', borderWidth: 0},
    dragHandleArea: {height: 0},
    dragHandle: {width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border},
    modalHeaderStrip: {flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingBottom: spacing.sm},
    modalIconCircle: {width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm},
    modalTitle: {...typography.subtitle, color: colors.text, flex: 1},
    modalCloseBtn: {padding: 4},
    modalClose: {fontSize: 18, color: colors.textSecondary},
    totalPill: {borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm, marginHorizontal: spacing.md},
    totalPillText: {fontWeight: '700', fontSize: 15, textAlign: 'center'},
    modalTotal: {...typography.body, color: colors.textSecondary, marginBottom: spacing.sm, paddingHorizontal: spacing.md},
    modalList: {flex: 1, paddingHorizontal: spacing.md},

    // Buffer card
    bufferCard: {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm, marginHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border},
    bufferRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
    bufferLabel: {...typography.caption, color: colors.textSecondary},
    bufferValue: {...typography.body, color: colors.text, fontWeight: '600'},
    bufferHint: {...typography.caption, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic'},
    segmentedTrack: {flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4, opacity: 0.2},
    segmentExpected: {backgroundColor: colors.success, height: '100%'},
    segmentBuffer: {backgroundColor: colors.warning, height: '100%'},
    segmentedFillWrapper: {height: 8, borderRadius: 4, overflow: 'hidden', marginTop: -8, backgroundColor: 'transparent'},
    segmentedFill: {height: '100%', borderRadius: 4},

    // Sub breakdown
    subBreakdownTitle: {...typography.body, color: colors.text, fontWeight: '600', marginTop: spacing.sm, marginBottom: 4, paddingHorizontal: spacing.md},
    subBreakRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs, paddingHorizontal: spacing.md},
    subBreakIcon: {fontSize: 16, marginRight: 6},
    subBreakHeader: {flexDirection: 'row', justifyContent: 'space-between'},
    subBreakName: {...typography.body, color: colors.text},
    subBreakAmount: {...typography.body, color: colors.textSecondary},

    // Expense rows
    expRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border},
    expInfo: {flex: 1},
    expNote: {...typography.body, color: colors.text},
    expDate: {...typography.caption, color: colors.textSecondary, marginTop: 2},
    expAmount: {...typography.body, color: colors.text, fontWeight: '700'},
  });
