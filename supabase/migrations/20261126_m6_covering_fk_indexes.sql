-- Milestone 6: Add covering B-tree indexes for existing conversation/message foreign keys
-- to eliminate unindexed_foreign_keys performance advisories cleanly without altering data or dropping objects.

create index if not exists idx_conversations_created_by
  on public.conversations (created_by);

create index if not exists idx_message_summaries_requested_by
  on public.message_summaries (requested_by);

create index if not exists idx_messages_sender_id
  on public.messages (sender_id);
