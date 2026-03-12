import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { UserAvatar, UserName, ScreenLoader, EmptyState, ErrorState, LoadingSpinner } from '@/components';
import { useGroups } from '@/hooks/useGroups';
import { Group, LeaderboardEntry } from '@/types';
import { Sport } from '@/constants/config';
import { getSupabaseClient } from '@/template';
import { matchesService } from '@/services/matches';
import { friendsService } from '@/services/friends';

const supabase = getSupabaseClient();

type TabType = 'group-ranking' | 'head-to-head';

export default function LeaderboardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getUserGroups } = useGroups();

  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('group-ranking');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<Sport>('tennis');
  const [period, setPeriod] = useState<'monthly' | 'alltime'>('monthly');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Head-to-head state
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [showOpponentPicker, setShowOpponentPicker] = useState(false);
  const [headToHeadStats, setHeadToHeadStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    loadUserId();
  }, []);

  useEffect(() => {
    if (userId) {
      loadGroups();
      loadFriends();
    }
  }, [userId]);

  useEffect(() => {
    if (selectedGroup && activeTab === 'group-ranking') {
      loadLeaderboard();
    }
  }, [selectedGroup, selectedSport, period, activeTab]);

  useEffect(() => {
    if (selectedGroup && selectedOpponent && activeTab === 'head-to-head') {
      loadHeadToHeadStats();
    }
  }, [selectedGroup, selectedOpponent, period, activeTab]);

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

  const loadFriends = async () => {
    if (!userId) return;
    try {
      const data = await friendsService.getFriends(userId);
      setFriends(data);
    } catch (err) {
      console.error('Error loading friends:', err);
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

  const loadHeadToHeadStats = async () => {
    if (!userId || !selectedGroup || !selectedOpponent) return;

    setLoadingStats(true);
    try {
      const { data: matchPlayers } = await supabase
        .from('match_players')
        .select(`
          match_id,
          team,
          match:match_id (
            id,
            status,
            winner_team,
            created_at,
            group_id,
            sport,
            match_sets(team_a_score, team_b_score)
          )
        `)
        .eq('user_id', userId);

      if (!matchPlayers) {
        setHeadToHeadStats(null);
        setLoadingStats(false);
        return;
      }

      const relevantMatches = matchPlayers
        .filter((mp: any) => 
          mp.match?.status === 'confirmed' &&
          mp.match?.group_id === selectedGroup &&
          mp.match?.sport === selectedSport
        )
        .map((mp: any) => mp.match)
        .filter((match: any, index: number, self: any[]) => 
          self.findIndex((m: any) => m.id === match.id) === index
        );

      const matchesVsOpponent = await Promise.all(
        relevantMatches.map(async (match: any) => {
          const { data: opponentPlayer } = await supabase
            .from('match_players')
            .select('team')
            .eq('match_id', match.id)
            .eq('user_id', selectedOpponent)
            .single();

          if (!opponentPlayer) return null;

          const myTeam = matchPlayers.find((mp: any) => mp.match_id === match.id)?.team;
          const opponentTeam = opponentPlayer.team;

          if (!myTeam || !opponentTeam) return null;

          const iWon = match.winner_team === myTeam;
          const opponentWon = match.winner_team === opponentTeam;

          return {
            matchId: match.id,
            myTeam,
            opponentTeam,
            iWon,
            opponentWon,
            createdAt: match.created_at,
            sets: match.match_sets,
          };
        })
      );

      const validMatches = matchesVsOpponent.filter(Boolean);

      let filteredMatches = validMatches;
      if (period === 'monthly') {
        const now = new Date();
        const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
        filteredMatches = validMatches.filter((m: any) => new Date(m.createdAt) >= monthAgo);
      }

      const wins = filteredMatches.filter((m: any) => m.iWon).length;
      const losses = filteredMatches.filter((m: any) => m.opponentWon).length;
      const winRate = filteredMatches.length > 0 ? Math.round((wins / filteredMatches.length) * 100) : 0;

      let currentStreak = 0;
      let streakType: 'W' | 'L' | null = null;
      const sortedMatches = [...filteredMatches].sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      for (const match of sortedMatches) {
        if (match.iWon && (!streakType || streakType === 'W')) {
          streakType = 'W';
          currentStreak++;
        } else if (match.opponentWon && (!streakType || streakType === 'L')) {
          streakType = 'L';
          currentStreak++;
        } else {
          break;
        }
      }

      const last5 = sortedMatches.slice(0, 5).map((m: any) => m.iWon ? 'W' : 'L');

      setHeadToHeadStats({
        wins,
        losses,
        winRate,
        streak: currentStreak,
        streakType,
        last5,
        totalMatches: filteredMatches.length,
        recentMatches: sortedMatches.slice(0, 5),
      });
    } catch (err) {
      console.error('Error loading head-to-head stats:', err);
      setHeadToHeadStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'group-ranking') {
      await loadLeaderboard();
    } else {
      await loadHeadToHeadStats();
    }
    setRefreshing(false);
  }, [selectedGroup, selectedSport, period, selectedOpponent, activeTab]);

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
  const selectedFriend = selectedOpponent 
    ? friends.find(f => f.friend.id === selectedOpponent)?.friend 
    : null;

  const userRank = leaderboard.find(e => e.userId === userId);

  if (isLoadingInitial) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
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
        <ScreenLoader message="Loading leaderboards..." />
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
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
        <EmptyState
          icon="🏆"
          title="No Groups Yet"
          subtitle="Join a group to view leaderboards"
        />
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

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabButton, activeTab === 'group-ranking' && styles.tabButtonActive]}
          onPress={() => setActiveTab('group-ranking')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'group-ranking' && styles.tabButtonTextActive]}>
            Group Ranking
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'head-to-head' && styles.tabButtonActive]}
          onPress={() => setActiveTab('head-to-head')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'head-to-head' && styles.tabButtonTextActive]}>
            Head-to-head
          </Text>
        </Pressable>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Group Selector */}
        <View style={styles.controlSection}>
          <Text style={styles.controlLabel}>Group</Text>
          <View style={styles.controlPill}>
            <Text style={styles.controlPillText} numberOfLines={1}>
              {currentGroup?.name || 'Select Group'}
            </Text>
          </View>
        </View>

        {/* Opponent Selector (only for head-to-head) */}
        {activeTab === 'head-to-head' && (
          <View style={styles.controlSection}>
            <Text style={styles.controlLabel}>Opponent</Text>
            <Pressable
              style={styles.playerSelector}
              onPress={() => setShowOpponentPicker(true)}
            >
              {selectedFriend ? (
                <>
                  <UserAvatar
                    name={selectedFriend.displayName || selectedFriend.username}
                    avatarUrl={selectedFriend.avatarUrl}
                    size={28}
                  />
                  <Text style={styles.playerSelectorText}>
                    {selectedFriend.displayName || selectedFriend.username}
                  </Text>
                </>
              ) : (
                <Text style={styles.playerSelectorPlaceholder}>Choose player</Text>
              )}
              <MaterialIcons name="arrow-drop-down" size={24} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Sport & Period */}
        <View style={styles.splitControls}>
          <View style={[styles.controlSection, { flex: 1 }]}>
            <Text style={styles.controlLabel}>Sport</Text>
            <View style={styles.segmentedControl}>
              <Pressable
                style={[styles.segment, selectedSport === 'tennis' && styles.segmentActive]}
                onPress={() => setSelectedSport('tennis')}
              >
                <Image
                  source={require('@/assets/icons/tennis_icon.png')}
                  style={[styles.sportIcon, selectedSport !== 'tennis' && styles.sportIconInactive]}
                  contentFit="contain"
                  transition={0}
                />
              </Pressable>
              <Pressable
                style={[styles.segment, selectedSport === 'padel' && styles.segmentActive]}
                onPress={() => setSelectedSport('padel')}
              >
                <Image
                  source={require('@/assets/icons/padel_icon.png')}
                  style={[styles.sportIcon, selectedSport !== 'padel' && styles.sportIconInactive]}
                  contentFit="contain"
                  transition={0}
                />
              </Pressable>
            </View>
          </View>

          <View style={[styles.controlSection, { flex: 1 }]}>
            <Text style={styles.controlLabel}>Time</Text>
            <View style={styles.segmentedControl}>
              <Pressable
                style={[styles.segment, period === 'monthly' && styles.segmentActive]}
                onPress={() => setPeriod('monthly')}
              >
                <Text style={[styles.segmentText, period === 'monthly' && styles.segmentTextActive]}>
                  Month
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segment, period === 'alltime' && styles.segmentActive]}
                onPress={() => setPeriod('alltime')}
              >
                <Text style={[styles.segmentText, period === 'alltime' && styles.segmentTextActive]}>
                  All
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Content */}
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
        {activeTab === 'group-ranking' ? (
          leaderboard.length === 0 ? (
            <EmptyState
              icon="📊"
              title="No Data Yet"
              subtitle="Complete matches to see rankings"
            />
          ) : (
            <>
              {/* Your Rank Highlight */}
              {userRank && (
                <View style={styles.yourRankCard}>
                  <Text style={styles.yourRankLabel}>YOUR RANK</Text>
                  <View style={styles.yourRankContent}>
                    <View style={styles.yourRankBadge}>
                      <Text style={styles.yourRankNumber}>#{userRank.rank}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.yourRankLevel}>{userRank.level.toFixed(1)}</Text>
                      <Text style={styles.yourRankRecord}>
                        {userRank.wins}W–{userRank.losses}L • {userRank.winPercentage.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Leaderboard */}
              <View style={styles.rankedList}>
                {leaderboard.map((entry) => (
                  <Pressable
                    key={entry.userId}
                    style={[
                      styles.rankRow,
                      entry.userId === userId && styles.rankRowHighlighted,
                    ]}
                    onPress={() => handleRowPress(entry)}
                  >
                    <View style={[
                      styles.rankBadge,
                      entry.rank <= 3 && styles.rankBadgeTop,
                      entry.rank === 1 && styles.rankBadgeFirst,
                    ]}>
                      <Text style={[
                        styles.rankBadgeText,
                        entry.rank <= 3 && styles.rankBadgeTextTop,
                      ]}>
                        #{entry.rank}
                      </Text>
                    </View>

                    <UserAvatar
                      name={entry.user?.displayName || entry.user?.username}
                      avatarUrl={entry.user?.avatarUrl}
                      size={44}
                    />

                    <View style={styles.rankPlayerInfo}>
                      <UserName
                        profile={entry.user}
                        displayNameStyle={styles.rankPlayerName}
                        numberOfLines={1}
                      />
                      <Text style={styles.rankPlayerRecord}>
                        {entry.wins}W–{entry.losses}L
                      </Text>
                    </View>

                    <View style={styles.rankStats}>
                      <Text style={styles.rankLevel}>
                        {entry.level.toFixed(1)}
                      </Text>
                      <Text style={styles.rankWinRate}>
                        {entry.winPercentage.toFixed(0)}%
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          )
        ) : (
          loadingStats ? (
            <View style={styles.loadingContainer}>
              <LoadingSpinner size={32} />
              <Text style={styles.loadingText}>Loading stats...</Text>
            </View>
          ) : headToHeadStats && selectedFriend ? (
            <View style={styles.headToHeadSection}>
              {/* VS Card */}
              <View style={styles.vsCard}>
                <Text style={styles.vsLabel}>YOU VS</Text>
                <UserAvatar
                  name={selectedFriend.displayName || selectedFriend.username}
                  avatarUrl={selectedFriend.avatarUrl}
                  size={80}
                />
                <Text style={styles.vsName}>
                  {selectedFriend.displayName || selectedFriend.username}
                </Text>
              </View>

              {/* Record */}
              <View style={styles.recordCard}>
                <Text style={styles.recordValue}>
                  {headToHeadStats.wins}–{headToHeadStats.losses}
                </Text>
                <Text style={styles.recordLabel}>Overall Record</Text>
              </View>

              {/* Stats */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{headToHeadStats.winRate}%</Text>
                  <Text style={styles.statBoxLabel}>Win Rate</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[
                    styles.statBoxValue,
                    headToHeadStats.streakType === 'W' && { color: Colors.success },
                    headToHeadStats.streakType === 'L' && { color: Colors.danger },
                  ]}>
                    {headToHeadStats.streak}{headToHeadStats.streakType}
                  </Text>
                  <Text style={styles.statBoxLabel}>Streak</Text>
                </View>
              </View>

              {/* Last 5 */}
              {headToHeadStats.last5.length > 0 && (
                <View style={styles.last5Card}>
                  <Text style={styles.last5Label}>Last 5 Matches</Text>
                  <View style={styles.last5Row}>
                    {headToHeadStats.last5.map((result: string, idx: number) => (
                      <View
                        key={idx}
                        style={[
                          styles.last5Badge,
                          result === 'W' && styles.last5BadgeWin,
                          result === 'L' && styles.last5BadgeLoss,
                        ]}
                      >
                        <Text style={styles.last5BadgeText}>{result}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Recent Matches */}
              {headToHeadStats.recentMatches && headToHeadStats.recentMatches.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent Matches</Text>
                  {headToHeadStats.recentMatches.map((match: any) => (
                    <Pressable
                      key={match.matchId}
                      style={styles.matchRow}
                      onPress={() => router.push(`/match/${match.matchId}`)}
                    >
                      <View style={[
                        styles.matchResultBadge,
                        match.iWon && styles.matchResultWin,
                        match.opponentWon && styles.matchResultLoss,
                      ]}>
                        <Text style={styles.matchResultText}>{match.iWon ? 'W' : 'L'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.matchDate}>
                          {new Date(match.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : selectedOpponent ? (
            <EmptyState
              icon="📊"
              title="No Matches Found"
              subtitle="You haven't played against this player yet"
            />
          ) : (
            <EmptyState
              icon="🎯"
              title="Select an Opponent"
              subtitle="Choose a player to view your head-to-head record"
            />
          )
        )}
      </ScrollView>

      {/* Opponent Picker Modal */}
      <Modal
        visible={showOpponentPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOpponentPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowOpponentPicker(false)}
        >
          <Pressable
            style={[styles.pickerModal, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Choose Opponent</Text>
              <Pressable
                onPress={() => setShowOpponentPicker(false)}
                style={styles.pickerClose}
              >
                <MaterialIcons name="close" size={24} color={Colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {friends.map(friendship => (
                <Pressable
                  key={friendship.id}
                  style={[
                    styles.pickerItem,
                    selectedOpponent === friendship.friend.id && styles.pickerItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedOpponent(friendship.friend.id);
                    setShowOpponentPicker(false);
                  }}
                >
                  <UserAvatar
                    name={friendship.friend.displayName || friendship.friend.username}
                    avatarUrl={friendship.friend.avatarUrl}
                    size={40}
                  />
                  <View style={styles.pickerItemInfo}>
                    <UserName
                      profile={friendship.friend}
                      displayNameStyle={styles.pickerItemName}
                      handleStyle={styles.pickerItemHandle}
                    />
                  </View>
                  {selectedOpponent === friendship.friend.id && (
                    <MaterialIcons name="check-circle" size={24} color={Colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabButtonText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    color: Colors.textMuted,
  },
  tabButtonTextActive: {
    color: Colors.primary,
    fontWeight: Typography.weights.semibold,
  },
  controls: {
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  controlSection: {
    gap: Spacing.xs,
  },
  controlLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  controlPill: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  controlPillText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  playerSelector: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  playerSelectorText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.medium,
    color: Colors.textPrimary,
  },
  playerSelectorPlaceholder: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.textMuted,
  },
  splitControls: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
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
  sportIcon: {
    width: 20,
    height: 20,
  },
  sportIconInactive: {
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },

  // Group Ranking styles
  yourRankCard: {
    backgroundColor: Colors.primary + '20',
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  yourRankLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 1.5,
  },
  yourRankContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  yourRankBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yourRankNumber: {
    fontSize: 20,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  yourRankLevel: {
    fontSize: 32,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  yourRankRecord: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
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
  rankRowHighlighted: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  rankBadge: {
    width: 40,
    height: 40,
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
  rankBadgeFirst: {
    backgroundColor: Colors.accentGold + '20',
    borderColor: Colors.accentGold,
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
    gap: 2,
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
  rankWinRate: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },

  // Head-to-head styles
  loadingContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  headToHeadSection: {
    gap: Spacing.lg,
  },
  vsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  vsLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },
  vsName: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  recordCard: {
    backgroundColor: Colors.primary + '20',
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  recordValue: {
    fontSize: 56,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  recordLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statBoxValue: {
    fontSize: 32,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  statBoxLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  last5Card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  last5Label: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  last5Row: {
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  last5Badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  last5BadgeWin: {
    backgroundColor: Colors.success,
  },
  last5BadgeLoss: {
    backgroundColor: Colors.danger,
  },
  last5BadgeText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  matchRow: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  matchResultBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchResultWin: {
    backgroundColor: Colors.success,
  },
  matchResultLoss: {
    backgroundColor: Colors.danger,
  },
  matchResultText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  matchDate: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    height: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  pickerClose: {
    padding: Spacing.xs,
  },
  pickerList: {
    flexGrow: 1,
    flexShrink: 1,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerItemSelected: {
    backgroundColor: Colors.surfaceElevated,
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  pickerItemHandle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
});
