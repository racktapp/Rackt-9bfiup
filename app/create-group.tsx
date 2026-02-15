import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { Input, Button, Avatar, LoadingSpinner } from '@/components';
import { Sport } from '@/constants/config';
import { useGroups } from '@/hooks/useGroups';
import { useFriends } from '@/hooks/useFriends';
import { Friendship } from '@/types';
import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { createGroup } = useGroups();
  const { getFriends } = useFriends();

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sportFocus, setSportFocus] = useState<Sport | 'mixed'>('mixed');
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUserId();
  }, []);

  useEffect(() => {
    if (userId) {
      loadFriends();
    }
  }, [userId]);

  const loadUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const loadFriends = async () => {
    if (!userId) return;
    try {
      const data = await getFriends(userId);
      setFriends(data);
    } catch (err) {
      console.error('Error loading friends:', err);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  const toggleFriend = (friendId: string) => {
    if (selectedFriends.includes(friendId)) {
      setSelectedFriends(selectedFriends.filter(id => id !== friendId));
    } else {
      setSelectedFriends([...selectedFriends, friendId]);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    if (!userId) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await createGroup({
        name: name.trim(),
        sportFocus,
        ownerId: userId,
        invitedFriendIds: selectedFriends,
      });

      if (!result?.group?.id) {
        throw new Error('No group ID returned - creation may have failed');
      }

      // Navigate to the new group
      router.replace(`/group/${result.group.id}`);
    } catch (err: any) {
      console.error('Create group error:', err);
      setError(err.message || 'Failed to create group. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/dashboard')}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.headerLogo}
            contentFit="contain"
            transition={200}
          />
        </Pressable>
        <Pressable onPress={() => router.push('/settings')}>
          <MaterialIcons name="settings" size={24} color={Colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Input
          label="Group Name"
          value={name}
          onChangeText={setName}
          placeholder="Tennis Club"
        />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sport Focus</Text>
          <View style={styles.optionsRow}>
            <Pressable
              style={[styles.chip, sportFocus === 'tennis' && styles.chipSelected]}
              onPress={() => setSportFocus('tennis')}
            >
              <Text style={[styles.chipText, sportFocus === 'tennis' && styles.chipTextSelected]}>
                Tennis
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, sportFocus === 'padel' && styles.chipSelected]}
              onPress={() => setSportFocus('padel')}
            >
              <Text style={[styles.chipText, sportFocus === 'padel' && styles.chipTextSelected]}>
                Padel
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, sportFocus === 'mixed' && styles.chipSelected]}
              onPress={() => setSportFocus('mixed')}
            >
              <Text style={[styles.chipText, sportFocus === 'mixed' && styles.chipTextSelected]}>
                Mixed
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Invite Friends (Optional)</Text>
          {isLoadingFriends ? (
            <Text style={styles.helperText}>Loading friends...</Text>
          ) : friends.length === 0 ? (
            <Text style={styles.helperText}>Add friends first to invite them</Text>
          ) : (
            <View style={styles.friendsList}>
              {friends.map(friendship => {
                const friendId = friendship.friend?.id || '';
                const isSelected = selectedFriends.includes(friendId);

                return (
                  <Pressable
                    key={friendship.id}
                    style={[styles.friendCard, isSelected && styles.friendCardSelected]}
                    onPress={() => toggleFriend(friendId)}
                  >
                    <Avatar
                      imageUrl={friendship.friend?.avatarUrl}
                      initials={friendship.friend?.initials}
                      size="sm"
                    />
                    <Text style={styles.friendName}>
                      {friendship.friend?.displayName}
                    </Text>
                    {isSelected && (
                      <MaterialIcons name="check-circle" size={20} color={Colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Button
          title="Create Group"
          onPress={handleSubmit}
          fullWidth
          disabled={submitting}
          icon={submitting ? <LoadingSpinner size={20} /> : undefined}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLogo: {
    width: 32,
    height: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
  },
  chipTextSelected: {
    fontWeight: Typography.weights.semibold,
  },
  helperText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  friendsList: {
    gap: Spacing.sm,
  },
  friendCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  friendCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceElevated,
  },

  friendName: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
  },
  errorText: {
    color: Colors.danger,
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
});
