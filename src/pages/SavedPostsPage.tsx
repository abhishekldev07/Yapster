import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { fetchPosts, Post } from "../components/PostList";
import { PostItem } from "../components/PostItem";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

interface SavedRow {
  post_id: number;
  created_at: string;
}

const fetchSavedPosts = async (userId: string): Promise<Post[]> => {
  const [{ data: savedRows, error: savedError }, posts] = await Promise.all([
    supabase
      .from("saved_posts")
      .select("post_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    fetchPosts(),
  ]);

  if (savedError) throw new Error(savedError.message);
  const saved = (savedRows ?? []) as SavedRow[];
  const postById = new Map(posts.map((post) => [post.id, post]));
  return saved.map((row) => postById.get(Number(row.post_id))).filter((post): post is Post => !!post);
};

const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
    <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SavedPostsPage = () => {
  const { user } = useAuth();
  const { data: posts = [], isLoading, error } = useQuery<Post[], Error>({
    queryKey: ["saved-posts", user?.id],
    queryFn: () => (user ? fetchSavedPosts(user.id) : Promise.resolve([])),
    enabled: !!user,
  });

  if (!user) {
    return (
      <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <section className="yapster-card p-9 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><BookmarkIcon /></div>
            <h1 className="mt-4 text-2xl font-black text-slate-950">Your saved posts live here</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Sign in to privately bookmark discussions and come back to them later.</p>
            <Link to="/login" className="yapster-button yapster-button--primary mt-5">Sign in</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-[760px] px-4 sm:px-6">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">Private library</p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">Saved posts</h1>
            <p className="mt-1 text-sm text-slate-500">Only you can see what you save.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-500">{posts.length} saved</span>
        </header>

        {isLoading ? (
          <div className="yapster-card animate-pulse p-8"><div className="h-5 w-40 rounded bg-slate-100" /><div className="mt-4 h-3 w-full rounded bg-slate-100" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">Could not load your saved posts.</div>
        ) : posts.length ? (
          <div className="space-y-4">{posts.map((post) => <PostItem key={post.id} post={post} />)}</div>
        ) : (
          <section className="yapster-card p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><BookmarkIcon /></div>
            <h2 className="mt-4 text-xl font-extrabold text-slate-950">Nothing saved yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Use the Save button on any post to build your private reading list.</p>
            <Link to="/" className="yapster-button yapster-button--primary mt-5">Browse discussions</Link>
          </section>
        )}
      </div>
    </main>
  );
};
