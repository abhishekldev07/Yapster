import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { getFriendlyErrorMessage } from "../lib/auth";

interface CommunitySummary {
  id: number;
  name: string;
  created_by: string | null;
}

interface Rule {
  id: number;
  title: string;
  description: string;
  position: number;
}

interface Flair {
  id: number;
  name: string;
  color: string;
  is_active: boolean;
}

const palette = ["#7c3aed", "#db2777", "#ea580c", "#0891b2", "#059669", "#2563eb"];

export const CommunitySettingsPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [flairName, setFlairName] = useState("");
  const [flairColor, setFlairColor] = useState(palette[0]);

  const { data: community, isLoading: communityLoading } = useQuery<CommunitySummary | null, Error>({
    queryKey: ["community-settings-summary", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id, name, created_by").eq("id", communityId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunitySummary | null;
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const { data: membership } = useQuery<{ role: string | null } | null, Error>({
    queryKey: ["community-settings-role", communityId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("community_members").select("role").eq("community_id", communityId).eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { role: string | null } | null;
    },
    enabled: !!user && Number.isFinite(communityId) && communityId > 0,
    retry: false,
  });

  const canManage = Boolean(user && community && (community.created_by === user.id || membership?.role === "moderator"));

  const { data: rules = [], isLoading: rulesLoading } = useQuery<Rule[], Error>({
    queryKey: ["community-rules", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("community_rules").select("id, title, description, position").eq("community_id", communityId).order("position").order("id");
      if (error) throw new Error(error.message);
      return (data ?? []) as Rule[];
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const { data: flairs = [], isLoading: flairsLoading } = useQuery<Flair[], Error>({
    queryKey: ["post-flairs", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("post_flairs").select("id, name, color, is_active").eq("community_id", communityId).order("position").order("id");
      if (error) throw new Error(error.message);
      return (data ?? []) as Flair[];
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const addRule = useMutation({
    mutationFn: async () => {
      if (!ruleTitle.trim()) throw new Error("Give the rule a title.");
      const { error } = await supabase.from("community_rules").insert({ community_id: communityId, title: ruleTitle.trim(), description: ruleDescription.trim(), position: rules.length });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setRuleTitle("");
      setRuleDescription("");
      queryClient.invalidateQueries({ queryKey: ["community-rules", communityId] });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: number) => {
      const { error } = await supabase.from("community_rules").delete().eq("id", ruleId).eq("community_id", communityId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community-rules", communityId] }),
  });

  const addFlair = useMutation({
    mutationFn: async () => {
      if (!flairName.trim()) throw new Error("Give the flair a name.");
      const { error } = await supabase.from("post_flairs").insert({ community_id: communityId, name: flairName.trim(), color: flairColor, position: flairs.length });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setFlairName("");
      queryClient.invalidateQueries({ queryKey: ["post-flairs", communityId] });
    },
  });

  const toggleFlair = useMutation({
    mutationFn: async (flair: Flair) => {
      const { error } = await supabase.from("post_flairs").update({ is_active: !flair.is_active }).eq("id", flair.id).eq("community_id", communityId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["post-flairs", communityId] }),
  });

  const deleteFlair = useMutation({
    mutationFn: async (flairId: number) => {
      const { error } = await supabase.from("post_flairs").delete().eq("id", flairId).eq("community_id", communityId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["post-flairs", communityId] }),
  });

  if (communityLoading) {
    return <main className="pb-16 pt-7"><div className="mx-auto max-w-4xl px-4 sm:px-6"><div className="yapster-card animate-pulse p-8"><div className="h-7 w-56 rounded bg-slate-100" /><div className="mt-5 h-40 rounded-2xl bg-slate-100" /></div></div></main>;
  }

  if (!community) {
    return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><h1 className="text-xl font-black text-slate-950">Community not found</h1><Link to="/communities" className="yapster-button yapster-button--primary mt-5">Browse communities</Link></div></div></main>;
  }

  if (!user || !canManage) {
    return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">Community tools</p><h1 className="mt-2 text-2xl font-black text-slate-950">Manager access required</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Only the community owner and moderators can manage rules and post flairs.</p><Link to={`/community/${communityId}`} className="yapster-button yapster-button--primary mt-5">Back to {community.name}</Link></div></div></main>;
  }

  const mutationError = addRule.error || deleteRule.error || addFlair.error || toggleFlair.error || deleteFlair.error;

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to={`/community/${communityId}`} className="text-xs font-extrabold text-violet-700 hover:text-violet-800">← Back to community</Link>
            <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">Mod tools</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">Rules & post flairs</h1>
            <p className="mt-2 text-sm text-slate-500">Set expectations for {community.name} and organize its conversations.</p>
          </div>
          <span className="w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-extrabold text-violet-700">{community.created_by === user.id ? "Owner" : "Moderator"}</span>
        </div>

        {mutationError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{getFriendlyErrorMessage(mutationError, "The change could not be saved.")}</div>}

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="yapster-card p-5 sm:p-6">
            <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-orange-600">Community standards</p><h2 className="mt-1 text-xl font-black text-slate-950">Rules</h2></div><span className="text-xs font-bold text-slate-400">{rules.length} total</span></div>

            <form className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4" onSubmit={(event) => { event.preventDefault(); addRule.mutate(); }}>
              <input value={ruleTitle} onChange={(event) => setRuleTitle(event.target.value)} maxLength={120} placeholder="Rule title — e.g. Stay on topic" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100/60" />
              <textarea value={ruleDescription} onChange={(event) => setRuleDescription(event.target.value)} rows={3} placeholder="Explain what this rule means..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100/60" />
              <div className="flex justify-end"><button type="submit" disabled={addRule.isPending || !ruleTitle.trim()} className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-50">{addRule.isPending ? "Adding..." : "Add rule"}</button></div>
            </form>

            <div className="mt-5 space-y-3">
              {rulesLoading ? <p className="text-sm text-slate-400">Loading rules...</p> : rules.length ? rules.map((rule, index) => (
                <div key={rule.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-orange-50 text-xs font-black text-orange-700">{index + 1}</span>
                  <div className="min-w-0 flex-1"><h3 className="font-extrabold text-slate-900">{rule.title}</h3>{rule.description && <p className="mt-1 text-sm leading-6 text-slate-500">{rule.description}</p>}</div>
                  <button type="button" onClick={() => window.confirm("Delete this community rule?") && deleteRule.mutate(rule.id)} className="text-xs font-extrabold text-red-500 hover:text-red-700">Delete</button>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No community rules yet.</div>}
            </div>
          </section>

          <section className="yapster-card p-5 sm:p-6">
            <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-violet-600">Organization</p><h2 className="mt-1 text-xl font-black text-slate-950">Post flairs</h2></div><span className="text-xs font-bold text-slate-400">{flairs.length} total</span></div>

            <form className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4" onSubmit={(event) => { event.preventDefault(); addFlair.mutate(); }}>
              <input value={flairName} onChange={(event) => setFlairName(event.target.value)} maxLength={40} placeholder="Flair name — e.g. Question" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100/60" />
              <div className="mt-3 flex flex-wrap gap-2">{palette.map((color) => <button key={color} type="button" onClick={() => setFlairColor(color)} className={`h-8 w-8 rounded-full border-2 transition ${flairColor === color ? "scale-110 border-slate-950" : "border-white ring-1 ring-slate-200"}`} style={{ backgroundColor: color }} aria-label={`Use ${color} for flair`} />)}</div>
              <div className="mt-4 flex items-center justify-between gap-3"><span className="rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ backgroundColor: `${flairColor}20`, color: flairColor }}>{flairName.trim() || "Preview"}</span><button type="submit" disabled={addFlair.isPending || !flairName.trim()} className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-50">{addFlair.isPending ? "Adding..." : "Add flair"}</button></div>
            </form>

            <div className="mt-5 space-y-3">
              {flairsLoading ? <p className="text-sm text-slate-400">Loading flairs...</p> : flairs.length ? flairs.map((flair) => (
                <div key={flair.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: flair.color }} />
                  <span className={`min-w-0 flex-1 truncate font-extrabold ${flair.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>{flair.name}</span>
                  <button type="button" onClick={() => toggleFlair.mutate(flair)} className="text-xs font-extrabold text-violet-600 hover:text-violet-800">{flair.is_active ? "Disable" : "Enable"}</button>
                  <button type="button" onClick={() => window.confirm("Delete this post flair?") && deleteFlair.mutate(flair.id)} className="text-xs font-extrabold text-red-500 hover:text-red-700">Delete</button>
                </div>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No post flairs yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};
