import type { ReactElement } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../contexts/ThemeContext';

/**
 * Renders inside the real ThemeProvider. The provider renders nothing until
 * it has read the saved theme from AsyncStorage, so this waits for the first
 * real paint before returning.
 */
export async function renderWithProviders(
  ui: ReactElement,
  { theme }: { theme?: 'light' | 'dark' } = {},
) {
  if (theme) await AsyncStorage.setItem('theme_mode', theme);
  const result = render(<ThemeProvider>{ui}</ThemeProvider>);
  await waitFor(() => expect(screen.toJSON()).not.toBeNull());
  return result;
}

/** Resolve pending promises (supabase mock calls, effects) inside act. */
export const flush = () => new Promise((r) => setTimeout(r, 0));
