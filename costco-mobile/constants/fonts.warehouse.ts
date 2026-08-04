import { useFonts } from 'expo-font';
import { Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

// ── Font loader for the "Warehouse Red & Cream" design system ────────────────
// Call once near the app root (e.g. in the root layout) and gate rendering on
// `fontsLoaded` before rendering any screen that uses fontFamily from
// ./theme.warehouse. Not wired into app/_layout.tsx yet — opt in explicitly.
export function useWarehouseFonts() {
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  return fontsLoaded;
}
