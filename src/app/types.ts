export interface Participant {
  alias: string;
  vote: string | null;
}

export interface Session {
  id: string;
  created_at: string;
  title: string;
  created_by: string;
  votes_revealed: boolean;
  participants: { [key: string]: Participant };
  current_ticket: string;
}
