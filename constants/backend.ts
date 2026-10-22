import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveBackendUrl } from '../utils/backend-url';

export function getBackendUrl(): string | null {
  return resolveBackendUrl({
    configuredUrl: process.env.EXPO_PUBLIC_BACKEND_URL,
    hostUri: Constants.expoConfig?.hostUri,
    platform: Platform.OS,
    isDevelopment: __DEV__,
  });
}
