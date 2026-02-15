import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider } from '@/template';
import { initAdMob } from '@/utils/admob';

export default function RootLayout() {
  useEffect(() => {
    initAdMob();
  }, []);

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
          <Stack.Screen name="tournaments/index" />
          <Stack.Screen name="tournaments/create" />
          <Stack.Screen name="tournaments/[id]" />
        </Stack>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
