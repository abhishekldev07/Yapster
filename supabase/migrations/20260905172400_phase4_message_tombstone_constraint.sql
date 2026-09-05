alter table public.direct_messages drop constraint if exists direct_messages_body_length;

alter table public.direct_messages add constraint direct_messages_body_length check (
  (deleted_at is not null and body = '')
  or
  (deleted_at is null and char_length(btrim(body)) between 1 and 4000)
);
