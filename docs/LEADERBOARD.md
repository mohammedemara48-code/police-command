# Weekly leaderboard (Neon)

Table `public.weekly_scores` in the `game` database (Neon project `police-command`), read and written by the client through the Neon Data API with the player's Neon Auth JWT. Signed-in players only (the Data API needs a JWT).

```sql
create table public.weekly_scores (
  user_id text not null default auth.user_id(),
  week date not null default (date_trunc('week', now() at time zone 'utc'))::date,
  name text not null default 'ضابط' check (char_length(name) between 1 and 24),
  points integer not null default 0 check (points between 0 and 1000000),
  missions integer not null default 0 check (missions between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);
```

Server-side protection (trigger `weekly_scores_guard`, security definer):
- `user_id` is always the JWT user and `week` always the current UTC week, whatever the client sends
- points and missions never go down; at most +3000 points and +20 missions per write

RLS (forced): everyone signed in can read; insert and update only your own row.
The score is still reported by the client, so a determined cheater can add up to 3000 points per write; move scoring server-side if that becomes a problem.
