import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Modal, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { Button, ScreenLoader, EmptyState, ErrorState, UserAvatar, UserName, LoadingSpinner } from '@/components';
import { useAlert } from '@/template';
import { tournamentsService } from '@/services/tournaments';
import { Tournament, TournamentInvite } from '@/types';
import { getSupabaseClient } from '@/template';
import { useGroups } from '@/hooks/useGroups';
import { friendsService } from '@/services/friends';
import { matchesService } from '@/services/matches';

const supabase = getSupabaseClient();

type TabType = 'overview' | 'records' | 'events';

export default function TournamentsHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { getUserGroups } = useGroups();

  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
  const [completedTournaments, setCompletedTournaments] = useState<Tournament[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TournamentInvite[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respondingToInvite, setRespondingToInvite] = useState<string | null>(null);

  // Records tab state
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [showOpponentPicker, setShowOpponentPicker] = useState(false);
  const [recordPeriod, setRecordPeriod] = useState<'all' | 'month' | 'year'>('all');
  const [headToHeadStats, setHeadToHeadStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Events tab state
  const [eventsView, setEventsView] = useState<'my-groups' | 'all'>('my-groups');
  const [eventsStatus, setEventsStatus] = useState<'ongoing' | 'completed'>('ongoing');

  useEffect(() => {
    loadUserId();
  }, []);

  useEffect(() => {
    if (userId) {
      loadTournaments();
      loadGroups();
      loadFriends();
    }
  }, [userId]);

  useEffect(() => {
    if (selectedGroup && selectedOpponent && activeTab === 'records') {
      loadHeadToHeadStats();
    }
  }, [selectedGroup, selectedOpponent, recordPeriod, activeTab]);

  const loadUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const loadGroups = async () => {
    if (!userId) return;
    try {
      const data = await getUserGroups(userId);
      setGroups(data);
      if (data.length > 0 && !selectedGroup) {
        setSelectedGroup(data[0].id);
      }
    } catch (err) {
      console.error('Error loading groups:', err);
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

  const loadTournaments = async () => {
    if (!userId) return;
    try {
      setError(null);
      const [tournamentsData, invitesData] = await Promise.all([
        tournamentsService.listTournamentsForUser(userId),
        tournamentsService.getPendingInvitesForUser(userId),
      ]);

      setActiveTournaments(tournamentsData.active);
      setCompletedTournaments(tournamentsData.completed);
      setPendingInvites(invitesData);
    } catch (err: any) {
      console.error('Error loading tournaments:', err);
      setError(err.message || 'Failed to load tournaments');
    } finally {
      setIsLoadingInitial(false);
    }
  };

  const loadHeadToHeadStats = async () => {
    if (!userId || !selectedGroup || !selectedOpponent) return;

    setLoadingStats(true);
    try {
      // Get all matches between these two players in this group
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
            match_sets(team_a_score, team_b_score)
          )
        `)
        .eq('user_id', userId);

      if (!matchPlayers) {
        setHeadToHeadStats(null);
        setLoadingStats(false);
        return;
      }

      // Filter for confirmed matches in selected group
      const relevantMatches = matchPlayers
        .filter((mp: any) => 
          mp.match?.status === 'confirmed' &&
          mp.match?.group_id === selectedGroup
        )
        .map((mp: any) => mp.match)
        .filter((match: any, index: number, self: any[]) => 
          // Deduplicate matches
          self.findIndex((m: any) => m.id === match.id) === index
        );

      // Check if opponent was in each match
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

      // Apply period filter
      let filteredMatches = validMatches;
      if (recordPeriod === 'month') {
        const now = new Date();
        const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
        filteredMatches = validMatches.filter((m: any) => new Date(m.createdAt) >= monthAgo);
      } else if (recordPeriod === 'year') {
        const now = new Date();
        const yearAgo = new Date(now.getFullYear(), 0, 1);
        filteredMatches = validMatches.filter((m: any) => new Date(m.createdAt) >= yearAgo);
      }

      const wins = filteredMatches.filter((m: any) => m.iWon).length;
      const losses = filteredMatches.filter((m: any) => m.opponentWon).length;
      const winRate = filteredMatches.length > 0 ? Math.round((wins / filteredMatches.length) * 100) : 0;

      // Calculate streak
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

      // Get last 5 results
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
    await loadTournaments();
    setRefreshing(false);
  }, [userId]);

  const handleRespondToInvite = async (inviteId: string, accept: boolean) => {
    setRespondingToInvite(inviteId);
    
    try {
      const result = await tournamentsService.respondToInvite(inviteId, accept);
      await loadTournaments();
      
      if (accept) {
        if (result.ok && result.joined && result.participantRecordFound && result.tournamentId) {
          showAlert('Success', 'You have joined the tournament!');
          router.push(`/tournaments/${result.tournamentId}`);
        } else {
          showAlert('Invite Accepted', 'Tournament will appear shortly.');
        }
      } else {
        showAlert('Invite Declined', 'You have declined the tournament invitation.');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to respond to invite');
    } finally {
      setRespondingToInvite(null);
    }
  };

  const getStateLabel = (state: Tournament['state']) => {
    switch (state) {
      case 'draft': return 'Draft';
      case 'inviting': return 'Inviting';
      case 'locked': return 'Locked';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      default: return state;
    }
  };

  const getStateColor = (state: Tournament['state']) => {
    switch (state) {
      case 'draft': return Colors.textMuted;
      case 'inviting': return Colors.warning;
      case 'locked': return Colors.primary;
      case 'in_progress': return Colors.success;
      case 'completed': return Colors.textMuted;
      default: return Colors.textMuted;
    }
  };

  const renderOverviewTab = () => {
    const mostActiveGroup = groups.length > 0 ? groups[0] : null;
    const recentTournament = [...activeTournaments, ...completedTournaments]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending Invites</Text>
            {pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                <View style={styles.inviteHeader}>
                  <MaterialIcons name="mail" size={20} color={Colors.warning} />
                  <Text style={styles.inviteTitle}>{invite.tournament?.title || 'Tournament'}</Text>
                </View>
                <View style={styles.inviteMeta}>
                  <Text style={styles.inviteMetaText}>
                    {invite.tournament?.sport} • {invite.tournament?.type}
                  </Text>
                </View>
                <View style={styles.inviteActions}>
                  <Pressable
                    style={[styles.inviteButton, styles.inviteButtonDecline]}
                    onPress={() => handleRespondToInvite(invite.id, false)}
                    disabled={respondingToInvite !== null}
                  >
                    <Text style={styles.inviteButtonTextDecline}>Decline</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.inviteButton, styles.inviteButtonAccept]}
                    onPress={() => handleRespondToInvite(invite.id, true)}
                    disabled={respondingToInvite !== null}
                  >
                    <Text style={styles.inviteButtonTextAccept}>Accept</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Summary Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{activeTournaments.length}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{completedTournaments.length}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>
        </View>

        {/* Most Active Group */}
        {mostActiveGroup && (
          <Pressable style={styles.groupHighlight} onPress={() => router.push(`/group/${mostActiveGroup.id}`)}>
            <View style={styles.groupHighlightHeader}>
              <MaterialIcons name="group" size={20} color={Colors.primary} />
              <Text style={styles.groupHighlightLabel}>Most Active Group</Text>
            </View>
            <Text style={styles.groupHighlightName}>{mostActiveGroup.name}</Text>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
          </Pressable>
        )}

        {/* Recent Tournament */}
        {recentTournament && (
          <Pressable
            style={styles.recentTournamentCard}
            onPress={() => router.push(`/tournaments/${recentTournament.id}`)}
          >
            <Text style={styles.recentTournamentLabel}>RECENT TOURNAMENT</Text>
            <View style={styles.recentTournamentContent}>
              <Image
                source={recentTournament.sport === 'tennis' 
                  ? require('@/assets/icons/tennis_icon.png')
                  : require('@/assets/icons/padel_icon.png')
                }
                style={styles.recentTournamentIcon}
                contentFit="contain"
                transition={0}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.recentTournamentTitle}>{recentTournament.title}</Text>
                <Text style={styles.recentTournamentMeta}>
                  {getStateLabel(recentTournament.state)} • {recentTournament.participants.length} players
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={Colors.textMuted} />
            </View>
          </Pressable>
        )}

        {/* Quick Action */}
        <Pressable
          style={styles.actionCard}
          onPress={() => setActiveTab('records')}
        >
          <View style={styles.actionCardContent}>
            <MaterialIcons name="sports-tennis" size={32} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionCardTitle}>View 1v1 Record</Text>
              <Text style={styles.actionCardSubtitle}>Check your head-to-head stats</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={24} color={Colors.primary} />
          </View>
        </Pressable>

        {(!mostActiveGroup && !recentTournament && pendingInvites.length === 0) && (
          <EmptyState
            icon="🏆"
            title="No Tournament Activity"
            subtitle="Create a tournament or join a group to get started"
          />
        )}
      </ScrollView>
    );
  };

  const renderRecordsTab = () => {
    const selectedFriend = selectedOpponent 
      ? friends.find(f => f.friend.id === selectedOpponent)?.friend 
      : null;

    const selectedGroupData = groups.find(g => g.id === selectedGroup);

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Controls */}
        <View style={styles.recordsControls}>
          {/* Group Selector */}
          <View style={styles.controlSection}>
            <Text style={styles.controlLabel}>Group</Text>
            <View style={styles.controlPill}>
              <Text style={styles.controlPillText}>
                {selectedGroupData?.name || 'Select Group'}
              </Text>
            </View>
          </View>

          {/* Player Selector */}
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
                    size={32}
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

          {/* Time Selector */}
          <View style={styles.controlSection}>
            <Text style={styles.controlLabel}>Period</Text>
            <View style={styles.segmentedControl}>
              <Pressable
                style={[styles.segment, recordPeriod === 'month' && styles.segmentActive]}
                onPress={() => setRecordPeriod('month')}
              >
                <Text style={[styles.segmentText, recordPeriod === 'month' && styles.segmentTextActive]}>
                  Month
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segment, recordPeriod === 'year' && styles.segmentActive]}
                onPress={() => setRecordPeriod('year')}
              >
                <Text style={[styles.segmentText, recordPeriod === 'year' && styles.segmentTextActive]}>
                  Year
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segment, recordPeriod === 'all' && styles.segmentActive]}
                onPress={() => setRecordPeriod('all')}
              >
                <Text style={[styles.segmentText, recordPeriod === 'all' && styles.segmentTextActive]}>
                  All
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Head-to-Head Stats */}
        {loadingStats ? (
          <View style={styles.loadingContainer}>
            <LoadingSpinner size={32} />
            <Text style={styles.loadingText}>Loading stats...</Text>
          </View>
        ) : headToHeadStats && selectedFriend ? (
          <View style={styles.statsSection}>
            {/* Player Card */}
            <View style={styles.vsCard}>
              <Text style={styles.vsLabel}>YOU VS</Text>
              <UserAvatar
                name={selectedFriend.displayName || selectedFriend.username}
                avatarUrl={selectedFriend.avatarUrl}
                size={64}
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

            {/* Stats Grid */}
            <View style={styles.miniStatsGrid}>
              <View style={styles.miniStatItem}>
                <Text style={styles.miniStatValue}>{headToHeadStats.winRate}%</Text>
                <Text style={styles.miniStatLabel}>Win Rate</Text>
              </View>
              <View style={styles.miniStatItem}>
                <Text style={[
                  styles.miniStatValue,
                  headToHeadStats.streakType === 'W' && { color: Colors.success },
                  headToHeadStats.streakType === 'L' && { color: Colors.danger },
                ]}>
                  {headToHeadStats.streak}{headToHeadStats.streakType}
                </Text>
                <Text style={styles.miniStatLabel}>Streak</Text>
              </View>
              <View style={styles.miniStatItem}>
                <Text style={styles.miniStatValue}>{headToHeadStats.totalMatches}</Text>
                <Text style={styles.miniStatLabel}>Matches</Text>
              </View>
            </View>

            {/* Last 5 */}
            {headToHeadStats.last5.length > 0 && (
              <View style={styles.last5Card}>
                <Text style={styles.last5Label}>Last 5</Text>
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
                    style={styles.matchHistoryRow}
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
                      <Text style={styles.matchHistoryDate}>
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
        )}
      </ScrollView>
    );
  };

  const renderEventsTab = () => {
    let filteredTournaments = [...activeTournaments, ...completedTournaments];

    // Apply status filter
    if (eventsStatus === 'ongoing') {
      filteredTournaments = filteredTournaments.filter(t => 
        t.state === 'draft' || t.state === 'inviting' || t.state === 'locked' || t.state === 'in_progress'
      );
    } else {
      filteredTournaments = filteredTournaments.filter(t => t.state === 'completed');
    }

    // Apply group filter
    if (eventsView === 'my-groups') {
      const myGroupIds = groups.map(g => g.id);
      filteredTournaments = filteredTournaments.filter(t => 
        t.groupId && myGroupIds.includes(t.groupId)
      );
    }

    // Sort by most recent
    filteredTournaments.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Filters */}
        <View style={styles.eventsFilters}>
          <View style={styles.segmentedControl}>
            <Pressable
              style={[styles.segment, eventsView === 'my-groups' && styles.segmentActive]}
              onPress={() => setEventsView('my-groups')}
            >
              <Text style={[styles.segmentText, eventsView === 'my-groups' && styles.segmentTextActive]}>
                My Groups
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, eventsView === 'all' && styles.segmentActive]}
              onPress={() => setEventsView('all')}
            >
              <Text style={[styles.segmentText, eventsView === 'all' && styles.segmentTextActive]}>
                All
              </Text>
            </Pressable>
          </View>

          <View style={styles.segmentedControl}>
            <Pressable
              style={[styles.segment, eventsStatus === 'ongoing' && styles.segmentActive]}
              onPress={() => setEventsStatus('ongoing')}
            >
              <Text style={[styles.segmentText, eventsStatus === 'ongoing' && styles.segmentTextActive]}>
                Ongoing
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, eventsStatus === 'completed' && styles.segmentActive]}
              onPress={() => setEventsStatus('completed')}
            >
              <Text style={[styles.segmentText, eventsStatus === 'completed' && styles.segmentTextActive]}>
                Completed
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tournaments List */}
        {filteredTournaments.length > 0 ? (
          <View style={styles.tournamentsList}>
            {filteredTournaments.map((tournament) => (
              <Pressable
                key={tournament.id}
                style={styles.tournamentCard}
                onPress={() => router.push(`/tournaments/${tournament.id}`)}
              >
                <View style={styles.tournamentCardHeader}>
                  <Image
                    source={tournament.sport === 'tennis' 
                      ? require('@/assets/icons/tennis_icon.png')
                      : require('@/assets/icons/padel_icon.png')
                    }
                    style={styles.tournamentSportIcon}
                    contentFit="contain"
                    transition={0}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tournamentCardTitle}>{tournament.title}</Text>
                    <View style={styles.tournamentCardMeta}>
                      <Text style={styles.tournamentCardMetaText}>
                        {tournament.type === 'americano' ? 'Americano' : 'Tournament'} • {tournament.mode}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.stateBadge, { backgroundColor: getStateColor(tournament.state) + '20' }]}>
                    <Text style={[styles.stateBadgeText, { color: getStateColor(tournament.state) }]}>
                      {getStateLabel(tournament.state)}
                    </Text>
                  </View>
                </View>

                <View style={styles.tournamentCardFooter}>
                  <View style={styles.tournamentCardInfo}>
                    <MaterialIcons name="people" size={14} color={Colors.textMuted} />
                    <Text style={styles.tournamentCardInfoText}>
                      {tournament.participants.length} players
                    </Text>
                  </View>
                  <Text style={styles.tournamentCardDate}>
                    {new Date(tournament.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="🏆"
            title="No Tournaments"
            subtitle="No tournaments match your filters"
          />
        )}
      </ScrollView>
    );
  };

  if (isLoadingInitial) {
    return <ScreenLoader message="Loading tournaments..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadTournaments} />;
  }

  return (
    <View style={styles.container}>
      {/* Tab Controls */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabButton, activeTab === 'overview' && styles.tabButtonActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'overview' && styles.tabButtonTextActive]}>
            Overview
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'records' && styles.tabButtonActive]}
          onPress={() => setActiveTab('records')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'records' && styles.tabButtonTextActive]}>
            Records
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'events' && styles.tabButtonActive]}
          onPress={() => setActiveTab('events')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'events' && styles.tabButtonTextActive]}>
            Events
          </Text>
        </Pressable>
      </View>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'records' && renderRecordsTab()}
      {activeTab === 'events' && renderEventsTab()}

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },

  // Overview styles
  statsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  statValue: {
    fontSize: 40,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  groupHighlight: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  groupHighlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  groupHighlightLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  groupHighlightName: {
    flex: 1,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  recentTournamentCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  recentTournamentLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  recentTournamentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  recentTournamentIcon: {
    width: 32,
    height: 32,
  },
  recentTournamentTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  recentTournamentMeta: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    padding: Spacing.lg,
  },
  actionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionCardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  actionCardSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  inviteCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.warning,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inviteTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  inviteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inviteMetaText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  inviteButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButtonAccept: {
    backgroundColor: Colors.primary,
  },
  inviteButtonDecline: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inviteButtonTextAccept: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  inviteButtonTextDecline: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
  },

  // Records styles
  recordsControls: {
    gap: Spacing.md,
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
  },
  controlPillText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  playerSelector: {
    backgroundColor: Colors.surface,
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
    alignItems: 'center',
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
  loadingContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  statsSection: {
    gap: Spacing.lg,
  },
  vsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  vsLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  vsName: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  recordCard: {
    backgroundColor: Colors.primary + '20',
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  recordValue: {
    fontSize: 48,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  recordLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    color: Colors.textMuted,
  },
  miniStatsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  miniStatItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  miniStatValue: {
    fontSize: 24,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  miniStatLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  last5Card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
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
  },
  last5Badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  matchHistoryRow: {
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
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  matchHistoryDate: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },

  // Events styles
  eventsFilters: {
    gap: Spacing.sm,
  },
  tournamentsList: {
    gap: Spacing.md,
  },
  tournamentCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  tournamentCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  tournamentSportIcon: {
    width: 20,
    height: 20,
  },
  tournamentCardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  tournamentCardMeta: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: 2,
  },
  tournamentCardMetaText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  stateBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  stateBadgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  tournamentCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  tournamentCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tournamentCardInfoText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  tournamentCardDate: {
    fontSize: Typography.sizes.xs,
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
