import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { inviteId, accept } = await req.json();

    if (!inviteId || typeof accept !== 'boolean') {
      return new Response(JSON.stringify({ error: 'inviteId and accept are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: invite, error: inviteError } = await adminClient
      .from('tournament_invites')
      .select('id, tournament_id, invited_user_id, status')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: 'Invite not found or has been deleted' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (invite.invited_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'You are not authorized to respond to this invite' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (invite.status !== 'pending') {
      return new Response(JSON.stringify({ error: `This invite has already been ${invite.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tournament, error: tournamentError } = await adminClient
      .from('tournaments')
      .select('id, state, participants')
      .eq('id', invite.tournament_id)
      .single();

    if (tournamentError || !tournament) {
      await adminClient
        .from('tournament_invites')
        .update({ status: 'expired' })
        .eq('id', inviteId);

      return new Response(JSON.stringify({ error: 'This tournament no longer exists or has been deleted' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tournament.state === 'completed') {
      return new Response(JSON.stringify({ error: 'This tournament has already completed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (accept) {
      const { data: profile } = await adminClient
        .from('user_profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      const participants = Array.isArray(tournament.participants) ? tournament.participants : [];
      const alreadyParticipant = participants.some((p: any) => p.userId === user.id);

      if (!alreadyParticipant) {
        const newParticipant = {
          userId: user.id,
          displayName: profile?.display_name || profile?.username || 'Unknown',
          username: profile?.username || '',
          avatarUrl: profile?.avatar_url || null,
          joinedAt: new Date().toISOString(),
          seed: null,
        };

        const { error: updateTournamentError } = await adminClient
          .from('tournaments')
          .update({
            participants: [...participants, newParticipant],
            updated_at: new Date().toISOString(),
          })
          .eq('id', tournament.id);

        if (updateTournamentError) {
          return new Response(JSON.stringify({ error: `Failed to join tournament: ${updateTournamentError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const { error: updateInviteError } = await adminClient
      .from('tournament_invites')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', inviteId);

    if (updateInviteError) {
      return new Response(JSON.stringify({ error: `Failed to update invite: ${updateInviteError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      tournamentId: accept ? tournament.id : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
