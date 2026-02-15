import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { Button } from '@/components';
import { useGroups } from '@/hooks/useGroups';
import { useMatches } from '@/hooks/useMatches';
import { Group, GroupMember, Match } from '@/types';
import { Sport } from '@/constants/config';
import { getSupabaseClient } from '@/template';
import { matchesService } from '@/services/matches';

const supabase = getSupabaseClient();

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showAlert } = useAlert();
  const { getGroupById, getGroupMembers, addMember } = useGroups();
  const { getGroupMatches } = useMatches();

  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'monthly' | 'alltime'>('monthly');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport>('tennis');

  useEffect(() => {
    loadUserId();
  }, []);

  useEffect(() => {
    if (userId && id) {
      loadGroupData();
    }
  }, [userId, id]);

  useEffect(() => {
    if (id) {
      loadLeaderboard();
    }
  }, [id, selectedSport, leaderboardPeriod]);

  const loadUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const loadGroupData = async () => {
    if (!id) return;

    const groupData = await getGroupById(id);
    setGroup(groupData);

    const membersData = await getGroupMembers(id);
    setMembers(membersData);

    const matchesData = await getGroupMatches(id, 5);
    setMatches(matchesData);
  };

  const loadLeaderboard = async () => {
    if (!id) return;
    try {
      const data = await matchesService.getLeaderboard(id, selectedSport, leaderboardPeriod);
      setLeaderboard(data.slice(0, 5)); // Top 5
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    }
  };

  if (!userId || !id) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!group) {
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
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>❌</Text>
          <Text style={styles.emptyTitle}>Group Not Found</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const isOwner = group.ownerId === userId;

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
        <Text style={styles.headerTitle}>{group.name}</Text>
        <Pressable onPress={() => router.push('/settings')}>
          <MaterialIcons name="settings" size={24} color={Colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Group Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Sport Focus</Text>
          <Text style={styles.infoValue}>
            {group.sportFocus.charAt(0).toUpperCase() + group.sportFocus.slice(1)}
          </Text>
          <Text style={styles.infoLabel}>Members</Text>
          <Text style={styles.infoValue}>{members.length}</Text>
        </View>

        {/* Leaderboard Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Leaderboard</Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleGroup}>
              <Pressable
                style={[styles.toggle, leaderboardPeriod === 'monthly' && styles.toggleActive]}
                onPress={() => setLeaderboardPeriod('monthly')}
              >
                <Text style={[
                  styles.toggleText,
                  leaderboardPeriod === 'monthly' && styles.toggleTextActive,
                ]}>
                  Monthly
                </Text>
              </Pressable>
              <Pressable
                style={[styles.toggle, leaderboardPeriod === 'alltime' && styles.toggleActive]}
                onPress={() => setLeaderboardPeriod('alltime')}
              >
                <Text style={[
                  styles.toggleText,
                  leaderboardPeriod === 'alltime' && styles.toggleTextActive,
                ]}>
                  All-Time
                </Text>
              </Pressable>
            </View>

            <View style={styles.toggleGroup}>
              <Pressable
                style={[styles.toggle, selectedSport === 'tennis' && styles.toggleActive]}
                onPress={() => setSelectedSport('tennis')}
              >
                <Text style={[
                  styles.toggleText,
                  selectedSport === 'tennis' && styles.toggleTextActive,
                ]}>
                  Tennis
                </Text>
              </Pressable>
              <Pressable
                style={[styles.toggle, selectedSport === 'padel' && styles.toggleActive]}
                onPress={() => setSelectedSport('padel')}
              >
                <Text style={[
                  styles.toggleText,
                  selectedSport === 'padel' && styles.toggleTextActive,
                ]}>
                  Padel
                </Text>
              </Pressable>
            </View>
          </View>

          {leaderboard.length === 0 ? (
            <Text style={styles.emptyText}>No data yet</Text>
          ) : (
            <View style={styles.leaderboardList}>
              {leaderboard.map(entry => (
                <View key={entry.userId} style={styles.leaderboardRow}>
                  <Text style={styles.rank}>#{entry.rank}</Text>
                  <Text style={styles.playerName}>
                    {entry.user?.displayName || entry.user?.username}
                  </Text>
                  <View style={styles.stats}>
                    <Text style={styles.level}>{entry.level.toFixed(1)}</Text>
                    <Text style={styles.record}>
                      {entry.wins}W-{entry.losses}L
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Recent Matches */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Matches</Text>
          {matches.length === 0 ? (
            <Text style={styles.emptyText}>No matches yet</Text>
          ) : (
            <View style={styles.matchesList}>
              {matches.map(match => (
                <Pressable
                  key={match.id}
                  style={styles.matchCard}
                  onPress={() => router.push(`/match/${match.id}`)}
                >
                  <View style={styles.matchHeader}>
                    <Text style={styles.matchSport}>
                      {match.sport.charAt(0).toUpperCase() + match.sport.slice(1)} · {match.format}
                    </Text>
                    <View style={[
                      styles.statusBadge,
                      match.status === 'confirmed' ? styles.statusConfirmed : styles.statusPending,
                    ]}>
                      <Text style={styles.statusText}>{match.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.matchPlayers}>
                    {match.players
                      ?.filter(p => p.team === 'A')
                      .map(p => p.user?.displayName)
                      .join(' / ')} vs{' '}
                    {match.players
                      ?.filter(p => p.team === 'B')
                      .map(p => p.user?.displayName)
                      .join(' / ')}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Button
          title="Log Match"
          onPress={() => router.push('/(tabs)/add-match')}
          fullWidth
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
  headerTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
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
  loadingText: {
    fontSize: Typography.sizes.base,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  infoLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  infoValue: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  toggleGroup: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 2,
  },
  toggle: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  toggleTextActive: {
    color: Colors.textPrimary,
    fontWeight: Typography.weights.semibold,
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  leaderboardList: {
    gap: Spacing.sm,
  },
  leaderboardRow: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rank: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    width: 32,
  },
  playerName: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
  },
  stats: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  level: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
  record: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  matchesList: {
    gap: Spacing.sm,
  },
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchSport: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusConfirmed: {
    backgroundColor: Colors.success,
  },
  statusPending: {
    backgroundColor: Colors.warning,
  },
  statusText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textPrimary,
    fontWeight: Typography.weights.semibold,
  },
  matchPlayers: {
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyIcon: {
    fontSize: 64,
  },
  emptyTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
});
