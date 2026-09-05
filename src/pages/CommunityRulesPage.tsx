import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

interface CommunitySummary {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
}

interface Rule {
  id: number;
  title: string;
  description: string;
}

interface Flair {
  id: number;
  name: string;
  color: string;
  is_active: boolean;
}

export const CommunityRulesPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();

  const { data: community, isLoading } = useQuery<CommunitySummary | null, Error>({
    queryKey: ["community-rules-summary", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id, name, description, created_by").eq("id", communityId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunitySummary | null;
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const { data: membership } = useQuery<{ role: string | null } | null, Error>({
    queryKey: ["community-rules-role", communityId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("community_members").select("role").eq("community_id", communityId).eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { role: string | null } | null;
    },
    enabled: !!user && Number.isFinite(communityId) && communityId > 0,
    retry: false,
  });

  const { data: rules = [] } = useQuery<Rule[], Error>({
    queryKey: ["community-rules", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("community_rules").select("id, title, description").eq("community_id", communityId).order("position").order("id");
      if (error) throw new Error(error.message);
      return (data ?? []) as Rule[];
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const { data: flairs = [] } = useQuery<Flair[], Error>({
    queryKey: ["post-flairs", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("post_flairs").select("id, name, color, is_active").eq("community_id", communityId).eq("is_active", true).order("position").order("id");
      if (error) throw new Error(error.message);
      return (data ?? []) as Flair[];
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  if (isLoading) {
    return <main className="pb-16 pt-7"><div className="mx-auto max-w-4xl px-4 sm:px-6"><div className="yapster-card animate-pulse p-8"><div className="h-7 w-52 rounded bg-slate-100" /><div className="mt-6 space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-100" />)}</div></div></div></main>;
  }

  if (!community) {
    return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><h1 className="text-xl font-black text-slate-950">Community not found</h1><Link to="/communities" className="yapster-button yapster-button--primary mt-5">Browse communities</Link></div></div></main>;
  }

  const canManage = Boolean(user && (community.created_by === user.id || membership?.role === "moderator"));

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to={`/community/${communityId}`} className="text-xs font-extrabold text-violet-700 hover:text-violet-800">← Back to {community.name}</Link>
            <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.14em] text-orange-600">Community standards</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">Rules for {community.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Know what this community expects before posting or joining a discussion.</p>
          </div>
          {canManage && <Link to={`/community/${communityId}/settings`} className="yapster-button yapster-button--ghost w-fit">Manage rules & flairs</Link>}
        </div>

        <section className="yapster-card p-5 sm:p-7">
          {rules.length ? (
            <ol className="space-y-4">
              {rules.map((rule, index) => (
                <li key={rule.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-sm font-black text-orange-700 ring-1 ring-orange-100">{index + 1}</span>
                  <div><h2 className="font-black text-slate-950">{rule.title}</h2>{rule.description && <p className="mt-1.5 text-sm leading-6 text-slate-500">{rule.description}</p>}</div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="py-10 text-center"><p className="text-lg font-black text-slate-900">No written rules yet</p><p className="mt-2 text-sm text-slate-500">General Yapster safety and conduct expectations still apply.</p></div>
          )}
        </section>

        <section className="mt-6 yapster-card p-5 sm:p-7">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-violet-600">Post organization</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Active post flairs</h2>
          <p className="mt-1 text-sm text-slate-500">Flairs help members understand what kind of conversation a post belongs to.</p>
          {flairs.length ? <div className="mt-4 flex flex-wrap gap-2">{flairs.map((flair) => <span key={flair.id} className="rounded-full px-3 py-1.5 text-xs font-extrabold" style={{ backgroundColor: `${flair.color}20`, color: flair.color }}>{flair.name}</span>)}</div> : <p className="mt-4 text-sm text-slate-400">This community has not created any post flairs yet.</p>}
        </section>
      </div>
    </main>
  );
};
