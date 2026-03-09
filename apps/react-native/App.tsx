import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from './src/theme';
import {RootNavigator} from './src/navigation/RootNavigator';

function App() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <StatusBar
          barStyle={colorScheme === 'light' ? 'dark-content' : 'light-content'}
        />
        <RootNavigator />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default App;
