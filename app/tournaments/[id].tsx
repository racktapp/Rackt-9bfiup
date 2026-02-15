import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { Button, UserAvatar, UserName, ScreenLoader, ErrorState } from '@/components';
import { tournamentsService } from '@/services/tournaments';
import { Tournament } from '@/types';
import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

export default function TournamentDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [userId, setUserId] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserId();
  }, []);

  useEffect(() => {
    if (userId && id) {
      loadTournament();
    }
  }, [userId, id]);

  const loadUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const loadTournament = async () => {
    if (!id || typeof id !== 'string') return;

    try {
      setError(null);
      const data = await tournamentsService.getTournamentById(id);
      setTournament(data);
    } catch (err: any) {
      console.error('Error loading tournament:', err);
      setError(err.message || 'Failed to load tournament');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStateChange = async (newState: Tournament['state']) => {
    if (!tournament) return;

    try {
      await tournamentsService.updateTournamentState(tournament.id, newState);
      setTournament({ ...tournament, state: newState });
    } catch (err: any) {
      console.error('Error updating tournament:', err);
      setError(err.message || 'Failed to update tournament');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Tournament</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScreenLoader message="Loading tournament..." />
      </View>
    );
  }

  if (error || !tournament) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Tournament</Text>
          <View style={{ width: 24 }} />
        </View>
        <ErrorState message={error || 'Tournament not found'} onRetry={loadTournament} />
      </View>
    );
  }

  const isCreator = userId === tournament.createdByUserId;
  const canEdit = isCreator && (tournament.state === 'draft' || tournament.state === 'inviting');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Tournament</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Tournament Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Image
              source={tournament.sport === 'tennis' 
                ? require('@/assets/icons/tennis_icon.png')
                : require('@/assets/icons/padel_icon.png')
              }
              style={styles.sportIconLarge}
              contentFit="contain"
              transition={0}
            />
            <View style={styles.infoHeaderText}>
              <Text style={styles.tournamentTitle}>{tournament.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  {tournament.type === 'americano' ? 'Americano' : 'Normal'}
                </Text>
                <Text style={styles.metaDivider}>•</Text>
                <Text style={styles.metaText}>
                  {tournament.mode === 'singles' ? 'Singles' : 'Doubles'}
                </Text>
                {tournament.isCompetitive && (
                  <>
                    <Text style={styles.metaDivider}>•</Text>
                    <MaterialIcons name="star" size={14} color={Colors.accentGold} />
                    <Text style={[styles.metaText, { color: Colors.accentGold }]}>
                      Competitive
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>

          <View style={styles.stateChip}>
            <Text style={styles.stateChipText}>
              {tournament.state.charAt(0).toUpperCase() + tournament.state.slice(1).replace('_', ' ')}
            </Text>
          </View>
        </View>

        {/* Participants */}
        <View style={styles.participantsCard}>
          <Text style={styles.cardTitle}>
            Participants ({tournament.participants.length})
          </Text>
          <View style={styles.participantsList}>
            {tournament.participants.map((participant) => (
              <View key={participant.userId} style={styles.participantRow}>
                <UserAvatar
                  name={participant.displayName}
                  avatarUrl={participant.avatarUrl}
                  size={40}
                />
                <UserName
                  profile={{
                    id: participant.userId,
                    displayName: participant.displayName,
                    username: participant.username,
                  }}
                  displayNameStyle={styles.participantName}
                />
                {participant.userId === tournament.createdByUserId && (
                  <View style={styles.creatorBadge}>
                    <Text style={styles.creatorBadgeText}>Creator</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Content based on state */}
        {tournament.state === 'draft' && isCreator && (
          <View style={styles.actionsCard}>
            <Text style={styles.helperText}>
              Your tournament is in draft mode. Invite players to get started.
            </Text>
            <Button
              title="Invite Players"
              onPress={() => {/* TODO: Implement invite flow */}}
              fullWidth
              variant="secondary"
              icon={<MaterialIcons name="person-add" size={20} color={Colors.textPrimary} />}
            />
            <Button
              title="Start Inviting"
              onPress={() => handleStateChange('inviting')}
              fullWidth
            />
          </View>
        )}

        {tournament.state === 'inviting' && isCreator && (
          <View style={styles.actionsCard}>
            <Text style={styles.helperText}>
              Waiting for players to accept invites. Once ready, lock the tournament to finalize participants.
            </Text>
            <Button
              title="Invite More Players"
              onPress={() => {/* TODO: Implement invite flow */}}
              fullWidth
              variant="secondary"
              icon={<MaterialIcons name="person-add" size={20} color={Colors.textPrimary} />}
            />
            <Button
              title="Lock Tournament"
              onPress={() => handleStateChange('locked')}
              fullWidth
            />
          </View>
        )}

        {tournament.state === 'locked' && isCreator && (
          <View style={styles.actionsCard}>
            <Text style={styles.helperText}>
              Tournament is locked. Ready to generate matches and start playing?
            </Text>
            <Button
              title="Start Tournament"
              onPress={() => handleStateChange('in_progress')}
              fullWidth
            />
          </View>
        )}

        {tournament.state === 'in_progress' && (
          <View style={styles.placeholderCard}>
            <MaterialIcons name="sports-tennis" size={48} color={Colors.textMuted} />
            <Text style={styles.placeholderTitle}>Matches & Rounds</Text>
            <Text style={styles.placeholderText}>
              Tournament is in progress. Match scheduling and results will appear here.
            </Text>
          </View>
        )}

        {tournament.state === 'completed' && (
          <View style={styles.placeholderCard}>
            <MaterialIcons name="emoji-events" size={48} color={Colors.accentGold} />
            <Text style={styles.placeholderTitle}>Final Results</Text>
            <Text style={styles.placeholderText}>
              Tournament completed. Final standings and results will appear here.
            </Text>
          </View>
        )}
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
    fontSize: Typography.sizes.xl,
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
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  infoHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  sportIconLarge: {
    width: 48,
    height: 48,
  },
  infoHeaderText: {
    flex: 1,
    gap: Spacing.xs,
  },
  tournamentTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  metaDivider: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  stateChip: {
    backgroundColor: Colors.primary + '20',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  stateChipText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.primary,
  },
  participantsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  participantsList: {
    gap: Spacing.md,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  participantName: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.medium,
    color: Colors.textPrimary,
  },
  creatorBadge: {
    backgroundColor: Colors.primary + '20',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  creatorBadgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    color: Colors.primary,
  },
  actionsCard: {
    gap: Spacing.md,
  },
  helperText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  placeholderCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  placeholderTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
  },
  placeholderText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
