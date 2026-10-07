// expo-router stand-in: screens are rendered on their own (no navigator), so
// navigation calls are recorded on `router` and params/segments are set per
// test with setParams / setSegments.

import { useEffect, type ReactNode } from 'react';
import { Pressable } from 'react-native';

export const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => true),
};

let params: Record<string, string> = {};
let segments: string[] = [];

export const setParams = (p: Record<string, string>) => {
  params = p;
};
export const setSegments = (s: string[]) => {
  segments = s;
};
export function resetRouterMock() {
  params = {};
  segments = [];
  router.canGoBack.mockImplementation(() => true);
}

function Navigator({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
Navigator.Screen = function Screen() {
  return null;
};

export const expoRouterMock = {
  router,
  useRouter: () => router,
  useLocalSearchParams: () => params,
  useGlobalSearchParams: () => params,
  useSegments: () => segments,
  usePathname: () => '/' + segments.join('/'),
  // The screen is always focused here, so this behaves like the real hook:
  // runs on mount and again whenever the (useCallback-wrapped) effect changes.
  useFocusEffect: (effect: () => void | (() => void)) => {
    useEffect(() => effect(), [effect]);
  },
  Link: ({ children, href, asChild: _asChild, ...rest }: any) => (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} {...rest}>
      {children}
    </Pressable>
  ),
  Redirect: ({ href }: { href: string }) => {
    router.replace(href);
    return null;
  },
  Stack: Navigator,
  Tabs: Navigator,
  Slot: Navigator,
  SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() },
};
