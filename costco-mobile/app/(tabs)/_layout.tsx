import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../contexts/ThemeContext';
import { fontSize, letterSpacing } from '../../constants/theme';
import { ScanFAB } from '../../components/ScanFAB';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(filled: IoniconsName, outline: IoniconsName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={24} color={color} />
  );
}

export default function TabsLayout() {
  const Colors = useThemeColors();
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
            height: 60,
            paddingBottom: 8,
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
