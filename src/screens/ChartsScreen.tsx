import React, {useMemo, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions} from 'react-native';
import {BarChart, PieChart} from 'react-native-gifted-charts';
import {useBudget} from '../context/BudgetContext';
import {useTheme} from '../context/ThemeContext';
import {spacing, typography} from '../theme';
import {expensesForMonth, totalByCategory, totalSpent, formatAmount, currentMonth, prevMonth, nextMonth, monthLabel} from '../utils/helpers';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing.md * 4;

export default function ChartsScreen() {
  const {colors} = useTheme();
  const s = makeStyles(colors);
  const {categories, expenses, settings} = useBudget();
  const [monthKey, setMonthKey] = useState(currentMonth());

  const monthExpenses = useMemo(() => expensesForMonth(expenses, monthKey), [expenses, monthKey]);
  const spentByCategory = useMemo(() => totalByCategory(monthExpenses), [monthExpenses]);
  const total = useMemo(() => totalSpent(monthExpenses), [monthExpenses]);

  const pieData = useMemo(() => {
    return categories
      .filter(cat => (spentByCategory[cat.id] || 0) > 0)
      .map(cat => ({
        value: spentByCategory[cat.id] || 0,
        color: cat.color,
        text: cat.icon,
        label: cat.name,
      }));
  }, [categories, spentByCategory]);

  const barData = useMemo(() => {
    const months: string[] = [];
    let m = monthKey;
    for (let i = 0; i < 6; i++) {
      months.unshift(m);
      m = prevMonth(m);
    }
    return months.map(mk => ({
      value: totalSpent(expensesForMonth(expenses, mk)),
      label: mk.slice(5),
      frontColor: mk === monthKey ? colors.primary : colors.border,
      topLabelComponent: () => null,
    }));
  }, [expenses, monthKey, colors]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.navigator}>
        <TouchableOpacity onPress={() => setMonthKey(prevMonth(monthKey))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Text style={s.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.navLabel}>{monthLabel(monthKey)}</Text>
        <TouchableOpacity onPress={() => setMonthKey(nextMonth(monthKey))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Text style={s.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Spending by Category</Text>
        {total === 0 ? (
          <Text style={s.empty}>No data this month.</Text>
        ) : (
          <>
            <View style={s.pieContainer}>
              <PieChart
                data={pieData}
                donut
                radius={100}
                innerRadius={60}
                centerLabelComponent={() => (
                  <View style={s.centerLabel}>
                    <Text style={s.centerLabelSub}>Total</Text>
                    <Text style={s.centerLabelMain}>{formatAmount(total, settings.currency)}</Text>
                  </View>
                )}
                strokeWidth={2}
                strokeColor={colors.background}
              />
            </View>
            {pieData.map((item, i) => {
              const pct = ((item.value / total) * 100).toFixed(1);
              return (
                <View key={i} style={s.legendRow}>
                  <View style={[s.legendDot, {backgroundColor: item.color}]} />
                  <Text style={s.legendName}>{item.text} {item.label}</Text>
                  <Text style={s.legendPct}>{pct}%</Text>
                  <Text style={s.legendAmt}>{formatAmount(item.value, settings.currency)}</Text>
                </View>
              );
            })}
          </>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Last 6 Months</Text>
        <BarChart
          data={barData}
          width={CHART_WIDTH}
          height={180}
          barWidth={32}
          spacing={12}
          roundedTop
          roundedBottom
          hideRules
          xAxisThickness={0}
          yAxisThickness={0}
          yAxisTextStyle={{color: colors.textSecondary, fontSize: 10}}
          xAxisLabelTextStyle={{color: colors.textSecondary, fontSize: 11}}
          noOfSections={4}
          maxValue={Math.max(...barData.map(d => d.value), 1) * 1.2}
          isAnimated
          animationDuration={600}
          barBorderRadius={6}
          backgroundColor={colors.surface}
          labelWidth={30}
        />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.md, paddingBottom: 100},
    navigator: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md},
    navArrow: {fontSize: 28, color: colors.primary},
    navLabel: {...typography.subtitle, color: colors.text},
    card: {backgroundColor: colors.surface, borderRadius: 16, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden'},
    cardTitle: {...typography.subtitle, color: colors.text, marginBottom: spacing.sm},
    empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic'},
    pieContainer: {alignItems: 'center', marginVertical: spacing.sm},
    centerLabel: {alignItems: 'center'},
    centerLabelSub: {fontSize: 12, color: colors.textSecondary},
    centerLabelMain: {fontSize: 14, fontWeight: '700', color: colors.text},
    legendRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs},
    legendDot: {width: 10, height: 10, borderRadius: 5, marginRight: spacing.xs},
    legendName: {flex: 1, ...typography.body, color: colors.text},
    legendPct: {...typography.caption, color: colors.textSecondary, marginRight: spacing.sm},
    legendAmt: {...typography.body, color: colors.text, fontWeight: '600'},
  });
