import React, {createContext, useContext} from 'react';
import {useColorScheme} from 'react-native';

const darkTheme = {
  background: '#0f0f23',
  backgroundHover: '#1a1a2e',
  backgroundPress: '#2a2a4a',
  color: '#ffffff',
  borderColor: '#333333',
  placeholderColor: '#666666',
  cardBg: '#1a1a2e',
  primary: '#6366f1',
  primaryLight: '#818cf8',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  textSecondary: '#cccccc',
  textMuted: '#888888',
  textDim: '#666666',
  tabBarBg: '#1a1a2e',
  headerBg: '#1a1a2e',
  tabBarBorder: '#333333',
};

const lightTheme: Theme = {
  background: '#f8f9fa',
  backgroundHover: '#f0f1f3',
  backgroundPress: '#e8e9eb',
  color: '#1a1a2e',
  borderColor: '#e0e0e0',
  placeholderColor: '#999999',
  cardBg: '#ffffff',
  primary: '#6366f1',
  primaryLight: '#818cf8',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  textSecondary: '#555555',
  textMuted: '#777777',
  textDim: '#999999',
  tabBarBg: '#ffffff',
  headerBg: '#ffffff',
  tabBarBorder: '#e0e0e0',
};

export type Theme = typeof darkTheme;
export type ThemeName = 'dark' | 'light';

const ThemeContext = createContext<Theme>(darkTheme);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const systemScheme = useColorScheme();
  const theme = systemScheme === 'light' ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
