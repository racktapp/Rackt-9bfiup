import { getSupabaseClient } from '@/template';
import { Tournament, TournamentParticipant, TournamentInvite } from '@/types';
import { Sport } from '@/constants/config';

const supabase = getSupabaseClient();

export const tournamentsService = {
  async createTournament(data: {
    title: string;
    sport: Sport;
    type: 'americano' | 'normal';
    format?: 'groups_playoffs';
    mode: 'singles' | 'doubles';
    isCompetitive: boolean;
    groupId?: string | null;
    settings?: any;
  }): Promise<Tournament> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get user profile to add as first participant
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', user.id)
      .single();

    const participant: TournamentParticipant = {
      userId: user.id,
      displayName: profile?.display_name || profile?.username || 'Unknown',
      username: profile?.username || '',
      avatarUrl: profile?.avatar_url || null,
      joinedAt: new Date().toISOString(),
      seed: null,
    };

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .insert({
        created_by_user_id: user.id,
        title: data.title,
        sport: data.sport,
        type: data.type,
        format: data.format || null,
        mode: data.mode,
        is_competitive: data.isCompetitive,
        state: 'draft',
        group_id: data.groupId || null,
        settings: data.settings || {},
        participants: [participant],
      })
      .select()
      .single();

    if (error) throw error;

    return this.mapTournament(tournament);
  },

  async getTournamentById(tournamentId: string): Promise<Tournament> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (error) throw error;
    return this.mapTournament(data);
  },

  async listTournamentsForUser(userId: string): Promise<{ active: Tournament[]; completed: Tournament[] }> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .or(`created_by_user_id.eq.${userId},participants.cs.[{"userId":"${userId}"}]`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const tournaments = (data || []).map(this.mapTournament);
    
    const active = tournaments.filter(t => 
      t.state === 'draft' || t.state === 'inviting' || t.state === 'locked' || t.state === 'in_progress'
    );
    
    const completed = tournaments.filter(t => t.state === 'completed');

    return { active, completed };
  },

  async updateTournamentState(tournamentId: string, state: Tournament['state']): Promise<void> {
    const { error } = await supabase
      .from('tournaments')
      .update({ 
        state,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tournamentId);

    if (error) throw error;
  },

  async updateTournament(tournamentId: string, updates: Partial<Tournament>): Promise<void> {
    const dbUpdates: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.sport !== undefined) dbUpdates.sport = updates.sport;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.format !== undefined) dbUpdates.format = updates.format;
    if (updates.mode !== undefined) dbUpdates.mode = updates.mode;
    if (updates.isCompetitive !== undefined) dbUpdates.is_competitive = updates.isCompetitive;
    if (updates.state !== undefined) dbUpdates.state = updates.state;
    if (updates.settings !== undefined) dbUpdates.settings = updates.settings;
    if (updates.participants !== undefined) dbUpdates.participants = updates.participants;

    const { error } = await supabase
      .from('tournaments')
      .update(dbUpdates)
      .eq('id', tournamentId);

    if (error) throw error;
  },

  async inviteUsersToTournament(tournamentId: string, userIds: string[]): Promise<TournamentInvite[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const invites = userIds.map(userId => ({
      tournament_id: tournamentId,
      invited_user_id: userId,
      invited_by_user_id: user.id,
      status: 'pending' as const,
    }));

    const { data, error } = await supabase
      .from('tournament_invites')
      .insert(invites)
      .select();

    if (error) throw error;

    return (data || []).map(this.mapInvite);
  },

  async getPendingInvitesForUser(userId: string): Promise<TournamentInvite[]> {
    const { data, error } = await supabase
      .from('tournament_invites')
      .select(`
        *,
        invitedUser:invited_user_id (id, username, display_name, avatar_url),
        invitedByUser:invited_by_user_id (id, username, display_name, avatar_url)
      `)
      .eq('invited_user_id', userId)
      .eq('status', 'pending');

    if (error) throw error;

    return (data || []).map(this.mapInvite);
  },

  async respondToInvite(inviteId: string, accept: boolean): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const newStatus = accept ? 'accepted' : 'declined';

    const { error: updateError } = await supabase
      .from('tournament_invites')
      .update({ status: newStatus })
      .eq('id', inviteId)
      .eq('invited_user_id', user.id);

    if (updateError) throw updateError;

    if (accept) {
      // Get invite details
      const { data: invite } = await supabase
        .from('tournament_invites')
        .select('tournament_id')
        .eq('id', inviteId)
        .single();

      if (!invite) throw new Error('Invite not found');

      // Get user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      // Get current tournament
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('participants')
        .eq('id', invite.tournament_id)
        .single();

      if (!tournament) throw new Error('Tournament not found');

      const newParticipant: TournamentParticipant = {
        userId: user.id,
        displayName: profile?.display_name || profile?.username || 'Unknown',
        username: profile?.username || '',
        avatarUrl: profile?.avatar_url || null,
        joinedAt: new Date().toISOString(),
        seed: null,
      };

      const updatedParticipants = [...(tournament.participants || []), newParticipant];

      // Update tournament with new participant
      const { error: tournamentError } = await supabase
        .from('tournaments')
        .update({ 
          participants: updatedParticipants,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invite.tournament_id);

      if (tournamentError) throw tournamentError;
    }
  },

  mapTournament(raw: any): Tournament {
    return {
      id: raw.id,
      createdByUserId: raw.created_by_user_id,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      title: raw.title,
      sport: raw.sport,
      type: raw.type,
      format: raw.format,
      mode: raw.mode,
      isCompetitive: raw.is_competitive,
      state: raw.state,
      groupId: raw.group_id,
      participants: raw.participants || [],
      settings: raw.settings || {},
    };
  },

  mapInvite(raw: any): TournamentInvite {
    return {
      id: raw.id,
      tournamentId: raw.tournament_id,
      invitedUserId: raw.invited_user_id,
      invitedByUserId: raw.invited_by_user_id,
      status: raw.status,
      createdAt: raw.created_at,
      invitedUser: raw.invitedUser,
      invitedByUser: raw.invitedByUser,
    };
  },
};
