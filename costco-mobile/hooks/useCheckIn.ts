import { useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { posthog } from '../lib/posthog';
import type { CheckInResult, TooFarInfo } from '../components/CheckInModals';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

// Shared GPS check-in flow — used by both the Home tab's quick action and the
// unified Scan screen's Check-in mode, so the two never drift out of sync.
export function useCheckIn() {
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [tooFarInfo, setTooFarInfo] = useState<TooFarInfo | null>(null);

  async function runCheckIn() {
    setCheckingIn(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        posthog?.capture('warehouse_check_in_failed', { reason: 'permission_denied' });
        Alert.alert(
          'Location Required',
          'Enable location access in Settings to check in at a Costco warehouse.',
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
      });

      const json = (await res.json()) as CheckInResult & {
        error?: string;
        distance_metres?: number;
        nearest_warehouse?: { name: string };
      };

      if (!res.ok) {
        if (json.error === 'too_far') {
          const distM = json.distance_metres;
          const wh = json.nearest_warehouse?.name ?? 'the nearest Costco';
          posthog?.capture('warehouse_check_in_failed', {
            reason: 'too_far',
            distance_metres: distM ?? null,
          });
          setTooFarInfo({
            miles: distM != null ? (distM / 1609.34).toFixed(1) : '?',
            warehouse: wh,
          });
        } else {
          posthog?.capture('warehouse_check_in_failed', {
            reason: 'api_error',
            error: json.error ?? null,
          });
          Alert.alert('Check-In Failed', json.error ?? 'Please try again.');
        }
        return;
      }

      if (!json.already_checked_in) {
        posthog?.capture('warehouse_check_in_completed', {
          warehouse_tier: json.warehouse.tier,
          tier_upgraded: json.tier_upgraded,
          badges_earned_count: json.new_badges?.length ?? 0,
        });
      }
      setCheckInResult(json);
    } catch (e) {
      posthog?.capture('warehouse_check_in_failed', {
        reason: 'location_unavailable',
        error: e instanceof Error ? e.message : String(e),
      });
      Alert.alert('Check-In Failed', 'Could not get your location. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  }

  return {
    checkingIn,
    checkInResult,
    tooFarInfo,
    runCheckIn,
    clearCheckInResult: () => setCheckInResult(null),
    clearTooFarInfo: () => setTooFarInfo(null),
  };
}
