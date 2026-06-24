import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/colors';

export default function HomeScreen() {
  const { session } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome back</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <TouchableOpacity style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.executiveNavy,
    marginBottom: 8,
  },
  email: {
    fontSize: 15,
    color: Colors.gray[500],
    marginBottom: 40,
  },
  signOut: {
    borderWidth: 1,
    borderColor: Colors.costcoRed,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  signOutText: {
    color: Colors.costcoRed,
    fontSize: 15,
    fontWeight: '600',
  },
});
