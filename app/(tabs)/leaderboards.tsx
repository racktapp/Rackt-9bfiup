import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { UserAvatar, UserName, ScreenLoader, EmptyState, ErrorState } from '@/components';
import { useGroups } from '@/hooks/useGroups';
import { Group, LeaderboardEntry } from '@/types';
import { Sport } from '@/constants/config';
import { getSupabaseClient } from '@/template';
import { matchesService } from '@/services/matches';

const supabase = getSupabaseClient();

export default function LeaderboardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getUserGroups } = useGroups();

  const [userId, setUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<Sport>('tennis');
  const [period, setPeriod] = useState<'monthly' | 'alltime'>('monthly');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserId();
  }, []);

  useEffect(() => {
    if (userId) {
      loadGroups();
    }
  }, [userId]);

  useEffect(() => {
    if (selectedGroup) {
      loadLeaderboard();
    }
  }, [selectedGroup, selectedSport, period]);

  const loadUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const loadGroups = async () => {
    if (!userId) return;
    const data = await getUserGroups(userId);
    setGroups(data);
    if (data.length > 0 && !selectedGroup) {
      setSelectedGroup(data[0].id);
    }
  };

  const loadLeaderboard = async () => {
    if (!selectedGroup) return;
    try {
      setError(null);
      const data = await matchesService.getLeaderboard(selectedGroup, selectedSport, period);
      setLeaderboard(data);
    } catch (err: any) {
      console.error('Error loading leaderboard:', err);
      setError(err.message || 'Failed to load leaderboard');
    } finally {
      setIsLoadingInitial(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  }, [selectedGroup, selectedSport, period]);

  const handleRowPress = (entry: LeaderboardEntry) => {
    if (!selectedGroup) return;
    router.push({
      pathname: '/profile/[userId]' as any,
      params: { 
        userId: entry.userId,
        groupId: selectedGroup,
        sport: selectedSport,
        period,
      },
    });
  };

  const currentGroup = groups.find(g => g.id === selectedGroup);
  const top3 = leaderboard.slice(0, 3);

  if (isLoadingInitial) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Leaderboards</Text>
        </View>
        <ScreenLoader message="Loading leaderboards..." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/(tabs)/dashboard')}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.headerLogo}
            contentFit="contain"
            transition={200}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Leaderboards</Text>
        <Pressable onPress={() => router.push('/settings')}>
          <MaterialIcons name="settings" size={24} color={Colors.textPrimary} />
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="No Groups Yet"
          subtitle="Join a group to view leaderboards"
        />
      ) : (
        <>
          {/* Group Selector Pill */}
          <View style={styles.groupSelectorContainer}>
            <View style={styles.groupPill}>
              <Text style={styles.groupPillText}>{currentGroup?.name || 'Select Group'}</Text>
            </View>
          </View>

          {/* Segmented Controls */}
          <View style={styles.filtersContainer}>
            {/* Sport Selector */}
            <View style={styles.segmentedControl}>
              <Pressable
                style={[styles.segment, selectedSport === 'tennis' && styles.segmentActive]}
                onPress={() => setSelectedSport('tennis')}
              >
                <Image
                  source={require('@/assets/icons/tennis_icon.png')}
                  style={[
                    styles.sportIconSmall,
                    selectedSport !== 'tennis' && styles.sportIconInactive,
                  ]}
                  contentFit="contain"
                  transition={0}
                />
                <Text style={[
                  styles.segmentText,
                  selectedSport === 'tennis' && styles.segmentTextActive,
                ]}>
                  Tennis
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segment, selectedSport === 'padel' && styles.segmentActive]}
                onPress={() => setSelectedSport('padel')}
              >
                <Image
                  source={require('@/assets/icons/padel_icon.png')}
                  style={[
                    styles.sportIconSmall,
                    selectedSport !== 'padel' && styles.sportIconInactive,
                  ]}
                  contentFit="contain"
                  transition={0}
                />
                <Text style={[
                  styles.segmentText,
                  selectedSport === 'padel' && styles.segmentTextActive,
                ]}>
                  Padel
                </Text>
              </Pressable>
            </View>

            {/* Period Selector */}
            <View style={styles.segmentedControl}>
              <Pressable
                style={[styles.segment, period === 'monthly' && styles.segmentActive]}
                onPress={() => setPeriod('monthly')}
              >
                <Text style={[
                  styles.segmentText,
                  period === 'monthly' && styles.segmentTextActive,
                ]}>
                  Monthly
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segment, period === 'alltime' && styles.segmentActive]}
                onPress={() => setPeriod('alltime')}
              >
                <Text style={[
                  styles.segmentText,
                  period === 'alltime' && styles.segmentTextActive,
                ]}>
                  All-Time
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.primary}
              />
            }
          >
            {leaderboard.length === 0 ? (
              <EmptyState
                icon="📊"
                title="No Data Yet"
                subtitle="Complete matches to see rankings"
              />
            ) : (
              <>
                {/* Top 3 Banner */}
                {top3.length > 0 && (
                  <View style={styles.top3Card}>
                    <Text style={styles.top3Label}>TOP 3</Text>
                    <View style={styles.top3Container}>
                      {top3.map((entry, index) => (
                        <Pressable
                          key={entry.userId}
                          style={styles.top3Player}
                          onPress={() => handleRowPress(entry)}
                        >
                          <View style={[
                            styles.top3AvatarRing,
                            index === 0 && styles.top3AvatarRingFirst,
                          ]}>
                            <UserAvatar
                              name={entry.user?.displayName || entry.user?.username}
                              avatarUrl={entry.user?.avatarUrl}
                              size={64}
                            />
                          </View>
                          <UserName
                            profile={entry.user}
                            displayNameStyle={styles.top3Name}
                            numberOfLines={1}
                          />
                          <View style={styles.top3LevelChip}>
                            <Text style={styles.top3LevelText}>
                              {entry.level.toFixed(1)}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* Ranked List */}
                <View style={styles.rankedList}>
                  {leaderboard.map((entry) => (
                    <Pressable
                      key={entry.userId}
                      style={styles.rankRow}
                      onPress={() => handleRowPress(entry)}
                    >
                      {/* Rank Badge */}
                      <View style={[
                        styles.rankBadge,
                        entry.rank <= 3 && styles.rankBadgeTop,
                      ]}>
                        <Text style={[
                          styles.rankBadgeText,
                          entry.rank <= 3 && styles.rankBadgeTextTop,
                        ]}>
                          #{entry.rank}
                        </Text>
                      </View>

                      {/* Avatar */}
                      <UserAvatar
                        name={entry.user?.displayName || entry.user?.username}
                        avatarUrl={entry.user?.avatarUrl}
                        size={48}
                      />

                      {/* Player Info */}
                      <View style={styles.rankPlayerInfo}>
                        <UserName
                          profile={entry.user}
                          displayNameStyle={styles.rankPlayerName}
                          numberOfLines={1}
                        />
                        <Text style={styles.rankPlayerRecord}>
                          {entry.wins}W–{entry.losses}L • {entry.winPercentage.toFixed(0)}%
                        </Text>
                      </View>

                      {/* Level Stats */}
                      <View style={styles.rankStats}>
                        <Text style={styles.rankLevel}>
                          {entry.level.toFixed(1)}
                        </Text>
                        <Text style={styles.rankReliability}>
                          {(entry.reliability * 100).toFixed(0)}% rel
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </>
      )}
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
  headerTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  groupSelectorContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  groupPill: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  groupPillText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  filtersContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  segmentActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    color: Colors.textMuted,
  },
  segmentTextActive: {
    color: Colors.textPrimary,
    fontWeight: Typography.weights.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },

  top3Card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  top3Label: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  top3Container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.sm,
  },
  top3Player: {
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  top3AvatarRing: {
    borderWidth: 2,
    borderColor: Colors.primary + '60',
    borderRadius: 100,
    padding: 3,
  },
  top3AvatarRingFirst: {
    borderColor: Colors.accentGold,
    borderWidth: 3,
    shadowColor: Colors.accentGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  top3Name: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    color: Colors.textPrimary,
    maxWidth: 80,
    textAlign: 'center',
  },
  top3LevelChip: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  top3LevelText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  rankedList: {
    gap: Spacing.sm,
  },
  rankRow: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rankBadge: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rankBadgeTop: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  rankBadgeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
  },
  rankBadgeTextTop: {
    color: Colors.primary,
  },
  rankPlayerInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  rankPlayerName: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  rankPlayerRecord: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  rankStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rankLevel: {
    fontSize: 28,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  rankReliability: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },

  errorBanner: {
    backgroundColor: Colors.danger + '20',
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  errorText: {
    fontSize: Typography.sizes.sm,
    color: Colors.danger,
  },
  sportIconSmall: {
    width: 16,
    height: 16,
  },
  sportIconInactive: {
    opacity: 0.5,
  },
});
