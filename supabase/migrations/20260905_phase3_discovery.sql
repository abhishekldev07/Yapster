-- Phase 3: recent-activity ranking for community discovery.

create or replace view public.community_trending
with (security_invoker = true)
as
with member_stats as (
  select community_id, count(*)::bigint as member_count
  from public.community_members
  where banned = false
  group by community_id
),
post_vote_stats as (
  select post_id, sum(vote)::bigint as score
  from public.votes
  group by post_id
),
post_stats as (
  select
    p.community_id,
    count(*) filter (where p.created_at >= now() - interval '7 days')::bigint as recent_posts,
    coalesce(sum(case when p.created_at >= now() - interval '7 days' then coalesce(v.score, 0) else 0 end), 0)::bigint as recent_post_score,
    max(p.created_at) as last_post_at
  from public.posts p
  left join post_vote_stats v on v.post_id = p.id
  where p.community_id is not null
  group by p.community_id
),
comment_stats as (
  select
    p.community_id,
    count(*) filter (where c.created_at >= now() - interval '7 days')::bigint as recent_comments,
    max(c.created_at) as last_comment_at
  from public.comments c
  join public.posts p on p.id = c.post_id
  where p.community_id is not null
  group by p.community_id
)
select
  c.id,
  c.name,
  c.description,
  coalesce(ms.member_count, 0)::bigint as member_count,
  coalesce(ps.recent_posts, 0)::bigint as recent_posts,
  coalesce(cs.recent_comments, 0)::bigint as recent_comments,
  coalesce(ps.recent_post_score, 0)::bigint as recent_post_score,
  greatest(coalesce(ps.last_post_at, c.created_at), coalesce(cs.last_comment_at, c.created_at)) as last_activity_at,
  (
    coalesce(ps.recent_posts, 0) * 4
    + coalesce(cs.recent_comments, 0) * 1.5
    + greatest(coalesce(ps.recent_post_score, 0), 0) * 2
    + ln(coalesce(ms.member_count, 0) + 1) * 2
  )::numeric as trend_score
from public.communities c
left join member_stats ms on ms.community_id = c.id
left join post_stats ps on ps.community_id = c.id
left join comment_stats cs on cs.community_id = c.id;

grant select on public.community_trending to anon, authenticated;
