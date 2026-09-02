import { Link } from "react-router";
import { LikeButton } from "./LikeButton";
import { Post } from "./PostList";

interface Props {
  post: Post;
}

export const PostItem = ({ post }: Props) => {
  const formattedDate = post.created_at
    ? new Date(post.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "Recently";

  const communityName = post.community_name?.trim() || "Community";
  const authorName =
    post.author_username?.trim() || post.author_name?.trim() || "Member";
  const profileHref = `/profile/${encodeURIComponent(authorName)}`;
  const previewText = post.content?.trim();

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            {post.community_avatar_url ? (
              <img
                src={post.community_avatar_url}
                alt={`${communityName} community icon`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-slate-700">
                {communityName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                {communityName}
              </span>
              <span>•</span>
              <Link
                to={profileHref}
                className="font-semibold text-slate-700 transition-colors hover:text-emerald-800"
              >
                {authorName}
              </Link>
              <span>•</span>
              <span>{formattedDate}</span>
            </div>
          </div>
        </div>

        <Link to={`/post/${post.id}`} className="mt-4 block">
          <h2 className="break-words text-xl font-semibold leading-snug text-slate-900 transition-colors hover:text-emerald-800 sm:text-[1.4rem]">
            {post.title}
          </h2>
        </Link>

        {previewText && (
          <Link to={`/post/${post.id}`} className="mt-3 block">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
              {previewText.length > 260
                ? `${previewText.slice(0, 260)}...`
                : previewText}
            </p>
          </Link>
        )}

        {post.image_url && (
          <Link
            to={`/post/${post.id}`}
            className="mt-4 block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
          >
            <img
              src={post.image_url}
              alt={post.title}
              className="h-64 w-full object-cover sm:h-72"
            />
          </Link>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <LikeButton postId={post.id} />
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/post/${post.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <span aria-hidden="true">💬</span>
              <span>{post.comment_count ?? 0}</span>
            </Link>

            <button
              type="button"
              disabled
              aria-label="Share post"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400"
            >
              <span aria-hidden="true">↗</span>
              Share
            </button>

            <button
              type="button"
              disabled
              aria-label="Save post"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-400"
            >
              <span aria-hidden="true">★</span>
              Save
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
