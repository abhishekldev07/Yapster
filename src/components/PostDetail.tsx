import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Post } from "./PostList";
import { supabase } from "../supabase-client";
import { LikeButton } from "./LikeButton";
import { SaveButton } from "./SaveButton";
import { PollCard } from "./PollCard";
import { ReportDialog } from "./ReportDialog";
import { CommentSection } from "./CommentSection";
import { DeletePostButton } from "./DeletePostButton";
import { useAuth } from "../context/AuthContext";

interface Props { postId: number; }
interface PostWithCommunity extends Post { community_id?: number; }
interface CommunitySummary { id: number; name: string; icon_url?: string | null; }
interface AuthorSummary { username: string | null; display_name: string | null; }
interface FlairSummary { name: string; color: string; }

const fetchPostById = async (id: number): Promise<PostWithCommunity> => {
  const { data, error } = await supabase.from("posts").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as PostWithCommunity;
};
const CommentIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M20 11.5a7.7 7.7 0 0 1-8 7.5 8.8 8.8 0 0 1-3-.5L4 20l1.4-4A7.3 7.3 0 0 1 4 11.5 7.7 7.7 0 0 1 12 4a7.7 7.7 0 0 1 8 7.5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ShareIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M8 12 16.5 5M12.5 5h4v4M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const FlagIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M6 21V4m0 1h9.5l-1.4 3 1.4 3H6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const LinkIcon = () => <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M9.5 14.5 14.5 9M7.7 16.3l-1.3 1.3a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M16.3 7.7l1.3-1.3a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" strokeLinecap="round" /></svg>;

