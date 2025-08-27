import { Component, OnDestroy, OnInit } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { Participant, Session } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs'; // Import firstValueFrom

@Component({
  imports: [FormsModule, ReactiveFormsModule, CommonModule],
  selector: 'app-planning-session',
  templateUrl: './planning-session.component.html',
  standalone: true
})
export class PlanningSessionComponent implements OnInit, OnDestroy {
  sessionId!: string;
  userId!: string;
  session: Session | null = null;
  alias = '';
  currentVote: string | null = null;
  aliasSet = false;
  sessionExists = true;
  copied = false;
  jiraTicket = '';
  loading = true; // We will manage this carefully

  votingCards = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];
  private sessionSub!: RealtimeChannel;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  async ngOnInit() {
    this.loading = true; // Start loading

    const id = this.route.snapshot.paramMap.get('id');
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!id || !uuidRegex.test(id)) {
      this.sessionExists = false;
      this.loading = false;
      return; // Stop execution if the ID is invalid
    }
    if (!id) {
      this.sessionExists = false;
      this.loading = false;
      return;
    }
    this.sessionId = id;

    const user = await this.supabase.getUser();
    if (!user) {
      this.router.navigate(['/']);
      return;
    }
    this.userId = user.id;

    // --- REFINED MIGRATION LOGIC ---

    // 1. Fetch the session data a single time to check for migration
    const initialSession = await firstValueFrom(this.supabase.getSession(this.sessionId));

    if (initialSession) {
      const savedAlias = sessionStorage.getItem(this.getAliasStorageKey());

      // 2. Check if we have a saved alias and if our *new* user ID is not yet a participant
      if (savedAlias && !initialSession.participants[this.userId]) {
        const participants = Object.entries(initialSession.participants);
        const [oldUserId] = participants.find(([, p]) => p.alias === savedAlias) || [];

        // 3. If we find an old participant with our alias, migrate them
        if (oldUserId && oldUserId !== this.userId) {
          await this.supabase.migrateParticipant(this.sessionId, oldUserId, this.userId, savedAlias);
          
          // 4. Also migrate facilitator rights if the old user was the facilitator
          if (initialSession.created_by === oldUserId) {
            await this.supabase.migrateFacilitator(this.sessionId, oldUserId, this.userId);
          }
        }
      }
    } else {
      this.sessionExists = false;
      this.loading = false;
      return;
    }

    // --- END OF MIGRATION LOGIC ---

    // 4. Now, subscribe to real-time changes for ongoing updates
    this.sessionSub = this.supabase.onSessionChanges(this.sessionId, (payload) => {
      this.session = payload.new;
      this.updateLocalStateFromSession();
      this.loading = false; // Stop loading only after we have data
    });

    // Also explicitly fetch the latest data to populate the view immediately
    const finalSession = await firstValueFrom(this.supabase.getSession(this.sessionId));
    if (finalSession) {
      this.session = finalSession;
      this.updateLocalStateFromSession();
    }
    this.loading = false; // Stop loading
  }

  ngOnDestroy() {
    if (this.sessionSub) {
      this.sessionSub.unsubscribe();
    }
  }

  // Use sessionStorage
  private getAliasStorageKey(): string {
    return `session-alias-${this.sessionId}`;
  }

  async setAlias() {
    if (!this.alias.trim() || !this.session) return;
    const alias = this.alias.trim();
    const newParticipants = {
      ...this.session.participants,
      [this.userId]: {alias, vote: null}
    };
    const { error } = await this.supabase.updateSession(this.sessionId, {participants: newParticipants});

    if (!error) {
      // Optimistically update local state so the UI reflects the alias immediately
      this.session = { ...this.session, participants: newParticipants };
      this.aliasSet = true;

      // Save alias to sessionStorage on successful set
      sessionStorage.setItem(this.getAliasStorageKey(), alias);
    }
  }

  // No changes needed for the rest of the file...

  leaveSession() {
    this.router.navigate(['/']);
  }

  get isFacilitator(): boolean {
    return this.session?.created_by === this.userId;
  }

  get participantsArray(): [string, Participant][] {
    return this.session ? Object.entries(this.session.participants) : [];
  }

  get allVoted(): boolean {
    if (!this.session) return false;
    const votingMembers = this.participantsArray.filter(([id, _]) => id !== this.session?.created_by);
    return votingMembers.length > 0 && votingMembers.every(([, p]) => p.vote !== null);
  }

  get voteCounts(): { [key: string]: number } {
    if (!this.session) return {};
    const votes = this.participantsArray.map(([, p]) => p.vote).filter((v): v is string => v !== null);
    return votes.reduce((acc, vote) => ({...acc, [vote]: (acc[vote] || 0) + 1}), {} as { [key: string]: number });
  }

  get averageVote(): number {
    if (!this.session) return 0;
    const numericVotes = this.participantsArray
      .map(([, p]) => Number(p.vote))
      .filter(v => !isNaN(v));
    return numericVotes.length > 0 ? numericVotes.reduce((sum, v) => sum + v, 0) / numericVotes.length : 0;
  }

  updateLocalStateFromSession() {
    if (this.session?.participants?.[this.userId]) {
      this.alias = this.session.participants[this.userId].alias;
      this.currentVote = this.session.participants[this.userId].vote;
      this.aliasSet = true;
    } else {
      // If user is not a participant yet, don't wipe out whatever the user has
      // currently typed. Only populate from sessionStorage on first load when
      // the input is empty. Subsequent realtime updates should not clear the
      // field while the user is entering their alias.
      if (!this.alias) {
        const savedAlias = sessionStorage.getItem(this.getAliasStorageKey());
        this.alias = savedAlias || '';
      }
      this.aliasSet = false;
    }
    if (this.isFacilitator) {
      this.jiraTicket = this.session?.current_ticket || '';
    }
  }

  extractTicketFromUrl(input: string): { isUrl: boolean; ticketName: string; url?: string } {
    const urlRegex = /^https?:\/\/.+/i;
    if (!urlRegex.test(input)) {
      return { isUrl: false, ticketName: input };
    }

    // Extract ticket name from Jira URL patterns
    const jiraTicketRegex = /([A-Z]+-\d+)/;
    const match = input.match(jiraTicketRegex);
    const ticketName = match ? match[1] : input;

    return { isUrl: true, ticketName, url: input };
  }

  get currentTicketDisplay(): { isUrl: boolean; ticketName: string; url?: string } {
    const currentTicket = this.session?.current_ticket || '';
    return this.extractTicketFromUrl(currentTicket);
  }

  async setTicket() {
    if (!this.isFacilitator) return;
    await this.supabase.updateSession(this.sessionId, {current_ticket: this.jiraTicket.trim()});
  }

  async vote(card: string) {
    if (!this.aliasSet || !this.session) return;
    const newVote = this.currentVote === card ? null : card;
    
    // Optimistic update with retry logic
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Get fresh session data to avoid stale state
        const { data: freshSession } = await this.supabase.getFreshSession(this.sessionId);
        if (!freshSession) throw new Error('Session not found');
        
        const newParticipants = {
          ...freshSession.participants,
          [this.userId]: {...freshSession.participants[this.userId], vote: newVote}
        };
        
        const { error } = await this.supabase.updateSession(this.sessionId, {participants: newParticipants});
        
        if (!error) {
          // Success - update local state optimistically
          this.session = { ...this.session, participants: newParticipants };
          break;
        }
        
        // Handle specific concurrency errors
        if (error.message?.includes('concurrent update') || error.code === 'PGRST116') {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount)); // Exponential backoff
          continue;
        }
        
        throw error;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error('Failed to update vote after retries:', error);
          // Optionally show user feedback about the error
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
      }
    }
  }

  async revealVotes() {
    if (!this.isFacilitator) return;
    await this.supabase.updateSession(this.sessionId, {votes_revealed: true});
  }

  async resetVoting() {
    if (!this.isFacilitator || !this.session) return;
    
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Get fresh session data to avoid stale state
        const { data: freshSession } = await this.supabase.getFreshSession(this.sessionId);
        if (!freshSession) throw new Error('Session not found');
        
        const resetParticipants = Object.keys(freshSession.participants).reduce((acc, key) => {
          acc[key] = {...freshSession.participants[key], vote: null};
          return acc;
        }, {} as { [key: string]: Participant });
        
        const { error } = await this.supabase.updateSession(this.sessionId, {
          participants: resetParticipants,
          votes_revealed: false,
          current_ticket: ''
        });
        
        if (!error) {
          // Success - update local state
          this.session = { 
            ...this.session, 
            participants: resetParticipants,
            votes_revealed: false,
            current_ticket: ''
          };
          break;
        }
        
        // Handle specific concurrency errors
        if (error.message?.includes('concurrent update') || error.code === 'PGRST116') {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          continue;
        }
        
        throw error;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error('Failed to reset voting after retries:', error);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
      }
    }
  }

  copyLink() {
    const sessionLink = `${window.location.origin}/session/${this.sessionId}`;
    navigator.clipboard.writeText(sessionLink).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    });
  }
}
