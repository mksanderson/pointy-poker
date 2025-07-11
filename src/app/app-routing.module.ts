import { Routes } from '@angular/router';
import { LobbyComponent } from './lobby/lobby.component';
import { PlanningSessionComponent } from './planning-session/planning-session.component';

export const routes: Routes = [
  { path: 'session/:id', component: PlanningSessionComponent },
  { path: '', component: LobbyComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' } // Redirect invalid routes to the lobby
];
