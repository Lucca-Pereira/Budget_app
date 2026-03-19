/**
 * App.tsx
 *
 * Root of the app. Responsibilities:
 *  - Shows a loading spinner while checking onboarding status
 *  - Routes to OnboardingScreen on first launch, AppNavigator otherwise
 *  - AppNavigator wraps the stack with a shared header and hamburger nav menu
 *  - ThemeProvider and BudgetProvider wrap everything for global access
 */
import React, {useState, useRef, useEffect} from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
  StackActions,
} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import {BudgetProvider} from './context/BudgetContext';
import {ThemeProvider, useTheme} from './context/ThemeContext';
import {MenuContext} from './context/MenuContext';
import DashboardScreen from './screens/DashboardScreen';
import AddExpenseScreen from './screens/AddExpenseScreen';
import HistoryScreen from './screens/HistoryScreen';
import ChartsScreen from './screens/ChartsScreen';
import SettingsScreen from './screens/SettingsScreen';
import SubscriptionsScreen from './screens/SubscriptionsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ReceiptScannerScreen from './screens/ReceiptScannerScreen';
import IncomeScreen from './screens/IncomeScreen';
import {getHasOnboarded} from './utils/storage';
import {colors as staticColors} from './theme';

const Stack = createStackNavigator();

const SCREEN_TITLES: Record<string, string> = {
  Add: 'Add Expense',
  History: 'History',
  Charts: 'Charts',
  Subscriptions: 'Subscriptions',
  Settings: 'Settings',
  ReceiptScanner: 'Scan Receipt',
  Income: 'Income',
};

// ReceiptScanner is intentionally omitted — accessed via the + FAB on Dashboard
// Subscriptions and Income are accessible from the Settings screen.
const SCREENS = [
  {name: 'Dashboard', label: '🏠 Home'},
  {name: 'History', label: '📋 History'},
  {name: 'Charts', label: '📊 Charts'},
  {name: 'Settings', label: '⚙️ Settings'},
];

function NavModal({visible, onClose, onNavigate, current}: {
  visible: boolean; onClose: () => void; onNavigate: (name: string) => void; current: string;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.menu, {top: 60 + insets.top, backgroundColor: colors.surface}]}>
          {SCREENS.map(s => (
            <TouchableOpacity
              key={s.name}
              style={[styles.menuItem, current === s.name && {backgroundColor: colors.primary + '22'}]}
              onPress={() => onNavigate(s.name)}>
              <Text style={[styles.menuItemText, {color: colors.text}, current === s.name && {color: colors.primary, fontWeight: '700'}]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function AppNavigator() {
  const {colors} = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('Dashboard');
  const navRef = useRef<NavigationContainerRef<any>>(null);

  const navigate = (name: string) => {
    setMenuVisible(false);
    setCurrentScreen(name);
    navRef.current?.navigate(name as never);
  };

  useEffect(() => {
    const onBackPress = () => {
      const current = navRef.current?.getCurrentRoute()?.name;
      if (current && current !== 'Dashboard') {
        navRef.current?.dispatch(StackActions.popToTop());
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  return (
    <MenuContext.Provider value={{openMenu: () => setMenuVisible(true)}}>
    <NavigationContainer
      ref={navRef}
      onStateChange={() => {
        const name = navRef.current?.getCurrentRoute()?.name;
        if (name) setCurrentScreen(name);
      }}>
      <NavModal visible={menuVisible} onClose={() => setMenuVisible(false)} onNavigate={navigate} current={currentScreen} />
      <Stack.Navigator
        screenOptions={({route}) => ({
          headerStyle: {backgroundColor: colors.surface},
          headerTintColor: colors.text,
          headerTitleStyle: {fontWeight: '700'},
          headerTitle: SCREEN_TITLES[route.name] !== undefined ? () => null : undefined,
          headerLeft: ({canGoBack}) =>
            canGoBack ? (
              <TouchableOpacity
                onPress={() => navRef.current?.dispatch(StackActions.popToTop())}
                style={styles.backBtn}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Text style={[styles.backArrow, {color: colors.primary}]}>‹</Text>
                <Text style={[styles.backLabel, {color: colors.primary}]}>
                  {SCREEN_TITLES[route.name] ?? route.name}
                </Text>
              </TouchableOpacity>
            ) : null,
          headerRight: () => (
            <TouchableOpacity onPress={() => setMenuVisible(v => !v)} style={styles.menuBtn}>
              <Text style={[styles.menuIcon, {color: colors.text}]}>☰</Text>
            </TouchableOpacity>
          ),
        })}>
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{title: 'Home'}} />
        <Stack.Screen name="Add" component={AddExpenseScreen} options={{title: 'Add Expense'}} />
        <Stack.Screen name="History" component={HistoryScreen} options={{title: 'History'}} />
        <Stack.Screen name="Charts" component={ChartsScreen} options={{title: 'Charts'}} />
        <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{title: 'Subscriptions'}} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{title: 'Settings'}} />
        <Stack.Screen name="ReceiptScanner" component={ReceiptScannerScreen} options={{title: 'Scan Receipt'}} />
        <Stack.Screen name="Income" component={IncomeScreen} options={{title: 'Income & Received'}} />
      </Stack.Navigator>
    </NavigationContainer>
    </MenuContext.Provider>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    getHasOnboarded().then(v => {
      setOnboarded(v);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: staticColors.background}}>
        <ActivityIndicator size="large" color={staticColors.primary} />
      </View>
    );
  }

  if (!onboarded) {
    return (
      <BudgetProvider>
        <OnboardingScreen onFinish={() => setOnboarded(true)} />
      </BudgetProvider>
    );
  }

  return (
    <BudgetProvider>
      <AppNavigator />
    </BudgetProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  menuBtn: {marginRight: 16, padding: 4},
  menuIcon: {fontSize: 24},
  backBtn: {marginLeft: 8, padding: 6, flexDirection: 'row', alignItems: 'center'},
  backArrow: {fontSize: 40, lineHeight: 44},
  backLabel: {fontSize: 17, fontWeight: '600', marginLeft: 2},
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)'},
  menu: {
    position: 'absolute', right: 12, borderRadius: 12, paddingVertical: 8,
    minWidth: 200, elevation: 8, shadowColor: '#000',
    shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8,
  },
  menuItem: {paddingVertical: 14, paddingHorizontal: 20},
  menuItemText: {fontSize: 16, fontWeight: '500'},
});
