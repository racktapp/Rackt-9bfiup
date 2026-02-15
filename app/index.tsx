import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getSupabaseClient } from '@/template';
import { Colors } from '@/constants/theme';

const supabase = getSupabaseClient();

export default function IndexScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuthAndOnboarding();
  }, []);

  const checkAuthAndOnboarding = async () => {
    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // Not authenticated -> go to auth
        router.replace('/auth/email');
        return;
      }

      // User is authenticated, check if profile exists
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .single();

      if (error || !profile?.username) {
        // Profile incomplete -> continue onboarding
        router.replace('/onboarding');
        return;
      }

      // Check if user has completed sport selection (has ratings)
      const { data: ratings } = await supabase
        .from('user_ratings')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (!ratings || ratings.length === 0) {
        // No sports/ratings set -> continue onboarding
        router.replace('/onboarding');
        return;
      }

      // Everything complete -> go to dashboard
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      console.error('Auth check error:', error);
      router.replace('/auth/email');
    } finally {
      setChecking(false);
    }
  };

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
