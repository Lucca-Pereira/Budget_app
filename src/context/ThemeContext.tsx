import React, {createContext, useContext, useEffect, useState} from 'react';
import {useColorScheme} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {PALETTES, PaletteKey, spacing, typography} from '../theme';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextType = {
  colors: typeof PALETTES.blue.dark;
  spacing: typeof spacing;
  typography: typeof typography;
  themeMode: ThemeMode;
  paletteKey: PaletteKey;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setPaletteKey: (key: PaletteKey) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  colors: PALETTES.blue.dark,
  spacing,
  typography,
  themeMode: 'system',
  paletteKey: 'blue',
  isDark: true,
  setThemeMode: () => {},
  setPaletteKey: () => {},
});

const STORAGE_KEY_MODE    = 'APP_THEME_MODE';
const STORAGE_KEY_PALETTE = 'APP_PALETTE_KEY';

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [paletteKey, setPaletteKeyState] = useState<PaletteKey>('blue');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_MODE),
      AsyncStorage.getItem(STORAGE_KEY_PALETTE),
    ]).then(([savedMode, savedPalette]) => {
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
        setThemeModeState(savedMode);
      }
      if (savedPalette && savedPalette in PALETTES) {
        setPaletteKeyState(savedPalette as PaletteKey);
      }
    });
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY_MODE, mode);
  };

  const setPaletteKey = (key: PaletteKey) => {
    setPaletteKeyState(key);
    AsyncStorage.setItem(STORAGE_KEY_PALETTE, key);
  };

  const isDark =
    themeMode === 'dark'  ? true  :
    themeMode === 'light' ? false :
    systemScheme === 'dark';

  const colors = isDark ? PALETTES[paletteKey].dark : PALETTES[paletteKey].light;

  return (
    <ThemeContext.Provider value={{colors, spacing, typography, themeMode, paletteKey, isDark, setThemeMode, setPaletteKey}}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
