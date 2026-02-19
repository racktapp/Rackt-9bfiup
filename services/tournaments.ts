import { getSupabaseClient } from '@/template';
import { 
  Tournament, 
  TournamentParticipant, 
  TournamentInvite,
  TournamentGroup,
  TournamentMatch,
  TournamentTeam,
  TournamentStanding,
  AmericanoRound,
  AmericanoLeaderboardEntry
} from '@/types';
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

  async getTournamentById(tournamentId: string, retries: number = 3): Promise<Tournament> {
    console.log(`[getTournamentById] Fetching tournament: ${tournamentId}, retries left: ${retries}`);
    
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('[getTournamentById] ERROR:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        tournamentId,
      });
      
      // If no rows returned and we have retries left, wait and retry
      // This handles RLS propagation delays after accepting invites
      if (error.code === 'PGRST116' && retries > 0) {
        console.log(`[getTournamentById] No rows returned, retrying in 300ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 300));
        return this.getTournamentById(tournamentId, retries - 1);
      }
      
      throw error;
    }
    
    console.log('[getTournamentById] SUCCESS:', {
      id: data.id,
      title: data.title,
      state: data.state,
      participantCount: data.participants?.length || 0,
    });
    
    return this.mapTournament(data);
  },

  async listTournamentsForUser(userId: string): Promise<{ active: Tournament[]; completed: Tournament[] }> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .or(`created_by_user_id.eq.${userId},participants.cs.[{"userId":"${userId}"}]`)
      .is('deleted_at', null)  // Filter out soft-deleted tournaments
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

  async getPendingInvitesForUser(userId: string): Promise<(TournamentInvite & { tournament?: Tournament })[]> {
    const { data, error } = await supabase
      .from('tournament_invites')
      .select(`
        id,
        tournament_id,
        invited_user_id,
        invited_by_user_id,
        status,
        created_at,
        tournament:tournament_id(*),
        invitedUser:invited_user_id(id, username, display_name, avatar_url),
        invitedByUser:invited_by_user_id(id, username, display_name, avatar_url)
      `)
      .eq('invited_user_id', userId)
      .eq('status', 'pending');

    if (error) throw error;

    return (data || []).map(raw => ({
      ...this.mapInvite(raw),
      tournament: raw.tournament ? this.mapTournament(raw.tournament) : undefined,
    }));
  },

  async respondToInvite(inviteId: string, accept: boolean): Promise<{ tournamentId?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    console.log(`[respondToInvite] START - inviteId=${inviteId}, userId=${user.id}, accept=${accept}`);

    // STEP 1: Get invite details to validate
    console.log('[respondToInvite] STEP 1: Fetching invite...');
    const { data: invite, error: inviteReadError } = await supabase
      .from('tournament_invites')
      .select('id, tournament_id, invited_user_id, status')
      .eq('id', inviteId)
      .single();

    if (inviteReadError || !invite) {
      console.error('[respondToInvite] ERROR - Invite not found:', {
        error: inviteReadError,
        message: inviteReadError?.message,
        code: inviteReadError?.code,
      });
      throw new Error('Invite not found or has been deleted');
    }

    console.log('[respondToInvite] Invite data:', invite);

    // STEP 2: Validate permissions
    if (invite.invited_user_id !== user.id) {
      console.error('[respondToInvite] ERROR - Permission denied:', {
        invitedUserId: invite.invited_user_id,
        currentUserId: user.id,
      });
      throw new Error('You are not authorized to respond to this invite');
    }

    if (invite.status !== 'pending') {
      console.error(`[respondToInvite] ERROR - Invite already ${invite.status}`);
      throw new Error(`This invite has already been ${invite.status}`);
    }

    // STEP 3: Verify tournament exists and is valid
    console.log('[respondToInvite] STEP 3: Fetching tournament...');
    const { data: tournamentCheck, error: tournamentCheckError } = await supabase
      .from('tournaments')
      .select('id, state, participants, created_by_user_id, title, deleted_at')
      .eq('id', invite.tournament_id)
      .single();

    if (tournamentCheckError || !tournamentCheck) {
      console.error('[respondToInvite] ERROR - Tournament not found:', {
        error: tournamentCheckError,
        message: tournamentCheckError?.message,
        code: tournamentCheckError?.code,
        tournamentId: invite.tournament_id,
      });
      
      // Mark invite as expired
      console.log('[respondToInvite] Marking invite as expired...');
      await supabase
        .from('tournament_invites')
        .update({ status: 'expired' })
        .eq('id', inviteId);
      
      throw new Error('This tournament no longer exists or has been deleted');
    }

    console.log('[respondToInvite] Tournament data:', {
      id: tournamentCheck.id,
      title: tournamentCheck.title,
      state: tournamentCheck.state,
      participantCount: tournamentCheck.participants?.length || 0,
      creatorId: tournamentCheck.created_by_user_id,
      deletedAt: tournamentCheck.deleted_at,
    });

    // Check if tournament is soft-deleted
    if (tournamentCheck.deleted_at) {
      console.error('[respondToInvite] ERROR - Tournament deleted at:', tournamentCheck.deleted_at);
      
      // Mark invite as expired
      await supabase
        .from('tournament_invites')
        .update({ status: 'expired' })
        .eq('id', inviteId);
      
      throw new Error('This tournament has been deleted');
    }

    if (tournamentCheck.state === 'completed') {
      console.error('[respondToInvite] ERROR - Tournament completed');
      throw new Error('This tournament has already completed');
    }

    const newStatus = accept ? 'accepted' : 'declined';

    if (accept) {
      // STEP 4: Get user profile
      console.log('[respondToInvite] STEP 4: Fetching user profile...');
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('[respondToInvite] ERROR - Failed to fetch profile:', profileError);
        throw new Error('Failed to load your profile. Please try again.');
      }

      console.log('[respondToInvite] Profile data:', profile);

      const newParticipant: TournamentParticipant = {
        userId: user.id,
        displayName: profile?.display_name || profile?.username || 'Unknown',
        username: profile?.username || '',
        avatarUrl: profile?.avatar_url || null,
        joinedAt: new Date().toISOString(),
        seed: null,
      };

      // STEP 5: Check if user already in participants
      const alreadyParticipant = tournamentCheck.participants?.some(
        (p: TournamentParticipant) => p.userId === user.id
      );

      if (alreadyParticipant) {
        console.log('[respondToInvite] User already a participant, just updating invite status');
        
        // Just update invite status
        const { error: updateError } = await supabase
          .from('tournament_invites')
          .update({ status: newStatus })
          .eq('id', inviteId);

        if (updateError) {
          console.error('[respondToInvite] ERROR - Failed to update invite:', updateError);
          throw new Error('Failed to update invite status');
        }
        
        console.log('[respondToInvite] SUCCESS - Already participant, invite updated');
        return { tournamentId: invite.tournament_id };
      }

      const updatedParticipants = [...(tournamentCheck.participants || []), newParticipant];

      console.log('[respondToInvite] STEP 6: Adding user to tournament participants...');
      console.log('[respondToInvite] New participant count:', updatedParticipants.length);

      // ATOMIC UPDATE: Update tournament to add participant
      const { error: tournamentError } = await supabase
        .from('tournaments')
        .update({ 
          participants: updatedParticipants,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invite.tournament_id);

      if (tournamentError) {
        console.error('[respondToInvite] ERROR - Failed to add participant:', {
          error: tournamentError,
          message: tournamentError.message,
          code: tournamentError.code,
          details: tournamentError.details,
          hint: tournamentError.hint,
        });
        throw new Error(`Failed to join tournament: ${tournamentError.message || 'Unknown error'}`);
      }

      console.log('[respondToInvite] SUCCESS - User added to tournament');

      // STEP 7: Update invite status
      console.log('[respondToInvite] STEP 7: Updating invite status...');
      const { error: updateError } = await supabase
        .from('tournament_invites')
        .update({ status: newStatus })
        .eq('id', inviteId);

      if (updateError) {
        console.error('[respondToInvite] WARNING - Failed to update invite status:', updateError);
        // Non-critical error - user is already added to tournament
      } else {
        console.log('[respondToInvite] SUCCESS - Invite status updated');
      }

      console.log('[respondToInvite] COMPLETE - Successfully joined tournament');
      
      return { tournamentId: invite.tournament_id };
    } else {
      // Declining invite - just update status
      console.log('[respondToInvite] STEP 6: Declining invite, updating status...');
      const { error: updateError } = await supabase
        .from('tournament_invites')
        .update({ status: newStatus })
        .eq('id', inviteId);

      if (updateError) {
        console.error('[respondToInvite] ERROR - Failed to decline invite:', updateError);
        throw new Error('Failed to decline invite');
      }
      
      console.log('[respondToInvite] COMPLETE - Invite declined');
      return {};
    }
  },

  validateTournamentForLocking(tournament: Tournament): { valid: boolean; message: string } {
    const count = tournament.participants.length;
    const { type, mode } = tournament;

    // Singles normal: min 4
    if (mode === 'singles' && type === 'normal') {
      if (count < 4) {
        return { valid: false, message: 'Singles Normal tournaments require at least 4 players' };
      }
    }

    // Doubles americano: min 4 and even
    if (mode === 'doubles' && type === 'americano') {
      if (count < 4) {
        return { valid: false, message: 'Doubles Americano tournaments require at least 4 players' };
      }
      if (count % 2 !== 0) {
        return { valid: false, message: 'Doubles Americano tournaments require an even number of players' };
      }
    }

    // Doubles normal: min 4
    if (mode === 'doubles' && type === 'normal') {
      if (count < 4) {
        return { valid: false, message: 'Doubles Normal tournaments require at least 4 players' };
      }
    }

    return { valid: true, message: '' };
  },

  async deleteTournament(tournamentId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    console.log(`[deleteTournament] START - tournamentId=${tournamentId}, userId=${user.id}`);

    // STEP 1: Verify user is creator
    console.log('[deleteTournament] STEP 1: Verifying creator permissions...');
    const { data: tournament, error: fetchError } = await supabase
      .from('tournaments')
      .select('created_by_user_id, state, title')
      .eq('id', tournamentId)
      .single();

    if (fetchError || !tournament) {
      console.error('[deleteTournament] ERROR - Tournament not found:', {
        error: fetchError,
        message: fetchError?.message,
        code: fetchError?.code,
      });
      throw new Error('Tournament not found');
    }

    console.log('[deleteTournament] Tournament data:', {
      id: tournamentId,
      title: tournament.title,
      state: tournament.state,
      creatorId: tournament.created_by_user_id,
      currentUserId: user.id,
    });

    if (tournament.created_by_user_id !== user.id) {
      console.error('[deleteTournament] ERROR - Permission denied:', {
        creatorId: tournament.created_by_user_id,
        currentUserId: user.id,
      });
      throw new Error('Only the tournament creator can delete this tournament');
    }

    console.log(`[deleteTournament] STEP 2: Soft-deleting tournament: ${tournament.title}`);

    // Soft delete: set deleted_at timestamp instead of changing state
    // This preserves data integrity and allows recovery if needed
    const { error: deleteError } = await supabase
      .from('tournaments')
      .update({ 
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tournamentId);

    if (deleteError) {
      console.error('[deleteTournament] ERROR - Failed to delete tournament:', {
        error: deleteError,
        message: deleteError.message,
        code: deleteError.code,
        details: deleteError.details,
        hint: deleteError.hint,
      });
      throw new Error(`Failed to delete tournament: ${deleteError.message || 'Unknown error'}`);
    }

    console.log('[deleteTournament] SUCCESS - Tournament soft-deleted (deleted_at set)');

    // STEP 3: Mark all related invites as expired
    console.log('[deleteTournament] STEP 3: Expiring pending invites...');
    const { error: inviteError } = await supabase
      .from('tournament_invites')
      .update({ status: 'expired' })
      .eq('tournament_id', tournamentId)
      .eq('status', 'pending');

    if (inviteError) {
      console.error('[deleteTournament] WARNING - Failed to expire invites:', inviteError);
      // Non-critical - tournament is already deleted
    } else {
      console.log('[deleteTournament] SUCCESS - Pending invites expired');
    }

    console.log('[deleteTournament] COMPLETE - Tournament deleted successfully');
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

  // Normal tournament generation
  async generateNormalTournament(tournamentId: string): Promise<void> {
    const tournament = await this.getTournamentById(tournamentId);
    
    if (tournament.type !== 'normal') {
      throw new Error('Can only generate normal tournaments');
    }

    if (tournament.state !== 'locked') {
      throw new Error('Tournament must be locked before generation');
    }

    const playerCount = tournament.participants.length;

    // Determine group count
    let groupCount = 1;
    if (playerCount >= 8 && playerCount <= 11) groupCount = 2;
    else if (playerCount >= 12) groupCount = 4;

    // Create groups and distribute players
    const groups: TournamentGroup[] = [];
    const playersPerGroup = Math.floor(playerCount / groupCount);
    const remainder = playerCount % groupCount;

    let participantIndex = 0;
    for (let i = 0; i < groupCount; i++) {
      const groupSize = playersPerGroup + (i < remainder ? 1 : 0);
      const groupParticipants = tournament.participants.slice(participantIndex, participantIndex + groupSize);
      participantIndex += groupSize;

      const { data: group } = await supabase
        .from('tournament_groups')
        .insert({
          tournament_id: tournamentId,
          name: `Group ${String.fromCharCode(65 + i)}`,
          group_index: i,
          participants: groupParticipants,
        })
        .select()
        .single();

      if (group) {
        groups.push(this.mapGroup(group));
      }
    }

    // Generate round-robin matches for each group
    for (const group of groups) {
      await this.generateGroupMatches(tournament, group);
    }

    // Update tournament state
    await this.updateTournamentState(tournamentId, 'in_progress');
  },

  async generateGroupMatches(tournament: Tournament, group: TournamentGroup): Promise<void> {
    const participants = group.participants;
    const matches: any[] = [];

    if (tournament.mode === 'singles') {
      // Round-robin singles
      for (let i = 0; i < participants.length; i++) {
        for (let j = i + 1; j < participants.length; j++) {
          matches.push({
            tournament_id: tournament.id,
            stage: 'group',
            group_id: group.id,
            round_index: matches.length,
            team_a: { memberUserIds: [participants[i].userId], members: [participants[i]] },
            team_b: { memberUserIds: [participants[j].userId], members: [participants[j]] },
            score: [],
            status: 'pending',
            confirmed_by_user_ids: [],
            winner: null,
          });
        }
      }
    } else {
      // Doubles: create pairs from participant list order
      const teams: TournamentTeam[] = [];
      for (let i = 0; i < participants.length; i += 2) {
        if (i + 1 < participants.length) {
          teams.push({
            memberUserIds: [participants[i].userId, participants[i + 1].userId],
            members: [participants[i], participants[i + 1]],
          });
        }
      }

      // Round-robin doubles
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          matches.push({
            tournament_id: tournament.id,
            stage: 'group',
            group_id: group.id,
            round_index: matches.length,
            team_a: teams[i],
            team_b: teams[j],
            score: [],
            status: 'pending',
            confirmed_by_user_ids: [],
            winner: null,
          });
        }
      }
    }

    if (matches.length > 0) {
      await supabase.from('tournament_matches').insert(matches);
    }
  },

  async getGroupsByTournament(tournamentId: string): Promise<TournamentGroup[]> {
    const { data, error } = await supabase
      .from('tournament_groups')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('group_index', { ascending: true });

    if (error) throw error;
    return (data || []).map(this.mapGroup);
  },

  async getMatchesByTournament(tournamentId: string, stage?: 'group' | 'playoff'): Promise<TournamentMatch[]> {
    let query = supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId);

    if (stage) {
      query = query.eq('stage', stage);
    }

    const { data, error } = await query.order('round_index', { ascending: true });

    if (error) throw error;
    return (data || []).map(this.mapMatch);
  },

  async getMatchesByGroup(groupId: string): Promise<TournamentMatch[]> {
    const { data, error } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('group_id', groupId)
      .order('round_index', { ascending: true });

    if (error) throw error;
    return (data || []).map(this.mapMatch);
  },

  async submitMatchScore(matchId: string, score: Array<{ a: number; b: number }>, winner: 'A' | 'B'): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        score,
        winner,
        status: 'submitted',
        submitted_by_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    if (error) throw error;
  },

  async confirmMatch(matchId: string, forceConfirm: boolean = false): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: match } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (!match) throw new Error('Match not found');

    const confirmedBy = match.confirmed_by_user_ids || [];
    if (!confirmedBy.includes(user.id)) {
      confirmedBy.push(user.id);
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', match.tournament_id)
      .single();

    const isCreator = tournament?.created_by_user_id === user.id;

    let newStatus = match.status;
    if (forceConfirm && isCreator) {
      newStatus = 'confirmed';
    } else {
      // Check if all required confirmations received
      const teamAUserIds = match.team_a.memberUserIds || [];
      const teamBUserIds = match.team_b.memberUserIds || [];
      const allParticipants = [...teamAUserIds, ...teamBUserIds];
      
      const allConfirmed = allParticipants.every((userId: string) => confirmedBy.includes(userId));
      if (allConfirmed) {
        newStatus = 'confirmed';
      }
    }

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        confirmed_by_user_ids: confirmedBy,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    if (error) throw error;

    // Check if group stage complete and generate playoffs
    if (newStatus === 'confirmed' && match.stage === 'group') {
      await this.checkAndGeneratePlayoffs(match.tournament_id);
    }

    // Check if tournament complete
    if (newStatus === 'confirmed' && match.stage === 'playoff') {
      await this.checkTournamentCompletion(match.tournament_id);
    }
  },

  async checkAndGeneratePlayoffs(tournamentId: string): Promise<void> {
    const groups = await this.getGroupsByTournament(tournamentId);
    const allMatches = await this.getMatchesByTournament(tournamentId, 'group');
    
    // Check if all group matches confirmed
    const allConfirmed = allMatches.every(m => m.status === 'confirmed');
    if (!allConfirmed) return;

    // Check if playoffs already generated
    const playoffMatches = await this.getMatchesByTournament(tournamentId, 'playoff');
    if (playoffMatches.length > 0) return;

    const tournament = await this.getTournamentById(tournamentId);
    const advancePerGroup = tournament.settings?.groupsPlayoffs?.advancePerGroup || 2;

    // Get top teams from each group
    const qualifiedTeams: TournamentTeam[] = [];
    for (const group of groups) {
      const standings = await this.getGroupStandings(group.id);
      const topStandings = standings.slice(0, advancePerGroup);
      
      for (const standing of topStandings) {
        qualifiedTeams.push({
          memberUserIds: [standing.participant.userId],
          members: [standing.participant],
        });
      }
    }

    // Generate single-elimination bracket
    await this.generatePlayoffBracket(tournamentId, qualifiedTeams);
  },

  async generatePlayoffBracket(tournamentId: string, teams: TournamentTeam[]): Promise<void> {
    const matches: any[] = [];
    let roundIndex = 0;

    // Simple bracket: pair teams in order
    for (let i = 0; i < teams.length; i += 2) {
      if (i + 1 < teams.length) {
        matches.push({
          tournament_id: tournamentId,
          stage: 'playoff',
          group_id: null,
          round_index: roundIndex++,
          team_a: teams[i],
          team_b: teams[i + 1],
          score: [],
          status: 'pending',
          confirmed_by_user_ids: [],
          winner: null,
        });
      }
    }

    if (matches.length > 0) {
      await supabase.from('tournament_matches').insert(matches);
    }
  },

  async checkTournamentCompletion(tournamentId: string): Promise<void> {
    const playoffMatches = await this.getMatchesByTournament(tournamentId, 'playoff');
    const allConfirmed = playoffMatches.every(m => m.status === 'confirmed');
    
    if (allConfirmed && playoffMatches.length > 0) {
      // Find the final match (last round)
      const maxRound = Math.max(...playoffMatches.map(m => m.roundIndex));
      const finalMatch = playoffMatches.find(m => m.roundIndex === maxRound);
      
      if (finalMatch && finalMatch.winner) {
        await this.updateTournamentState(tournamentId, 'completed');
      }
    }
  },

  async getGroupStandings(groupId: string): Promise<TournamentStanding[]> {
    const matches = await this.getMatchesByGroup(groupId);
    const { data: group } = await supabase
      .from('tournament_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (!group) return [];

    const standings: Map<string, TournamentStanding> = new Map();

    // Initialize standings
    for (const participant of group.participants) {
      standings.set(participant.userId, {
        participant,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        setDiff: 0,
      });
    }

    // Calculate from confirmed matches
    for (const match of matches) {
      if (match.status !== 'confirmed' || !match.winner) continue;

      const teamAUserIds = match.teamA.memberUserIds;
      const teamBUserIds = match.teamB.memberUserIds;
      const setsA = match.score.reduce((sum, set) => sum + (set.a > set.b ? 1 : 0), 0);
      const setsB = match.score.reduce((sum, set) => sum + (set.b > set.a ? 1 : 0), 0);

      for (const userId of teamAUserIds) {
        const standing = standings.get(userId);
        if (standing) {
          if (match.winner === 'A') standing.wins++;
          else standing.losses++;
          standing.setsWon += setsA;
          standing.setsLost += setsB;
          standing.setDiff = standing.setsWon - standing.setsLost;
        }
      }

      for (const userId of teamBUserIds) {
        const standing = standings.get(userId);
        if (standing) {
          if (match.winner === 'B') standing.wins++;
          else standing.losses++;
          standing.setsWon += setsB;
          standing.setsLost += setsA;
          standing.setDiff = standing.setsWon - standing.setsLost;
        }
      }
    }

    // Sort by wins, then set diff
    return Array.from(standings.values()).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.setDiff - a.setDiff;
    });
  },

  mapGroup(raw: any): TournamentGroup {
    return {
      id: raw.id,
      tournamentId: raw.tournament_id,
      name: raw.name,
      groupIndex: raw.group_index,
      participants: raw.participants || [],
      createdAt: raw.created_at,
    };
  },

  mapMatch(raw: any): TournamentMatch {
    return {
      id: raw.id,
      tournamentId: raw.tournament_id,
      stage: raw.stage,
      groupId: raw.group_id,
      roundIndex: raw.round_index,
      teamA: raw.team_a,
      teamB: raw.team_b,
      score: raw.score || [],
      status: raw.status,
      submittedByUserId: raw.submitted_by_user_id,
      confirmedByUserIds: raw.confirmed_by_user_ids || [],
      winner: raw.winner,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  },

  // Americano tournament generation
  async generateAmericanoTournament(tournamentId: string): Promise<void> {
    const tournament = await this.getTournamentById(tournamentId);
    
    if (tournament.type !== 'americano') {
      throw new Error('Can only generate americano tournaments');
    }

    if (tournament.state !== 'locked') {
      throw new Error('Tournament must be locked before generation');
    }

    const playerCount = tournament.participants.length;

    // Must be even
    if (playerCount % 2 !== 0) {
      throw new Error('Americano tournaments require an even number of players');
    }

    // Calculate number of rounds (default min(6, participantCount - 1))
    const defaultRounds = Math.min(6, playerCount - 1);
    const roundCount = tournament.settings?.americano?.rounds || defaultRounds;
    const pointsToWin = tournament.settings?.americano?.pointsToWin || 21;

    // Generate rounds with rotation algorithm
    for (let roundNum = 0; roundNum < roundCount; roundNum++) {
      await this.generateAmericanoRound(tournament, roundNum, pointsToWin);
    }

    // Update tournament state
    await this.updateTournamentState(tournamentId, 'in_progress');
  },

  async generateAmericanoRound(tournament: Tournament, roundNum: number, pointsToWin: number): Promise<void> {
    const participants = [...tournament.participants];
    const matches: any[] = [];

    // Rotation algorithm: rotate list each round, pair adjacent, first half vs second half
    // Round 0: original order
    // Round 1+: rotate by roundNum positions
    if (roundNum > 0) {
      const rotated = participants.slice(roundNum).concat(participants.slice(0, roundNum));
      participants.splice(0, participants.length, ...rotated);
    }

    const half = Math.floor(participants.length / 2);
    const firstHalf = participants.slice(0, half);
    const secondHalf = participants.slice(half);

    // Create matches: first half vs second half
    for (let i = 0; i < firstHalf.length; i++) {
      // Pair adjacent in first half for team A
      const teamAIdx1 = i;
      const teamAIdx2 = (i + 1) % firstHalf.length;
      
      // Pair adjacent in second half for team B
      const teamBIdx1 = i;
      const teamBIdx2 = (i + 1) % secondHalf.length;

      const teamA: TournamentTeam = {
        memberUserIds: [firstHalf[teamAIdx1].userId, firstHalf[teamAIdx2].userId],
        members: [firstHalf[teamAIdx1], firstHalf[teamAIdx2]],
      };

      const teamB: TournamentTeam = {
        memberUserIds: [secondHalf[teamBIdx1].userId, secondHalf[teamBIdx2].userId],
        members: [secondHalf[teamBIdx1], secondHalf[teamBIdx2]],
      };

      matches.push({
        tournament_id: tournament.id,
        stage: 'group',  // Americano uses 'group' stage for all rounds
        group_id: null,
        round_index: roundNum,
        team_a: teamA,
        team_b: teamB,
        score: [],  // Will store [{a: pointsA, b: pointsB}]
        status: 'pending',
        confirmed_by_user_ids: [],
        winner: null,
      });
    }

    if (matches.length > 0) {
      await supabase.from('tournament_matches').insert(matches);
    }
  },

  async submitAmericanoMatchPoints(matchId: string, pointsA: number, pointsB: number): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const winner = pointsA > pointsB ? 'A' : pointsB > pointsA ? 'B' : null;

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        score: [{ a: pointsA, b: pointsB }],
        winner,
        status: 'submitted',
        submitted_by_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    if (error) throw error;
  },

  async getAmericanoLeaderboard(tournamentId: string): Promise<AmericanoLeaderboardEntry[]> {
    const tournament = await this.getTournamentById(tournamentId);
    const matches = await this.getMatchesByTournament(tournamentId);

    // Initialize leaderboard
    const leaderboard: Map<string, AmericanoLeaderboardEntry> = new Map();
    
    for (const participant of tournament.participants) {
      leaderboard.set(participant.userId, {
        participant,
        totalPointsFor: 0,
        totalPointsAgainst: 0,
        pointDiff: 0,
        matchesPlayed: 0,
        rank: 0,
      });
    }

    // Calculate from confirmed matches
    for (const match of matches) {
      if (match.status !== 'confirmed' || match.score.length === 0) continue;

      const pointsA = match.score[0].a;
      const pointsB = match.score[0].b;
      const teamAUserIds = match.teamA.memberUserIds;
      const teamBUserIds = match.teamB.memberUserIds;

      // Update Team A players
      for (const userId of teamAUserIds) {
        const entry = leaderboard.get(userId);
        if (entry) {
          entry.totalPointsFor += pointsA;
          entry.totalPointsAgainst += pointsB;
          entry.matchesPlayed++;
        }
      }

      // Update Team B players
      for (const userId of teamBUserIds) {
        const entry = leaderboard.get(userId);
        if (entry) {
          entry.totalPointsFor += pointsB;
          entry.totalPointsAgainst += pointsA;
          entry.matchesPlayed++;
        }
      }
    }

    // Calculate point diff and sort
    const sorted = Array.from(leaderboard.values()).map(entry => ({
      ...entry,
      pointDiff: entry.totalPointsFor - entry.totalPointsAgainst,
    })).sort((a, b) => {
      if (b.totalPointsFor !== a.totalPointsFor) {
        return b.totalPointsFor - a.totalPointsFor;
      }
      return b.pointDiff - a.pointDiff;
    });

    // Assign ranks
    sorted.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    return sorted;
  },

  // Dashboard summary helpers
  async getActiveTournamentForUser(userId: string): Promise<Tournament | null> {
    const { active } = await this.listTournamentsForUser(userId);
    
    if (active.length === 0) return null;

    // Priority order: in_progress > locked > inviting > draft
    const inProgress = active.find(t => t.state === 'in_progress');
    if (inProgress) return inProgress;

    const locked = active.find(t => t.state === 'locked');
    if (locked) return locked;

    const inviting = active.find(t => t.state === 'inviting');
    if (inviting) return inviting;

    return active[0]; // Return first (draft)
  },

  async getTournamentProgress(tournament: Tournament): Promise<{ stage?: string; roundsCompleted?: number; totalRounds?: number }> {
    const matches = await this.getMatchesByTournament(tournament.id);
    
    if (tournament.type === 'americano') {
      const confirmedMatches = matches.filter(m => m.status === 'confirmed').length;
      const totalMatches = matches.length;
      return {
        roundsCompleted: confirmedMatches,
        totalRounds: totalMatches,
      };
    } else {
      // Normal tournament
      const playoffMatches = matches.filter(m => m.stage === 'playoff');
      
      if (playoffMatches.length > 0 && playoffMatches.some(m => m.status === 'pending' || m.status === 'confirmed')) {
        return { stage: 'Playoffs' };
      }
      
      return { stage: 'Groups' };
    }
  },

  async getRecentCompletedTournamentsForUser(userId: string, limit: number = 3): Promise<Array<Tournament & { placement?: string; ratingDelta?: number }>> {
    const { completed } = await this.listTournamentsForUser(userId);
    
    const tournamentsWithPlacement = await Promise.all(
      completed.slice(0, limit).map(async (tournament) => {
        let placement: string | undefined;
        let ratingDelta: number | undefined;

        try {
          if (tournament.type === 'americano') {
            // Get americano leaderboard
            const leaderboard = await this.getAmericanoLeaderboard(tournament.id);
            const userEntry = leaderboard.find(e => e.participant.userId === userId);
            
            if (userEntry) {
              placement = `Placed #${userEntry.rank} of ${leaderboard.length}`;
            }
          } else {
            // Get normal tournament placement
            const matches = await this.getMatchesByTournament(tournament.id);
            const playoffMatches = matches.filter(m => m.stage === 'playoff' && m.status === 'confirmed');
            
            if (playoffMatches.length > 0) {
              // Find final match
              const maxRound = Math.max(...playoffMatches.map(m => m.roundIndex));
              const finalMatch = playoffMatches.find(m => m.roundIndex === maxRound);
              
              if (finalMatch) {
                const userInTeamA = finalMatch.teamA.memberUserIds.includes(userId);
                const userInTeamB = finalMatch.teamB.memberUserIds.includes(userId);
                
                if (userInTeamA) {
                  placement = finalMatch.winner === 'A' ? 'Winner' : 'Finalist';
                } else if (userInTeamB) {
                  placement = finalMatch.winner === 'B' ? 'Winner' : 'Finalist';
                }
                
                // Check semis
                if (!placement) {
                  const semiMatches = playoffMatches.filter(m => m.roundIndex === maxRound - 1);
                  for (const semi of semiMatches) {
                    if (semi.teamA.memberUserIds.includes(userId) || semi.teamB.memberUserIds.includes(userId)) {
                      placement = 'Semi-finalist';
                      break;
                    }
                  }
                }
              }
            }
            
            if (!placement) {
              placement = 'Completed';
            }
          }

          // Get rating delta if competitive
          if (tournament.isCompetitive) {
            const { data: historyEntry } = await supabase
              .from('rating_history')
              .select('previous_level, new_level')
              .eq('user_id', userId)
              .eq('sport', tournament.sport)
              .contains('metadata', { tournament_id: tournament.id })
              .single();

            if (historyEntry) {
              const delta = historyEntry.new_level - historyEntry.previous_level;
              ratingDelta = Math.round(delta * 10) / 10;
            }
          }
        } catch (err) {
          console.error('Error computing tournament placement:', err);
        }

        return {
          ...tournament,
          placement,
          ratingDelta,
        };
      })
    );

    return tournamentsWithPlacement;
  },

  async completeAmericanoTournament(tournamentId: string): Promise<{ ratingDeltas?: Array<{ userId: string; displayName: string; delta: number }> }> {
    const tournament = await this.getTournamentById(tournamentId);
    
    if (tournament.type !== 'americano') {
      throw new Error('Can only complete americano tournaments');
    }

    // Check all matches are confirmed
    const matches = await this.getMatchesByTournament(tournamentId);
    const allConfirmed = matches.every(m => m.status === 'confirmed');
    
    if (!allConfirmed) {
      throw new Error('All matches must be confirmed before completing tournament');
    }

    // Update tournament state
    await this.updateTournamentState(tournamentId, 'completed');

    // If competitive, apply rating changes based on final placement
    if (!tournament.isCompetitive) {
      return {};
    }

    const leaderboard = await this.getAmericanoLeaderboard(tournamentId);
    const N = leaderboard.length;
    const K = 0.20; // Americano K-factor

    // Get current ratings for all participants
    const { data: ratings } = await supabase
      .from('user_ratings')
      .select('user_id, level, sport')
      .eq('sport', tournament.sport)
      .in('user_id', tournament.participants.map(p => p.userId));

    const ratingMap = new Map<string, number>();
    for (const rating of ratings || []) {
      ratingMap.set(rating.user_id, rating.level);
    }

    // Compute expected placement for each player based on rating
    const playersWithRatings = leaderboard.map(entry => ({
      ...entry,
      currentRating: ratingMap.get(entry.participant.userId) || 2.5,
    }));

    // Calculate average rating
    const avgRating = playersWithRatings.reduce((sum, p) => sum + p.currentRating, 0) / N;

    // Compute rating deltas
    const ratingDeltas: Array<{ userId: string; displayName: string; delta: number }> = [];
    const ratingUpdates: any[] = [];
    const historyEntries: any[] = [];

    for (const entry of playersWithRatings) {
      // Expected placement based on rating (higher rating = lower expected placement number)
      const ratingDiffFromAvg = entry.currentRating - avgRating;
      const expectedPlacement = (N + 1) / 2 - (ratingDiffFromAvg * (N - 1) / 2);
      
      // Actual placement
      const actualPlacement = entry.rank;

      // Delta calculation
      let delta = K * (expectedPlacement - actualPlacement) / (N - 1);
      
      // Clamp delta
      delta = Math.max(-0.25, Math.min(0.25, delta));

      const newLevel = Math.max(0.0, Math.min(7.0, entry.currentRating + delta));

      ratingDeltas.push({
        userId: entry.participant.userId,
        displayName: entry.participant.displayName,
        delta: Math.round(delta * 10) / 10,
      });

      // Prepare rating update
      ratingUpdates.push({
        user_id: entry.participant.userId,
        sport: tournament.sport,
        new_level: newLevel,
      });

      // Prepare rating history entry
      historyEntries.push({
        user_id: entry.participant.userId,
        match_id: null,
        sport: tournament.sport,
        previous_level: entry.currentRating,
        new_level: newLevel,
        previous_reliability: 0.5, // Placeholder
        new_reliability: 0.5, // Placeholder
        metadata: {
          tournament_id: tournamentId,
          tournament_title: tournament.title,
          placement: actualPlacement,
          reason: 'Americano tournament final placement',
        },
      });
    }

    // Apply rating updates
    for (const update of ratingUpdates) {
      const { data: existing } = await supabase
        .from('user_ratings')
        .select('*')
        .eq('user_id', update.user_id)
        .eq('sport', update.sport)
        .single();

      if (existing) {
        await supabase
          .from('user_ratings')
          .update({ 
            level: update.new_level,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', update.user_id)
          .eq('sport', update.sport);
      } else {
        await supabase
          .from('user_ratings')
          .insert({
            user_id: update.user_id,
            sport: update.sport,
            level: update.new_level,
            reliability: 0.5,
            matches_played: 0,
          });
      }
    }

    // Insert rating history
    if (historyEntries.length > 0) {
      await supabase.from('rating_history').insert(historyEntries);
    }

    return { ratingDeltas: ratingDeltas.sort((a, b) => b.delta - a.delta).slice(0, 5) };
  },
};
