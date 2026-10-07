import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../contexts/ThemeContext';
import { fontSize, letterSpacing } from '../../constants/theme';
import { ScanFAB } from '../../components/ScanFAB';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(filled: IoniconsName, outline: IoniconsName) {
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={24} color={color} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const Colors = useThemeColors();
  // The tab bar sits at the very bottom of the screen, so on any device with
  // a home indicator (or software nav bar on Android) it has to reserve that
  // space itself — otherwise the system gesture bar draws straight over the
  // Home/Stats/Profile labels. Previously height/paddingBottom were fixed at
  // 60/8, which only looked right on devices with no inset.
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.costcoRed,
          tabBarInactiveTintColor: Colors.gray[400],
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            elevation: 8,
            shadowColor: Colors.gray[900],
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            height: 60 + insets.bottom,
            paddingBottom: 8 + insets.bottom,
          },
          tabBarLabelStyle: {
            fontSize: fontSize.xs,
            fontWeight: '600',
            letterSpacing: letterSpacing.wide,
          },
          tabBarItemStyle: {
            paddingTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: tabIcon('home', 'home-outline'),
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Stats',
            tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline'),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: tabIcon('person', 'person-outline'),
          }}
        />
      </Tabs>

      {/* Floats above all tabs — mounted once, never remounts on tab switch */}
      <ScanFAB />
    </View>
  );
}
