import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme, spacing, radius, typography } from './colors';

const ThemeContext = createContext();

const THEME_STORAGE_KEY = '@hiveai_theme_mode';

export function ThemeProvider({ children }) {
  const systemScheme = Appearance.getColorScheme();
  const [mode, setMode] = useState(systemScheme === 'light' ? 'light' : 'dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
          setMode(saved);
        }
      } catch (e) {
        // ignore, fall back to system scheme
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const toggleTheme = useCallback(async () => {
    setMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {
        // ignore persistence errors
      });
      return next;
    });
  }, []);

  const setTheme = useCallback(async (nextMode) => {
    setMode(nextMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch (e) {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      colors: mode === 'dark' ? darkTheme : lightTheme,
      spacing,
      radius,
      typography,
      toggleTheme,
      setTheme,
      ready,
    }),
    [mode, ready, toggleTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
