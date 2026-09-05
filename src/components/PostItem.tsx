import { useState } from "react";
import { Link } from "react-router";
import { LikeButton } from "./LikeButton";
import { SaveButton } from "./SaveButton";
import { PollCard } from "./PollCard";
import { ReportDialog } from "./ReportDialog";
import { DeletePostButton } from "./DeletePostButton";
import { Post } from "./PostList";
import { useAuth } from "../context/AuthContext";

interface Props { post: Post; }
const CommentIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M20 11.5a7.7 7.7 0 0 1-8 7.5 8.8 8.8 0 0 1-3-.5L4 20l1.4-4A7.3 7.3 0 0 1 4 11.5 7.7 7.7 0 0 1 12 4a7.7 7.7 0 0 1 8 7.5Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ShareIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M8 12 16.5 5M12.5 5h4v4M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const LinkIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M9.5 14.5 14.5 9M7.7 16.3l-1.3 1.3a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M16.3 7.7l1.3-1.3a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" strokeLinecap="round" /></svg>;
const FlagIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M6 21V4m0 1h9.5l-1.4 3 1.4 3H6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const postTypeLabel = (post: Post) => post.flair_name || (post.post_type === "link" ? "Link" : post.post_type === "image" ? "Image" : post.post_type === "poll" ? "Poll" : "Discussion");

export const PostItem = ({ post }: Props) => {
  const { user } = useAuth();
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const formattedDate = post.created_at ? new Date(post.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Recently";
  const communityName = post.community_name?.trim() || "Community";
  const authorName = post.author_username?.trim() || post.author_name?.trim() || null;
  const previewText = post.content?.trim();
  const communityHref = post.community_id ? `/community/${post.community_id}` : "/communities";
  const isOwnPost = Boolean(user && post.user_id && user.id === post.user_id);

  const sharePost = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: post.title, text: previewText || undefined, url }); return; }
      await navigator.clipboard.writeText(url); setShareState("copied"); window.setTimeout(() => setShareState("idle"), 1600);
    } catch { /* share cancelled */ }
  };

  return (
    <>
      <article className="yapster-post-card">
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Link to={communityHref} className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-xs font-black text-violet-800 ring-1 ring-black/5" aria-label={`Open ${communityName}`}>{post.community_avatar_url ? <img src={post.community_avatar_url} alt="" className="h-full w-full object-cover" /> : communityName.slice(0,1).toUpperCase()}</Link>
            <div className="min-w-0 flex-1 pt-0.5"><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400"><Link to={communityHref} className="truncate font-extrabold text-slate-800 transition hover:text-violet-700">{communityName}</Link><span>•</span><span>{formattedDate}</span>{authorName && <><span>•</span><Link to={`/profile/${encodeURIComponent(authorName)}`} className="font-semibold text-slate-500 hover:text-violet-700">@{authorName}</Link></>}</div><span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={post.flair_color ? { backgroundColor: `${post.flair_color}20`, color: post.flair_color } : undefined}>{postTypeLabel(post)}</span></div>
            <div className="relative shrink-0"><button type="button" onClick={() => setMenuOpen((current) => !current)} aria-label="More post options" className="grid h-8 w-8 place-items-center rounded-lg text-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">⋯</button>{menuOpen && <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.18)]">{isOwnPost ? <DeletePostButton postId={post.id} imageUrl={post.image_url} onDeleted={() => setMenuOpen(false)} className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-extrabold text-red-600 transition hover:bg-red-50" /> : user && post.community_id ? <button type="button" onClick={() => { setMenuOpen(false); setReportOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-extrabold text-slate-600 transition hover:bg-red-50 hover:text-red-600"><FlagIcon /> Report post</button> : <Link to="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold text-slate-600"><FlagIcon /> Sign in to report</Link>}</div>}</div>
          </div>

          <Link to={`/post/${post.id}`} className="mt-4 block"><h2 className="break-words text-[1.18rem] font-extrabold leading-[1.35] tracking-[-0.025em] text-slate-950 transition hover:text-violet-800 sm:text-[1.32rem]">{post.title}</h2></Link>
          {previewText && <Link to={`/post/${post.id}`} className="mt-2.5 block"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{previewText.length > 300 ? `${previewText.slice(0,300)}…` : previewText}</p></Link>}
          {post.post_type === "link" && post.link_url && <a href={post.link_url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-[15px] border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-300 hover:bg-violet-50/40"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-violet-700 ring-1 ring-slate-200"><LinkIcon /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{post.link_url}</strong><span className="mt-0.5 block text-xs text-slate-400">Open external link</span></span></a>}
          {post.post_type === "poll" && <PollCard postId={post.id} />}
          {post.image_url && <Link to={`/post/${post.id}`} className="mt-4 block overflow-hidden rounded-[15px] border border-slate-200 bg-slate-100"><img src={post.image_url} alt={post.title} className="max-h-[520px] w-full object-cover" loading="lazy" /></Link>}
        </div>
        <div className="border-t border-[var(--y-border)] bg-[var(--y-surface)] px-3 py-2.5 sm:px-4"><div className="flex flex-wrap items-center gap-2"><LikeButton postId={post.id} /><Link to={`/post/${post.id}`} className="yapster-post-action"><CommentIcon /><span>{post.comment_count ?? 0}</span><span className="hidden sm:inline">comments</span></Link><button type="button" onClick={sharePost} className="yapster-post-action"><ShareIcon /><span className="hidden sm:inline">{shareState === "copied" ? "Copied" : "Share"}</span></button><SaveButton postId={post.id} /></div></div>
      </article>
      {post.community_id && <ReportDialog open={reportOpen} communityId={post.community_id} targetType="post" targetId={post.id} onClose={() => setReportOpen(false)} />}
    </>
  );
};
