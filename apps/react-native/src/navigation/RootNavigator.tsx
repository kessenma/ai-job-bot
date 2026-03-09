import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {MainTabNavigator} from './MainTabNavigator';
import {SetupWizardScreen} from '../screens/SetupWizardScreen';
import {getConfigStatus} from '../api/config';

export type RootStackParamList = {
  SetupWizard: undefined;
  Main: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    checkSetup();
  }, []);

  async function checkSetup() {
    try {
      const status = await getConfigStatus();
      setIsSetupComplete(status.googleConfigured);
    } catch {
      // Server not running yet - show setup
      setIsSetupComplete(false);
    }
  }

  if (isSetupComplete === null) {
    return null; // Loading
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {!isSetupComplete ? (
          <Stack.Screen name="SetupWizard" component={SetupWizardScreen} />
        ) : null}
        <Stack.Screen name="Main" component={MainTabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
