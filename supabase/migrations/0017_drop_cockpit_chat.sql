-- tri-adrien 2026-06-23 : feature cockpit-chat morte (0 consommateur frontend).
-- Drop des 2 tables + index + policies (cascade gère cockpit_messages -> cockpit_chats).
drop table if exists cockpit_messages cascade;
drop table if exists cockpit_chats cascade;
