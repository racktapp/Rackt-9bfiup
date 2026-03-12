import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { Button, LoadingSpinner, UserAvatar, UserName } from '@/components';
import { Config, Sport, MatchFormat, MatchType } from '@/constants/config';
import { useMatches } from '@/hooks/useMatches';
import { getSupabaseClient } from '@/template';
import { friendsService } from '@/services/friends';

const supabase = getSupabaseClient();

interface Friend {
  id: string;
  userId: string;
  createdAt: string;
  friend: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    initials: string;
    avatarUrl: string | null;
  };
}

export default function Quick1v1Screen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { createMatch } = useMatches();

  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [sport, setSport] = useState<Sport>('tennis');
  const [type, setType] = useState<MatchType>('competitive');
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [sets, setSets] = useState<Array<{ teamAScore: number; teamBScore: number }>>([]);
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
      const data = await friendsService.getFriends(userId);
      setFriends(data);
    } catch (err) {
      console.error('Error loading friends:', err);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  const addSet = () => {
    if (sets.length < 3) {
      setSets([...sets, { teamAScore: 0, teamBScore: 0 }]);
    }
  };

  const updateSetScore = (index: number, team: 'A' | 'B', delta: number) => {
    const newSets = [...sets];
    const currentScore = team === 'A' ? newSets[index].teamAScore : newSets[index].teamBScore;
    const newScore = Math.max(0, Math.min(7, currentScore + delta));
    
    if (team === 'A') {
      newSets[index].teamAScore = newScore;
    } else {
      newSets[index].teamBScore = newScore;
    }
    setSets(newSets);
  };

  // Compute match state
  const matchState = useMemo(() => {
    const setsWonA = sets.filter(s => s.teamAScore > s.teamBScore).length;
    const setsWonB = sets.filter(s => s.teamBScore > s.teamAScore).length;
    const hasTiedSet = sets.some(s => s.teamAScore === s.teamBScore);
    
    let winner: 'A' | 'B' | null = null;
    let canSubmit = false;
    let submitMessage = '';

    if (sets.length === 0) {
      submitMessage = 'Add at least one set';
    } else if (hasTiedSet) {
      submitMessage = 'Each set needs a winner';
    } else if (setsWonA === 2 || setsWonB === 2) {
      winner = setsWonA === 2 ? 'A' : 'B';
      canSubmit = true;
      submitMessage = `Submit Match ${setsWonA}–${setsWonB} ✓`;
    } else if (sets.length === 1) {
      winner = setsWonA === 1 ? 'A' : 'B';
      canSubmit = true;
      submitMessage = `Submit Match ${setsWonA}–${setsWonB} ✓`;
    } else if (setsWonA === 1 && setsWonB === 1) {
      submitMessage = 'Add a deciding set';
    } else {
      canSubmit = true;
      winner = setsWonA > setsWonB ? 'A' : 'B';
      submitMessage = `Submit Match ${setsWonA}–${setsWonB} ✓`;
    }

    return { setsWonA, setsWonB, winner, canSubmit, submitMessage, hasTiedSet };
  }, [sets]);

  const validateMatch = () => {
    if (!selectedOpponent) return 'Please select an opponent';
    if (!matchState.canSubmit) return matchState.submitMessage;
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateMatch();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!userId || !selectedOpponent) return;

    setSubmitting(true);
    setError(null);

    try {
      if (!matchState.winner) {
        setError('Cannot determine match winner');
        setSubmitting(false);
        return;
      }

      const match = await createMatch({
        groupId: null, // Standalone 1v1 match
        sport,
        format: 'singles', // 1v1 is always singles
        type,
        createdBy: userId,
        teamA: [userId],
        teamB: [selectedOpponent],
        sets,
        winnerTeam: matchState.winner,
      });

      router.push(`/match/${match.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create match');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedFriend = friends.find(f => f.friend.id === selectedOpponent);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Quick 1v1</Text>
        <Pressable onPress={() => router.push('/settings')}>
          <MaterialIcons name="settings" size={24} color={Colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.description}>
          Record a 1v1 match without needing a group. Perfect for casual play with friends.
        </Text>

        {/* Sport */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sport</Text>
          <View style={styles.optionsRow}>
            {Config.sports.map(s => (
              <Pressable
                key={s}
                style={[styles.sportChip, sport === s && styles.sportChipSelected]}
                onPress={() => setSport(s)}
              >
                <Image
                  source={s === 'tennis' ? require('@/assets/icons/tennis_icon.png') : require('@/assets/icons/padel_icon.png')}
                  style={[
                    styles.sportIcon,
                    sport !== s && styles.sportIconInactive,
                  ]}
                  contentFit="contain"
                  transition={0}
                />
                <Text style={[styles.sportChipText, sport === s && styles.sportChipTextSelected]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.typeCards}>
            <Pressable
              style={[styles.typeCard, type === 'competitive' && styles.typeCardSelected]}
              onPress={() => setType('competitive')}
            >
              <Text style={[styles.typeCardTitle, type === 'competitive' && styles.typeCardTitleSelected]}>
                Competitive
              </Text>
              <Text style={[styles.typeCardHelper, type === 'competitive' && styles.typeCardHelperSelected]}>
                Affects ranking
              </Text>
            </Pressable>
            <Pressable
              style={[styles.typeCard, type === 'friendly' && styles.typeCardSelected]}
              onPress={() => setType('friendly')}
            >
              <Text style={[styles.typeCardTitle, type === 'friendly' && styles.typeCardTitleSelected]}>
                Friendly
              </Text>
              <Text style={[styles.typeCardHelper, type === 'friendly' && styles.typeCardHelperSelected]}>
                Does not affect ranking
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Opponent Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Select Opponent</Text>
          {isLoadingFriends ? (
            <View style={styles.loadingContainer}>
              <LoadingSpinner size={24} />
              <Text style={styles.helperText}>Loading friends...</Text>
            </View>
          ) : friends.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No friends yet</Text>
              <Text style={styles.helperText}>Add friends to play 1v1 matches</Text>
            </View>
          ) : (
            <View style={styles.friendsList}>
              {friends.map(friendship => (
                <Pressable
                  key={friendship.id}
                  style={[
                    styles.friendCard,
                    selectedOpponent === friendship.friend.id && styles.friendCardSelected,
                  ]}
                  onPress={() => setSelectedOpponent(friendship.friend.id)}
                >
                  <UserAvatar
                    name={friendship.friend.displayName || friendship.friend.username}
                    avatarUrl={friendship.friend.avatarUrl}
                    size={40}
                  />
                  <View style={styles.friendInfo}>
                    <UserName
                      profile={friendship.friend}
                      displayNameStyle={styles.friendName}
                      handleStyle={styles.friendHandle}
                    />
                  </View>
                  {selectedOpponent === friendship.friend.id && (
                    <MaterialIcons name="check-circle" size={24} color={Colors.primary} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Score */}
        {selectedOpponent && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Score</Text>
            
            {/* Player Names Header */}
            <View style={styles.playersHeader}>
              <View style={styles.playerHeaderSide}>
                <Text style={styles.playerLabel}>You</Text>
              </View>
              <View style={styles.playerHeaderSide}>
                <Text style={styles.playerLabel}>
                  {selectedFriend?.friend.displayName?.split(' ')[0] || 'Opponent'}
                </Text>
              </View>
            </View>

            {/* Sets */}
            {sets.map((set, index) => {
              const setWinner = set.teamAScore > set.teamBScore ? 'A' : set.teamBScore > set.teamAScore ? 'B' : null;
              return (
                <View key={index} style={styles.setCard}>
                  <Text style={styles.setHeader}>Set {index + 1}</Text>
                  <View style={styles.setScoreRow}>
                    <View style={styles.scoreColumn}>
                      <View style={styles.scoreControl}>
                        <Pressable 
                          style={styles.scoreButton}
                          onPress={() => updateSetScore(index, 'A', -1)}
                        >
                          <MaterialIcons name="remove" size={20} color={Colors.textPrimary} />
                        </Pressable>
                        <Text style={styles.scoreValue}>{set.teamAScore}</Text>
                        <Pressable 
                          style={styles.scoreButton}
                          onPress={() => updateSetScore(index, 'A', 1)}
                        >
                          <MaterialIcons name="add" size={20} color={Colors.textPrimary} />
                        </Pressable>
                      </View>
                      {setWinner === 'A' && (
                        <MaterialIcons name="check-circle" size={16} color={Colors.success} style={styles.setWinnerIcon} />
                      )}
                    </View>

                    <Text style={styles.scoreDivider}>–</Text>

                    <View style={styles.scoreColumn}>
                      <View style={styles.scoreControl}>
                        <Pressable 
                          style={styles.scoreButton}
                          onPress={() => updateSetScore(index, 'B', -1)}
                        >
                          <MaterialIcons name="remove" size={20} color={Colors.textPrimary} />
                        </Pressable>
                        <Text style={styles.scoreValue}>{set.teamBScore}</Text>
                        <Pressable 
                          style={styles.scoreButton}
                          onPress={() => updateSetScore(index, 'B', 1)}
                        >
                          <MaterialIcons name="add" size={20} color={Colors.textPrimary} />
                        </Pressable>
                      </View>
                      {setWinner === 'B' && (
                        <MaterialIcons name="check-circle" size={16} color={Colors.success} style={styles.setWinnerIcon} />
                      )}
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Add Set Button */}
            {sets.length < 3 && (
              <Pressable style={styles.addSetButton} onPress={addSet}>
                <MaterialIcons name="add" size={20} color={Colors.primary} />
                <Text style={styles.addSetText}>Add Set</Text>
              </Pressable>
            )}

            {/* Match Summary */}
            {sets.length > 0 && (
              <View style={styles.matchSummary}>
                <Text style={styles.matchSummaryLabel}>Current Result:</Text>
                <Text style={styles.matchSummaryValue}>
                  You {matchState.setsWonA} – {matchState.setsWonB} Opponent
                </Text>
              </View>
            )}
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Button
          title={sets.length > 0 ? matchState.submitMessage : 'Submit Match'}
          onPress={handleSubmit}
          fullWidth
          disabled={submitting || !matchState.canSubmit || !selectedOpponent}
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
  headerTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  description: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
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
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sportChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sportChipText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
  },
  sportChipTextSelected: {
    fontWeight: Typography.weights.semibold,
  },
  sportIcon: {
    width: 16,
    height: 16,
  },
  sportIconInactive: {
    opacity: 0.5,
  },
  typeCards: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  typeCardSelected: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  typeCardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  typeCardTitleSelected: {
    color: Colors.primary,
  },
  typeCardHelper: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  typeCardHelperSelected: {
    color: Colors.textMuted,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
  },
  helperText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  friendsList: {
    gap: Spacing.sm,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  friendCardSelected: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  friendHandle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  playersHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playerHeaderSide: {
    flex: 1,
    alignItems: 'center',
  },
  playerLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  setCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  setHeader: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  setScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  scoreControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  scoreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    minWidth: 48,
    textAlign: 'center',
  },
  scoreDivider: {
    fontSize: Typography.sizes.xl,
    color: Colors.textMuted,
    fontWeight: Typography.weights.bold,
  },
  setWinnerIcon: {
    marginTop: Spacing.xs,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  addSetText: {
    fontSize: Typography.sizes.sm,
    color: Colors.primary,
    fontWeight: Typography.weights.medium,
  },
  matchSummary: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  matchSummaryLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    fontWeight: Typography.weights.medium,
  },
  matchSummaryValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  errorText: {
    color: Colors.danger,
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
});
