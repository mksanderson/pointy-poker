import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session as SupabaseSession, AuthChangeEvent, AuthSession } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { Session } from './types';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Custom in-memory storage adapter to avoid localStorage issues in sandboxed environments
const inMemoryStorage = new Map<string, string>();
const customStorageAdapter = {
  getItem: (key: string) => {
    return inMemoryStorage.get(key) || null;
  },
  setItem: (key: string, value: string) => {
    inMemoryStorage.set(key, value);
  },
  removeItem: (key: string) => {
    inMemoryStorage.delete(key);
  },
};


@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    // Initialize the Supabase client with the custom in-memory storage adapter
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        storage: customStorageAdapter, // Use the custom in-memory storage
        autoRefreshToken: true,
        persistSession: true, // Keep the session persisted in memory
        detectSessionInUrl: false,
      },
    });
  }

  async getUser(): Promise<User | null> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) {
      // This error is expected if no session is found. We can safely ignore it
      // if the primary issue is the lock timeout.
      if (error.message !== 'Auth session missing!') {
        console.error('Error getting user:', error);
      }
      return null;
    }
    return data.user;
  }

  async signInAnonymously(): Promise<User | null> {
    const { data, error } = await this.supabase.auth.signInAnonymously();
    if (error) {
      console.error('Error signing in anonymously', error);
    }
    return data?.user ?? null;
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: SupabaseSession | null) => void) {
    const { data: authListener } = this.supabase.auth.onAuthStateChange(callback);
    return authListener;
  }

  createSession(title: string, userId: string): Observable<any> {
    const newSession = {
      title: title || 'New Planning Session',
      created_by: userId,
      participants: {},
      current_ticket: ''
    };
    return from(this.supabase.from('sessions').insert([newSession]).select().single());
  }

  getSession(sessionId: string): Observable<Session | null> {
    return from(
      this.supabase.from('sessions').select('*').eq('id', sessionId).single()
    ).pipe(map(response => response.data as Session));
  }

  async migrateParticipant(sessionId: string, oldUserId: string, newUserId: string, alias: string) {
    // The object keys here MUST match the function's argument names
    return this.supabase.rpc('migrate_participant', {
      session_id_arg: sessionId,
      old_user_id_arg: oldUserId,
      new_user_id_arg: newUserId,
      new_alias_arg: alias
    });
  }

  async migrateFacilitator(sessionId: string, oldUserId: string, newUserId: string) {
    return this.supabase.rpc('migrate_facilitator', {
      session_id_arg: sessionId,
      old_user_id_arg: oldUserId,
      new_user_id_arg: newUserId
    });
  }

  onSessionChanges(sessionId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel('sessions')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, callback)
      .subscribe();
  }

  updateSession(sessionId: string, data: Partial<Session>) {
    return this.supabase.from('sessions').update(data).eq('id', sessionId);
  }
}
