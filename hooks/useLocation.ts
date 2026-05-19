import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export interface LocationData {
  geoLocation: { latitude: number; longitude: number };
  location: string;
}

/**
 * Requests foreground location permission on mount (native only) and exposes
 * getLocation(), which captures the current position + reverse-geocodes it.
 * Uses a dynamic import so expo-location is never loaded during expo-router's
 * static web rendering pass, which runs in Node.js without native modules.
 */
export function useLocation() {
  const permissionGranted = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    import('expo-location').then(({ requestForegroundPermissionsAsync }) => {
      requestForegroundPermissionsAsync().then(({ status }) => {
        permissionGranted.current = status === 'granted';
      });
    });
  }, []);

  const getLocation = async (): Promise<LocationData | null> => {
    if (Platform.OS === 'web') return null;

    const Location = await import('expo-location');

    if (!permissionGranted.current) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      permissionGranted.current = true;
    }

    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = pos.coords;
      let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) {
          const parts = [
            geo.streetNumber,
            geo.street,
            geo.city,
            geo.region,
            geo.country,
          ].filter(Boolean);
          if (parts.length > 0) address = parts.join(', ');
        }
      } catch {
        // Reverse-geocode failure is non-fatal; coordinate string is the fallback
      }

      return {
        geoLocation: { latitude, longitude },
        location: address,
      };
    } catch {
      return null;
    }
  };

  return { getLocation };
}
