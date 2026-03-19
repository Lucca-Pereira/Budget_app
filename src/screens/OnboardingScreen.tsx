import React, {useState} from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert,
} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import {useBudget} from '../context/BudgetContext';
import {colors, spacing, typography} from '../theme';
import {Category} from '../types';
import * as storage from '../utils/storage';

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES: {
  id: string;
  label: string;
  emoji: string;
  description: string;
  categories: Omit<Category, 'id'>[];
}[] = [
  {
    id: 'student',
    label: 'Student',
    emoji: '🎓',
    description: 'Perfect for college & uni life',
    categories: [
      {name: 'Rent', icon: '🏠', color: '#4D96FF', budget: 500, isFixed: true,  rollover: false, weeklyTracking: false, expectedAmount: 0, buffer: 0, subCategories: []},
      {name: 'Groceries', icon: '🛒', color: '#6BCB77', budget: 150, isFixed: false, rollover: false, weeklyTracking: true,  expectedAmount: 0, buffer: 0, subCategories: []},
      {name: 'Fuel', icon: '⛽', color: '#FFA36C', budget: 80,  isFixed: false, rollover: false, weeklyTracking: true,  expectedAmount: 0, buffer: 0, subCategories: []},
      {name: 'Going Out', icon: '🎉', color: '#C77DFF', budget: 100, isFixed: false, rollover: true,  weeklyTracking: true,  expectedAmount: 0, buffer: 0, subCategories: []},
    ],
  },
  {
    id: 'family',
    label: 'Family',
    emoji: '👨‍👩‍👧',
    description: 'Household & family expenses',
    categories: [
      {name: 'Mortgage / Rent', icon: '🏠', color: '#4D96FF', budget: 1200, isFixed: true,  rollover: false, weeklyTracking: false, expectedAmount: 0,   buffer: 0,  subCategories: []},
      {name: 'Groceries',       icon: '🛒', color: '#6BCB77', budget: 400,  isFixed: false, rollover: false, weeklyTracking: true,  expectedAmount: 0,   buffer: 0,  subCategories: []},
      {name: 'Fuel',            icon: '⛽', color: '#FFA36C', budget: 200,  isFixed: false, rollover: false, weeklyTracking: false, expectedAmount: 0,   buffer: 0,  subCategories: []},
      {name: 'Going Out',       icon: '🍽️', color: '#F72585', budget: 200,  isFixed: false, rollover: true,  weeklyTracking: false, expectedAmount: 0,   buffer: 0,  subCategories: []},
    ],
  },
  {
    id: 'blank',
    label: 'Start fresh',
    emoji: '✏️',
    description: 'Build your own from scratch',
    categories: [],
  },
];

// ─── Steps ────────────────────────────────────────────────────────────────────

type Step = 'welcome' | 'template' | 'budget' | 'done';

export default function OnboardingScreen({onFinish}: {onFinish: () => void}) {
  const {addCategory, updateSettings, settings} = useBudget();
  const [step, setStep] = useState<Step>('welcome');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('student');
  const [income, setIncome] = useState('');
  const [currency, setCurrency] = useState('€');

  const handleFinish = async () => {
    const parsedIncome = parseFloat(income);

    // Save settings
    await updateSettings({
      ...settings,
      currency: currency.trim() || '€',
      incomeAmount: isNaN(parsedIncome) ? 0 : parsedIncome,
    });

    // Add template categories
    const template = TEMPLATES.find(t => t.id === selectedTemplate);
    if (template && template.categories.length > 0) {
      for (const cat of template.categories) {
        addCategory({...cat, id: uuidv4()});
      }
    }

    // Mark onboarded
    await storage.setHasOnboarded();
    onFinish();
  };

  // ── Welcome ──
  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.piggy}>🐷</Text>
          <Text style={styles.welcomeTitle}>Welcome to PiggyBudget</Text>
          <Text style={styles.welcomeSub}>Your personal student budget tracker. Let's get you set up in under a minute.</Text>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('template')}>
          <Text style={styles.primaryBtnText}>Get Started →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Template picker ──
  if (step === 'template') {
    return (
      <View style={styles.container}>
        <Text style={styles.stepTitle}>Choose a starting template</Text>
        <Text style={styles.stepSub}>You can edit, add or delete any category later.</Text>
        <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
          {TEMPLATES.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.templateCard, selectedTemplate === t.id && styles.templateCardSelected]}
              onPress={() => setSelectedTemplate(t.id)}>
              <Text style={styles.templateEmoji}>{t.emoji}</Text>
              <View style={{flex: 1}}>
                <Text style={[styles.templateLabel, selectedTemplate === t.id && {color: colors.primary}]}>{t.label}</Text>
                <Text style={styles.templateDesc}>{t.description}</Text>
                {t.categories.length > 0 && (
                  <Text style={styles.templateCats}>
                    {t.categories.map(c => c.icon).join('  ')}
                  </Text>
                )}
              </View>
              {selectedTemplate === t.id && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('budget')}>
          <Text style={styles.primaryBtnText}>Next →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Budget setup ──
  if (step === 'budget') {
    return (
      <View style={styles.container}>
        <Text style={styles.stepTitle}>What's your monthly budget?</Text>
        <Text style={styles.stepSub}>Don't worry, you can change this any time in Settings.</Text>
        <View style={styles.budgetCard}>
          <Text style={styles.label}>Monthly income / allowance</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="e.g. 300"
            placeholderTextColor={colors.textSecondary}
            value={income}
            onChangeText={setIncome}
          />
          <Text style={styles.label}>Currency symbol</Text>
          <TextInput
            style={styles.input}
            placeholder="€"
            placeholderTextColor={colors.textSecondary}
            value={currency}
            onChangeText={setCurrency}
            maxLength={4}
          />
          <Text style={styles.hintText}>This is used to show how much you have remaining each month.</Text>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleFinish}>
          <Text style={styles.primaryBtnText}>Start Budgeting 🐷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background, padding: spacing.md, paddingBottom: 32},
  centeredContent: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  piggy: {fontSize: 80, marginBottom: spacing.lg},
  welcomeTitle: {fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: spacing.sm},
  welcomeSub: {...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, paddingHorizontal: spacing.md},
  stepTitle: {fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs},
  stepSub: {...typography.body, color: colors.textSecondary, marginBottom: spacing.md},
  templateCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 2, borderColor: colors.border,
  },
  templateCardSelected: {borderColor: colors.primary, backgroundColor: colors.primary + '11'},
  templateEmoji: {fontSize: 32, marginRight: spacing.md},
  templateLabel: {...typography.subtitle, color: colors.text, fontWeight: '700'},
  templateDesc: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  templateCats: {fontSize: 16, marginTop: 6, letterSpacing: 2},
  checkmark: {fontSize: 20, color: colors.primary, fontWeight: '700'},
  budgetCard: {backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md},
  label: {...typography.caption, color: colors.textSecondary, marginBottom: 4, marginTop: spacing.sm},
  input: {backgroundColor: colors.background, borderRadius: 10, padding: spacing.sm, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border},
  hintText: {...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic'},
  primaryBtn: {backgroundColor: colors.primary, borderRadius: 14, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm},
  primaryBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  skipBtn: {alignItems: 'center', padding: spacing.sm, marginTop: spacing.xs},
  skipBtnText: {...typography.body, color: colors.textSecondary},
});
