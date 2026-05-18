-- Migration 0016 : Persistance conversations Kimi (Cockpit §6)

create table if not exists cockpit_chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  title      text default 'Nouvelle conversation',
  created_at timestamptz default now()
);

create table if not exists cockpit_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid references cockpit_chats(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'system')),
  content    text not null,
  created_at timestamptz default now()
);

-- Index perf
create index if not exists idx_cockpit_messages_chat_created
  on cockpit_messages (chat_id, created_at);

create index if not exists idx_cockpit_chats_user_updated
  on cockpit_chats (user_id, created_at desc);

-- RLS
alter table cockpit_chats    enable row level security;
alter table cockpit_messages enable row level security;

-- Policies cockpit_chats
create policy "own chats" on cockpit_chats
  for all using (auth.uid() = user_id);

-- Policies cockpit_messages (accès via ownership du chat parent)
create policy "own messages" on cockpit_messages
  for all using (
    exists (
      select 1 from cockpit_chats c
      where c.id = chat_id
        and c.user_id = auth.uid()
    )
  );
