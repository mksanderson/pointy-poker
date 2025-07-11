import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { CommonModule } from '@angular/common';
import { LobbyComponent } from './lobby/lobby.component';
import { PlanningSessionComponent } from './planning-session/planning-session.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
  ],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent implements OnInit {
  user: User | null = null;
  loading = true;

  constructor(
    private readonly supabase: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    const currentUser = await this.supabase.getUser();
    if (currentUser) {
      this.user = currentUser;
    } else {
      const signedInUser = await this.supabase.signInAnonymously();
      this.user = signedInUser;
    }
    this.loading = false;

    this.supabase.onAuthStateChange((event, session) => {
      this.user = session?.user ?? null;
    });
  }

  handleCreateSession(title: string) {
    if (!this.user) return;
    this.supabase.createSession(title, this.user.id).subscribe(response => {
      if (response.data) {
        this.router.navigate(['/session', response.data.id]);
      }
    });
  }

  handleJoinSession(id: string) {
    if (id.trim()) {
      this.router.navigate(['/session', id.trim()]);
    }
  }
}
