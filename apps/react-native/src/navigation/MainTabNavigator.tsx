import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useTheme} from '../theme';
import {BriefcaseIcon, TableIcon, EnvelopeSimpleIcon, GearSixIcon} from 'phosphor-react-native';
import {DashboardScreen} from '../screens/DashboardScreen';
import {SheetsScreen} from '../screens/SheetsScreen';
import {EmailScanScreen} from '../screens/EmailScanScreen';
import {SettingsScreen} from '../screens/SettingsScreen';

export type MainTabParamList = {
  Dashboard: undefined;
  Sheets: undefined;
  EmailScan: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: theme.headerBg},
        headerTintColor: theme.color,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.tabBarBorder,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
      }}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Jobs',
          tabBarIcon: ({color, size}) => (
            <BriefcaseIcon size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Sheets"
        component={SheetsScreen}
        options={{
          title: 'Sheets',
          tabBarIcon: ({color, size}) => (
            <TableIcon size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="EmailScan"
        component={EmailScanScreen}
        options={{
          title: 'Emails',
          tabBarIcon: ({color, size}) => (
            <EnvelopeSimpleIcon size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({color, size}) => (
            <GearSixIcon size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
