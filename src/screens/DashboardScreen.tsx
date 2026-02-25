import React, {useMemo} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {useBudget} from '../context/BudgetContext';
import {colors, spacing, typography} from '../theme';
import {
  currentMonth,
  expensesForMonth,
  totalByCategory,
  totalSpent,
  formatAmount,
  monthLabel,
} from '../utils/helpers';

export default function DashboardScreen() {
  const {categories, expenses, settings, isLoading, effectiveBudget} = useBudget();

  const month = currentMonth();

  const monthlyExpenses = useMemo(
    () => expensesForMonth(expenses, month),
    [expenses, month],
  );

  const spentByCategory = useMemo(
    () => totalByCategory(monthlyExpenses),
    [monthlyExpenses],
  );

  const totalMonthlySpent = useMemo(
    () => totalSpent(monthlyExpenses),
    [monthlyExpenses],
  );

  const income = settings.incomeAmount;
  const remaining = income - totalMonthlySpent;
  const overallProgress = income > 0 ? totalMonthlySpent / income : 0;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>

      {/* ── Monthly summary card ── */}
      <View style={styles.summaryCard}>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>

        <View style={styles.amountsRow}>
          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>Spent</Text>
            <Text style={[styles.amountValue, {color: colors.danger}]}>
              {formatAmount(totalMonthlySpent, settings.currency)}
            </Text>
          </View>
          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>
              {remaining >= 0 ? 'Remaining' : 'Over budget'}
            </Text>
            <Text
              style={[
                styles.amountValue,
                {color: remaining >= 0 ? colors.success : colors.danger},
              ]}>
              {formatAmount(Math.abs(remaining), settings.currency)}
            </Text>
          </View>
          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>Income</Text>
            <Text style={[styles.amountValue, {color: colors.text}]}>
              {formatAmount(income, settings.currency)}
            </Text>
          </View>
        </View>

        {income > 0 && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(overallProgress * 100, 100)}%`,
                  backgroundColor:
                    overallProgress > 0.9 ? colors.danger : colors.primary,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* ── Per-category breakdown ── */}
      <Text style={styles.sectionTitle}>Categories this month</Text>

      {categories.length === 0 && (
        <Text style={styles.empty}>No categories yet — add some in Settings.</Text>
      )}

      {categories.map(cat => {
        const spent = spentByCategory[cat.id] || 0;
        const budget = effectiveBudget(cat.id);
        const hasBudget = budget > 0;
        const progress = hasBudget ? spent / budget : 0;
        const isOver = hasBudget && spent > budget;
        const hasRollover = cat.rollover && cat.budget > 0 && budget > cat.budget;

        return (
          <View key={cat.id} style={styles.catCard}>
            <View style={styles.catHeader}>
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <View style={{flex: 1}}>
                <Text style={styles.catName}>{cat.name}</Text>
                {hasRollover && (
                  <Text style={styles.rolloverLabel}>
                    +{formatAmount(budget - cat.budget, settings.currency)} rollover
                  </Text>
                )}
              </View>
              <Text style={[styles.catSpent, isOver && {color: colors.danger}]}>
                {formatAmount(spent, settings.currency)}
                {hasBudget && ` / ${formatAmount(budget, settings.currency)}`}
              </Text>
            </View>

            {hasBudget && (
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(progress * 100, 100)}%`,
                      backgroundColor: isOver
                        ? colors.danger
                        : progress > 0.9
                        ? colors.warning
                        : cat.color,
                    },
                  ]}
                />
              </View>
            )}

            {isOver && (
              <Text style={styles.overLabel}>
                {formatAmount(spent - budget, settings.currency)} over
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthLabel: {
    ...typography.subtitle,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  amountBlock: {alignItems: 'center'},
  amountLabel: {...typography.caption, color: colors.textSecondary},
  amountValue: {...typography.subtitle},
  progressTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: {height: '100%', borderRadius: 4},
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic'},
  catCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 4},
  catIcon: {fontSize: 18, marginRight: spacing.xs},
  catName: {...typography.body, color: colors.text},
  rolloverLabel: {...typography.caption, color: colors.success, marginTop: 1},
  catSpent: {...typography.body, color: colors.textSecondary},
  overLabel: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 2,
    textAlign: 'right',
  },
});
