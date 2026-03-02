import React, {useState, useRef, useEffect} from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
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
import DashboardScreen from './screens/DashboardScreen';
import AddExpenseScreen from './screens/AddExpenseScreen';
import HistoryScreen from './screens/HistoryScreen';
import ChartsScreen from './screens/ChartsScreen';
import SettingsScreen from './screens/SettingsScreen';
import SubscriptionsScreen from './screens/SubscriptionsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import {getHasOnboarded} from './utils/storage';
import {colors as staticColors} from './theme';

const Stack = createStackNavigator();

const SCREENS = [
  {name: 'Dashboard', label: '🏠 Home'},
  {name: 'History', label: '📋 History'},
  {name: 'Charts', label: '📊 Charts'},
  {name: 'Subscriptions', label: '💳 Subscriptions'},
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
        navRef.current?.navigate('Dashboard' as never);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer
      ref={navRef}
      onStateChange={() => {
        const name = navRef.current?.getCurrentRoute()?.name;
        if (name) setCurrentScreen(name);
      }}>
      <NavModal visible={menuVisible} onClose={() => setMenuVisible(false)} onNavigate={navigate} current={currentScreen} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: {backgroundColor: colors.surface},
          headerTintColor: colors.text,
          headerTitleStyle: {fontWeight: '700'},
          headerLeft: ({canGoBack}) =>
            canGoBack ? (
              <TouchableOpacity onPress={() => navRef.current?.navigate('Dashboard' as never)} style={styles.backBtn}>
                <Text style={[styles.backArrow, {color: colors.primary}]}>‹</Text>
              </TouchableOpacity>
            ) : null,
          headerRight: () => (
            <TouchableOpacity onPress={() => setMenuVisible(v => !v)} style={styles.menuBtn}>
              <Text style={[styles.menuIcon, {color: colors.text}]}>☰</Text>
            </TouchableOpacity>
          ),
        }}>
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{title: 'Home', headerLeft: () => null}} />
        <Stack.Screen name="Add" component={AddExpenseScreen} options={{title: 'Add Expense'}} />
        <Stack.Screen name="History" component={HistoryScreen} options={{title: 'History'}} />
        <Stack.Screen name="Charts" component={ChartsScreen} options={{title: 'Charts'}} />
        <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{title: 'Subscriptions'}} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{title: 'Settings'}} />
      </Stack.Navigator>
    </NavigationContainer>
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
    <ThemeProvider>
      <BudgetProvider>
        <AppNavigator />
      </BudgetProvider>
    </ThemeProvider>
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
  backBtn: {marginLeft: 8, padding: 4},
  backArrow: {fontSize: 40, lineHeight: 44},
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)'},
  menu: {
    position: 'absolute', right: 12, borderRadius: 12, paddingVertical: 8,
    minWidth: 200, elevation: 8, shadowColor: '#000',
    shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8,
  },
  menuItem: {paddingVertical: 14, paddingHorizontal: 20},
  menuItemText: {fontSize: 16, fontWeight: '500'},
});
