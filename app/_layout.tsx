import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider } from '@/template';

export default function RootLayout() {
  return (
    <AlertProvider>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/email" />
          <Stack.Screen name="auth/verify" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="create-group" />
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="match/[id]" />
          <Stack.Screen name="profile/[userId]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="settings/edit-level" />
          <Stack.Screen name="settings/edit-profile" />
          <Stack.Screen name="settings/notifications" />
          <Stack.Screen name="settings/privacy" />
          <Stack.Screen name="settings/blocked-users" />
          <Stack.Screen name="settings/how-ratings-work" />
          <Stack.Screen name="settings/appearance" />
        </Stack>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
