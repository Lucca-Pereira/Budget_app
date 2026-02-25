import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {BudgetProvider} from './context/BudgetContext';
import DashboardScreen from './screens/DashboardScreen';
import AddExpenseScreen from './screens/AddExpenseScreen';
import HistoryScreen from './screens/HistoryScreen';
import ChartsScreen from './screens/ChartsScreen';
import SettingsScreen from './screens/SettingsScreen';
import {colors} from './theme';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <BudgetProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerStyle: {backgroundColor: colors.surface},
              headerTintColor: colors.text,
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
              },
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.textSecondary,
              tabBarShowLabel: true,
            }}>
            <Tab.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{title: 'Home', tabBarLabel: '🏠 Home', tabBarIcon: () => null}}
            />
            <Tab.Screen
              name="Add"
              component={AddExpenseScreen}
              options={{title: 'Add Expense', tabBarLabel: '➕ Add', tabBarIcon: () => null}}
            />
            <Tab.Screen
              name="History"
              component={HistoryScreen}
              options={{title: 'History', tabBarLabel: '📋 History', tabBarIcon: () => null}}
            />
            <Tab.Screen
              name="Charts"
              component={ChartsScreen}
              options={{title: 'Charts', tabBarLabel: '📊 Charts', tabBarIcon: () => null}}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{title: 'Settings', tabBarLabel: '⚙️ Settings', tabBarIcon: () => null}}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </BudgetProvider>
    </SafeAreaProvider>
  );
}
