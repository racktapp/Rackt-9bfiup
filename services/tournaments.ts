import { getSupabaseClient } from '@/template';
import { 
  Tournament, 
  TournamentParticipant, 
  TournamentInvite,
  TournamentGroup,
  TournamentMatch,
  TournamentTeam,
  TournamentStanding
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
};
