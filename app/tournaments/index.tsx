import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { Button, ScreenLoader, EmptyState, ErrorState } from '@/components';
import { tournamentsService } from '@/services/tournaments';
import { Tournament } from '@/types';
import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

export default function TournamentsHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
  const [completedTournaments, setCompletedTournaments] = useState<Tournament[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserId();
  }, []);

  useEffect(() => {
    if (userId) {
      loadTournaments();
    }
  }, [userId]);

  const loadUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const loadTournaments = async () => {
    if (!userId) return;
    try {
      setError(null);
      const { active, completed } = await tournamentsService.listTournamentsForUser(userId);
      setActiveTournaments(active);
      setCompletedTournaments(completed);
    } catch (err: any) {
      console.error('Error loading tournaments:', err);
      setError(err.message || 'Failed to load tournaments');
    } finally {
      setIsLoadingInitial(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTournaments();
    setRefreshing(false);
  }, [userId]);

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

  const renderTournamentCard = (tournament: Tournament) => (
    <Pressable
      key={tournament.id}
      style={styles.tournamentCard}
      onPress={() => router.push(`/tournaments/${tournament.id}`)}
    >
      <View style={styles.tournamentHeader}>
        <View style={styles.tournamentTitleRow}>
          <Image
            source={tournament.sport === 'tennis' 
              ? require('@/assets/icons/tennis_icon.png')
              : require('@/assets/icons/padel_icon.png')
            }
            style={styles.sportIcon}
            contentFit="contain"
            transition={0}
          />
          <Text style={styles.tournamentTitle} numberOfLines={1}>
            {tournament.title}
          </Text>
        </View>
        <View style={[styles.stateBadge, { backgroundColor: getStateColor(tournament.state) + '20' }]}>
          <Text style={[styles.stateBadgeText, { color: getStateColor(tournament.state) }]}>
            {getStateLabel(tournament.state)}
          </Text>
        </View>
      </View>

      <View style={styles.tournamentMeta}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>
            {tournament.type === 'americano' ? 'Americano' : 'Normal'}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>
            {tournament.mode === 'singles' ? 'Singles' : 'Doubles'}
          </Text>
        </View>
        {tournament.isCompetitive && (
          <View style={[styles.metaChip, styles.competitiveChip]}>
            <MaterialIcons name="star" size={12} color={Colors.accentGold} />
            <Text style={[styles.metaChipText, { color: Colors.accentGold }]}>
              Competitive
            </Text>
          </View>
        )}
      </View>

      <View style={styles.tournamentFooter}>
        <View style={styles.participantsInfo}>
          <MaterialIcons name="people" size={16} color={Colors.textMuted} />
          <Text style={styles.participantsText}>
            {tournament.participants.length} {tournament.participants.length === 1 ? 'player' : 'players'}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
      </View>
    </Pressable>
  );

  if (isLoadingInitial) {
    return <ScreenLoader message="Loading tournaments..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadTournaments} />;
  }

  return (
    <View style={styles.container}>
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
        {/* Active Tournaments */}
        {activeTournaments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active</Text>
            <View style={styles.tournamentsList}>
              {activeTournaments.map(renderTournamentCard)}
            </View>
          </View>
        )}

        {/* Completed Tournaments */}
        {completedTournaments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completed</Text>
            <View style={styles.tournamentsList}>
              {completedTournaments.map(renderTournamentCard)}
            </View>
          </View>
        )}

        {/* Empty State */}
        {activeTournaments.length === 0 && completedTournaments.length === 0 && (
          <EmptyState
            icon="🏆"
            title="No Tournaments Yet"
            subtitle="Create your first tournament to start competing"
          />
        )}

        {/* Create Tournament Button */}
        <Button
          title="Create Tournament"
          onPress={() => router.push('/tournaments/create')}
          fullWidth
          icon={<MaterialIcons name="add" size={20} color={Colors.textPrimary} />}
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
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
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
  tournamentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tournamentTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sportIcon: {
    width: 20,
    height: 20,
  },
  tournamentTitle: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: Colors.textPrimary,
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
  tournamentMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  metaChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  competitiveChip: {
    backgroundColor: Colors.accentGold + '20',
  },
  metaChipText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  tournamentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  participantsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  participantsText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
});
