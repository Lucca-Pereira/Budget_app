import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Svg, {G, Circle, Path, Rect, Text as SvgText} from 'react-native-svg';
import {useBudget} from '../context/BudgetContext';
import {colors, spacing, typography} from '../theme';
import {
  expensesForMonth,
  totalByCategory,
  totalSpent,
  formatAmount,
  currentMonth,
  prevMonth,
  nextMonth,
  monthLabel,
} from '../utils/helpers';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing.md * 2;
const PIE_SIZE = 220;
const PIE_R = 80;
const PIE_CX = PIE_SIZE / 2;
const PIE_CY = PIE_SIZE / 2;
const INNER_R = 44; // donut hole

/** Build SVG arc path for a donut slice */
function buildArcPath(
  cx: number,
  cy: number,
  r: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const xi1 = cx + innerR * Math.cos(toRad(endAngle));
  const yi1 = cy + innerR * Math.sin(toRad(endAngle));
  const xi2 = cx + innerR * Math.cos(toRad(startAngle));
  const yi2 = cy + innerR * Math.sin(toRad(startAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
    `L ${xi1} ${yi1}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${xi2} ${yi2}`,
    'Z',
  ].join(' ');
}

export default function ChartsScreen() {
  const {categories, expenses, settings} = useBudget();
  const [monthKey, setMonthKey] = useState(currentMonth());

  const monthExpenses = useMemo(
    () => expensesForMonth(expenses, monthKey),
    [expenses, monthKey],
  );

  const spentByCategory = useMemo(
    () => totalByCategory(monthExpenses),
    [monthExpenses],
  );

  const total = useMemo(() => totalSpent(monthExpenses), [monthExpenses]);

  // Last 6 months bar chart data
  const barData = useMemo(() => {
    const months: string[] = [];
    let m = monthKey;
    for (let i = 0; i < 6; i++) {
      months.unshift(m);
      m = prevMonth(m);
    }
    return months.map(mk => ({
      label: mk.slice(5), // "MM"
      value: totalSpent(expensesForMonth(expenses, mk)),
    }));
  }, [expenses, monthKey]);

  const maxBar = Math.max(...barData.map(d => d.value), 1);
  const BAR_H = 140;
  const BAR_W = Math.floor(CHART_WIDTH / 6) - 8;

  // Donut slices
  const slices = useMemo(() => {
    if (total === 0) return [];
    let angle = -90;
    return categories
      .filter(cat => (spentByCategory[cat.id] || 0) > 0)
      .map(cat => {
        const pct = (spentByCategory[cat.id] || 0) / total;
        const sweep = pct * 360;
        const path = buildArcPath(PIE_CX, PIE_CY, PIE_R, INNER_R, angle, angle + sweep);
        const mid = angle + sweep / 2;
        const labelR = PIE_R + 16;
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const lx = PIE_CX + labelR * Math.cos(toRad(mid));
        const ly = PIE_CY + labelR * Math.sin(toRad(mid));
        const slice = {cat, path, pct, lx, ly};
        angle += sweep;
        return slice;
      });
  }, [categories, spentByCategory, total]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>

      {/* Month navigator */}
      <View style={styles.navigator}>
        <TouchableOpacity
          onPress={() => setMonthKey(prevMonth(monthKey))}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navLabel}>{monthLabel(monthKey)}</Text>
        <TouchableOpacity
          onPress={() => setMonthKey(nextMonth(monthKey))}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Donut chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending by Category</Text>
        {total === 0 ? (
          <Text style={styles.empty}>No data this month.</Text>
        ) : (
          <>
            <View style={styles.pieContainer}>
              <Svg width={PIE_SIZE} height={PIE_SIZE}>
                <G>
                  {slices.map(({cat, path}) => (
                    <Path key={cat.id} d={path} fill={cat.color} />
                  ))}
                  {/* centre label */}
                  <SvgText
                    x={PIE_CX}
                    y={PIE_CY - 6}
                    textAnchor="middle"
                    fill={colors.text}
                    fontSize={12}>
                    Total
                  </SvgText>
                  <SvgText
                    x={PIE_CX}
                    y={PIE_CY + 12}
                    textAnchor="middle"
                    fill={colors.text}
                    fontSize={13}
                    fontWeight="bold">
                    {formatAmount(total, settings.currency)}
                  </SvgText>
                </G>
              </Svg>
            </View>

            {/* Legend */}
            {slices.map(({cat, pct}) => (
              <View key={cat.id} style={styles.legendRow}>
                <View style={[styles.legendDot, {backgroundColor: cat.color}]} />
                <Text style={styles.legendName}>{cat.icon} {cat.name}</Text>
                <Text style={styles.legendPct}>{(pct * 100).toFixed(1)}%</Text>
                <Text style={styles.legendAmt}>
                  {formatAmount(spentByCategory[cat.id] || 0, settings.currency)}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>

      {/* 6-month bar chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Last 6 Months</Text>
        <Svg width={CHART_WIDTH} height={BAR_H + 40}>
          {barData.map((d, i) => {
            const barHeight = (d.value / maxBar) * BAR_H;
            const x = i * (BAR_W + 8) + 4;
            const y = BAR_H - barHeight;
            const isCurrent = d.label === monthKey.slice(5);
            return (
              <G key={d.label}>
                <Rect
                  x={x}
                  y={y}
                  width={BAR_W}
                  height={barHeight}
                  fill={isCurrent ? colors.primary : colors.border}
                  rx={4}
                />
                <SvgText
                  x={x + BAR_W / 2}
                  y={BAR_H + 14}
                  textAnchor="middle"
                  fill={colors.textSecondary}
                  fontSize={10}>
                  {d.label}
                </SvgText>
                {d.value > 0 && (
                  <SvgText
                    x={x + BAR_W / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fill={colors.textSecondary}
                    fontSize={9}>
                    {settings.currency}{Math.round(d.value)}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  navigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navArrow: {fontSize: 28, color: colors.primary},
  navLabel: {...typography.subtitle, color: colors.text},
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  empty: {...typography.body, color: colors.textSecondary, fontStyle: 'italic'},
  pieContainer: {alignItems: 'center', marginVertical: spacing.sm},
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  legendDot: {width: 10, height: 10, borderRadius: 5, marginRight: spacing.xs},
  legendName: {flex: 1, ...typography.body, color: colors.text},
  legendPct: {...typography.caption, color: colors.textSecondary, marginRight: spacing.sm},
  legendAmt: {...typography.body, color: colors.text, fontWeight: '600'},
});