export const PostDetail = ({ postId }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [shareState, setShareState] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const { data, error, isLoading } = useQuery<PostWithCommunity, Error>({ queryKey: ["post", postId], queryFn: () => fetchPostById(postId) });

  const { data: community } = useQuery<CommunitySummary | null, Error>({
    queryKey: ["post-community", data?.community_id], enabled: !!data?.community_id,
    queryFn: async () => { const { data: row, error } = await supabase.from("communities").select("id, name, icon_url").eq("id", data!.community_id!).maybeSingle(); if (error) throw new Error(error.message); return row as CommunitySummary | null; },
  });
  const { data: author } = useQuery<AuthorSummary | null, Error>({
    queryKey: ["post-author", data?.user_id], enabled: !!data?.user_id,
    queryFn: async () => { const { data: row, error } = await supabase.from("profiles").select("username, display_name").eq("id", data!.user_id!).maybeSingle(); if (error) throw new Error(error.message); return row as AuthorSummary | null; },
  });
  const { data: flair } = useQuery<FlairSummary | null, Error>({
    queryKey: ["post-flair", data?.flair_id], enabled: !!data?.flair_id,
    queryFn: async () => { const { data: row, error } = await supabase.from("post_flairs").select("name, color").eq("id", data!.flair_id!).maybeSingle(); if (error) throw new Error(error.message); return row as FlairSummary | null; },
  });
  const { data: commentCount = 0 } = useQuery<number, Error>({ queryKey: ["post-comment-count", postId], queryFn: async () => { const { count, error } = await supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId); if (error) throw new Error(error.message); return count ?? 0; } });

  const handleShare = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: data?.title, url }); else await navigator.clipboard.writeText(url); setShareState("Link copied"); window.setTimeout(() => setShareState(null), 1800); } catch { setShareState(null); }
  };

  if (isLoading) return <div className="yapster-card animate-pulse p-6 sm:p-8"><div className="h-3 w-40 rounded bg-slate-100" /><div className="mt-5 h-9 w-4/5 rounded bg-slate-100" /><div className="mt-6 h-64 rounded-2xl bg-slate-100" /></div>;
  if (error || !data) return <div className="yapster-card p-9 text-center"><img src="/yapster-mark.svg" alt="" className="mx-auto h-11 w-11" /><h1 className="mt-4 text-xl font-black text-slate-950">Post unavailable</h1><p className="mt-2 text-sm text-slate-500">This post could not be found or is no longer available.</p><Link to="/" className="yapster-button yapster-button--primary mt-5">Back to feed</Link></div>;

  const formattedDate = new Date(data.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const authorUsername = author?.username?.trim();
  const authorLabel = author?.display_name?.trim() || authorUsername || "Yapster member";
  const typeLabel = flair?.name || (data.post_type === "image" ? "Image" : data.post_type === "link" ? "Link" : data.post_type === "poll" ? "Poll" : "Discussion");
  const isOwnPost = Boolean(user && data.user_id && user.id === data.user_id);

  return (
    <>
      <article className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3"><Link to={community ? `/community/${community.id}` : "/communities"} className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[13px] bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-sm font-black text-violet-800 ring-1 ring-black/5">{community?.icon_url ? <img src={community.icon_url} alt="" className="h-full w-full object-cover" /> : (community?.name || "C").trim().slice(0,1).toUpperCase()}</Link><div className="min-w-0">{community ? <Link to={`/community/${community.id}`} className="block truncate text-sm font-extrabold text-slate-900 hover:text-violet-700">{community.name.trim()}</Link> : <span className="block text-sm font-extrabold text-slate-900">Community</span>}<div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">{authorUsername ? <Link to={`/profile/${encodeURIComponent(authorUsername)}`} className="font-bold text-slate-500 hover:text-violet-700">{authorLabel}</Link> : <span>{authorLabel}</span>}<span>•</span><time>{formattedDate}</time></div></div></div>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]" style={flair ? { backgroundColor: `${flair.color}20`, color: flair.color } : undefined}>{typeLabel}</span>
          </div>
          <h1 className="mt-6 break-words text-3xl font-black leading-[1.16] tracking-[-0.045em] text-slate-950 sm:text-4xl">{data.title}</h1>
          {data.content && <p className="mt-5 whitespace-pre-wrap break-words text-[0.98rem] leading-8 text-slate-650 sm:text-base">{data.content}</p>}
          {data.post_type === "link" && data.link_url && <a href={data.link_url} target="_blank" rel="noreferrer" className="mt-6 flex items-center gap-4 rounded-[18px] border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-300 hover:bg-violet-50/40 sm:p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-violet-700 ring-1 ring-slate-200"><LinkIcon /></span><span className="min-w-0 flex-1"><strong className="block break-all text-sm text-slate-900 sm:text-base">{data.link_url}</strong><span className="mt-1 block text-xs font-medium text-slate-400">Open external link</span></span></a>}
          {data.post_type === "poll" && <PollCard postId={postId} />}
          {data.image_url && <div className="mt-6 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100"><img src={data.image_url} alt={data.title} loading="lazy" className="max-h-[680px] w-full object-contain" /></div>}
          <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><LikeButton postId={postId} /><span className="yapster-post-action"><CommentIcon /><span>{commentCount}</span><span className="hidden sm:inline">comments</span></span><button type="button" onClick={() => void handleShare()} className="yapster-post-action"><ShareIcon />Share</button>{shareState && <span className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-extrabold text-violet-700">{shareState}</span>}{user && data.community_id && !isOwnPost && <button type="button" onClick={() => setReportOpen(true)} className="yapster-post-action hover:text-red-600"><FlagIcon />Report</button>}<SaveButton postId={postId} />{isOwnPost && <DeletePostButton postId={postId} imageUrl={data.image_url} onDeleted={() => navigate(data.community_id ? `/community/${data.community_id}` : "/")} className="yapster-post-action text-red-600 hover:text-red-700" />}</div>
        </div>
        <section className="border-t border-slate-100 bg-slate-50/60 px-4 py-5 sm:px-8 sm:py-7" aria-label="Post comments"><CommentSection postId={postId} communityId={data.community_id} /></section>
      </article>
      {data.community_id && <ReportDialog open={reportOpen} communityId={data.community_id} targetType="post" targetId={postId} onClose={() => setReportOpen(false)} />}
    </>
  );
};
