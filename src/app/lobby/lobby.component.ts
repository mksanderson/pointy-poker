// src/app/lobby/lobby.component.ts

import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { SupabaseService } from "../supabase.service";
import { User } from "@supabase/supabase-js";

@Component({
  selector: "app-lobby",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./lobby.component.html",
})
export class LobbyComponent {
  user: User | null = null;
  joinError = ""; // Add a property to hold error messages

  constructor(
    private readonly supabase: SupabaseService,
    private readonly router: Router,
  ) {
    this.supabase.getUser().then((user) => (this.user = user));
  }

  async createSession(title: string) {
    if (!this.user || !title.trim()) return;

    this.supabase
      .createSession(title.trim(), this.user.id)
      .subscribe((response) => {
        if (response.data) {
          this.router.navigate(["/session", response.data.id]);
        }
      });
  }

  joinSession(id: string) {
    this.joinError = ""; // Reset error on new attempt
    const trimmedId = id.trim();

    // UUID validation regular expression
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

    if (uuidRegex.test(trimmedId)) {
      this.router.navigate(["/session", trimmedId]);
    } else {
      // If the ID is not a valid UUID, show an error message
      this.joinError =
        "Invalid Session ID format. Please check the ID and try again.";
      // Optional: Clear the error after a few seconds
      setTimeout(() => (this.joinError = ""), 5000);
    }
  }
}
