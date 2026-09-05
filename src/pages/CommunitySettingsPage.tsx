import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { getFriendlyErrorMessage } from "../lib/auth";

interface CommunitySummary {
  id: number;
  name: string;
  created_by: string | null;
  icon_url: string | null;
  banner_url: string | null;
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

interface PendingDelete {
  type: "rule" | "flair";
  id: number;
  label: string;
}

const palette = ["#7c3aed", "#db2777", "#ea580c", "#0891b2", "#059669", "#2563eb"];
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const hexToRgb = (hex: string) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};
const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;

const uploadCommunityMedia = async (userId: string, file: File, kind: "icon" | "banner") => {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error(`${kind === "icon" ? "Icon" : "Banner"} must be PNG, JPG, or WEBP.`);
  const limit = kind === "icon" ? MAX_ICON_BYTES : MAX_BANNER_BYTES;
  if (file.size > limit) throw new Error(`${kind === "icon" ? "Icon" : "Banner"} must be ${kind === "icon" ? "2" : "8"} MB or smaller.`);
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${Date.now()}-${kind}.${extension}`;
  const { error } = await supabase.storage.from("community-media").upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("community-media").getPublicUrl(path).data.publicUrl;
};

const UploadIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M12 16V5m0 0-4 4m4-4 4 4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export const CommunitySettingsPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [flairName, setFlairName] = useState("");
  const [flairColor, setFlairColor] = useState(palette[0]);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const { data: community, isLoading: communityLoading } = useQuery<CommunitySummary | null, Error>({
    queryKey: ["community-settings-summary", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id, name, created_by, icon_url, banner_url").eq("id", communityId).maybeSingle();
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

  const isOwner = Boolean(user && community?.created_by === user.id);
  const canManage = Boolean(user && community && (isOwner || membership?.role === "moderator"));

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
    onSuccess: () => { setRuleTitle(""); setRuleDescription(""); queryClient.invalidateQueries({ queryKey: ["community-rules", communityId] }); },
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: number) => {
      const { error } = await supabase.from("community_rules").delete().eq("id", ruleId).eq("community_id", communityId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setPendingDelete(null); queryClient.invalidateQueries({ queryKey: ["community-rules", communityId] }); },
  });

  const addFlair = useMutation({
    mutationFn: async () => {
      if (!flairName.trim()) throw new Error("Give the flair a name.");
      const { error } = await supabase.from("post_flairs").insert({ community_id: communityId, name: flairName.trim(), color: flairColor, position: flairs.length });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setFlairName(""); queryClient.invalidateQueries({ queryKey: ["post-flairs", communityId] }); },
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
    onSuccess: () => { setPendingDelete(null); queryClient.invalidateQueries({ queryKey: ["post-flairs", communityId] }); },
  });

  const appearanceMutation = useMutation({
    mutationFn: async ({ removeIcon = false, removeBanner = false }: { removeIcon?: boolean; removeBanner?: boolean } = {}) => {
      if (!user || !isOwner) throw new Error("Only the community owner can change community images.");
      let iconUrl = removeIcon ? null : community?.icon_url ?? null;
      let bannerUrl = removeBanner ? null : community?.banner_url ?? null;
      if (iconFile) iconUrl = await uploadCommunityMedia(user.id, iconFile, "icon");
      if (bannerFile) bannerUrl = await uploadCommunityMedia(user.id, bannerFile, "banner");
      const { error } = await supabase.from("communities").update({ icon_url: iconUrl, banner_url: bannerUrl }).eq("id", communityId).eq("created_by", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setIconFile(null);
      setBannerFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["community-settings-summary", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-presentation", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["communities"] }),
        queryClient.invalidateQueries({ queryKey: ["trending-communities"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
      ]);
    },
  });

  if (communityLoading) return <main className="pb-16 pt-7"><div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="yapster-card animate-pulse p-8"><div className="h-7 w-56 rounded bg-slate-100" /><div className="mt-5 h-40 rounded-2xl bg-slate-100" /></div></div></main>;
  if (!community) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><h1 className="text-xl font-bold text-slate-950">Community not found</h1><Link to="/communities" className="yapster-button yapster-button--primary mt-5">Browse communities</Link></div></div></main>;
  if (!user || !canManage) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-600">Community tools</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Manager access required</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Only the community owner and moderators can manage rules and post flairs.</p><Link to={`/community/${communityId}`} className="yapster-button yapster-button--primary mt-5">Back to {community.name}</Link></div></div></main>;

  const mutationError = addRule.error || deleteRule.error || addFlair.error || toggleFlair.error || deleteFlair.error || appearanceMutation.error;
  const deletePending = deleteRule.isPending || deleteFlair.isPending;
  const rgb = hexToRgb(flairColor);
  const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100/60";

  return (
    <>
      <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mb-7">
            <Link to={`/community/${communityId}`} className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900">← Back to community</Link>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Mod tools</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.04em] text-slate-950">Rules & post flairs</h1><p className="mt-2 text-sm text-slate-500">Set expectations for {community.name} and organize its conversations.</p></div>
              <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{isOwner ? "Owner" : "Moderator"}</span>
            </div>
          </div>

          {mutationError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{getFriendlyErrorMessage(mutationError, "The change could not be saved.")}</div>}

          {isOwner && (
            <section className="yapster-card mb-6 p-5 sm:p-6">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Appearance</p><h2 className="mt-1 text-xl font-bold text-slate-950">Community images</h2><p className="mt-1 text-sm text-slate-500">Change the icon and cover banner shown across Yapster.</p></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
                  <div className="flex items-center gap-3">{community.icon_url ? <img src={community.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-slate-200 text-lg font-semibold text-slate-600">{community.name.trim().slice(0,1).toUpperCase()}</div>}<div><h3 className="text-sm font-semibold text-slate-800">Community icon</h3><p className="mt-1 text-xs text-slate-400">Square · max 2 MB</p></div></div>
                  <div className="mt-4 flex flex-wrap gap-2"><label className="yapster-upload-button cursor-pointer"><UploadIcon /> {community.icon_url ? "Choose replacement" : "Choose icon"}<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setIconFile(event.target.files?.[0] || null)} /></label>{community.icon_url && <button type="button" onClick={() => appearanceMutation.mutate({ removeIcon: true })} className="rounded-lg px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50">Remove</button>}</div>{iconFile && <p className="mt-2 truncate text-xs text-slate-400">Selected: {iconFile.name}</p>}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
                  <div className="overflow-hidden rounded-xl bg-slate-200">{community.banner_url ? <img src={community.banner_url} alt="" className="h-20 w-full object-cover" /> : <div className="h-20 bg-gradient-to-r from-slate-800 to-slate-700" />}</div><div className="mt-3"><h3 className="text-sm font-semibold text-slate-800">Cover banner</h3><p className="mt-1 text-xs text-slate-400">Wide image · max 8 MB</p></div>
                  <div className="mt-4 flex flex-wrap gap-2"><label className="yapster-upload-button cursor-pointer"><UploadIcon /> {community.banner_url ? "Choose replacement" : "Choose banner"}<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /></label>{community.banner_url && <button type="button" onClick={() => appearanceMutation.mutate({ removeBanner: true })} className="rounded-lg px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50">Remove</button>}</div>{bannerFile && <p className="mt-2 truncate text-xs text-slate-400">Selected: {bannerFile.name}</p>}
                </div>
              </div>
              {(iconFile || bannerFile) && <div className="mt-4 flex justify-end"><button type="button" onClick={() => appearanceMutation.mutate({})} disabled={appearanceMutation.isPending} className="yapster-button yapster-button--primary disabled:opacity-50">{appearanceMutation.isPending ? "Saving..." : "Save images"}</button></div>}
            </section>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className="yapster-card p-5 sm:p-6">
              <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-orange-600">Community standards</p><h2 className="mt-1 text-xl font-bold text-slate-950">Rules</h2></div><span className="text-xs font-medium text-slate-400">{rules.length} total</span></div>

              <form className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4" onSubmit={(event) => { event.preventDefault(); addRule.mutate(); }}>
                <input value={ruleTitle} onChange={(event) => setRuleTitle(event.target.value)} maxLength={120} placeholder="Rule title — e.g. Stay on topic" className={fieldClass} />
                <textarea value={ruleDescription} onChange={(event) => setRuleDescription(event.target.value)} rows={3} placeholder="Explain what this rule means..." className={`${fieldClass} resize-y leading-6`} />
                <div className="flex justify-end"><button type="submit" disabled={addRule.isPending || !ruleTitle.trim()} className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-50">{addRule.isPending ? "Adding..." : "Add rule"}</button></div>
              </form>

              <div className="mt-5 space-y-3">
                {rulesLoading ? <p className="text-sm text-slate-400">Loading rules...</p> : rules.length ? rules.map((rule, index) => (
                  <div key={rule.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">{index + 1}</span>
                    <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{rule.title}</h3>{rule.description && <p className="mt-1 text-sm leading-6 text-slate-500">{rule.description}</p>}</div>
                    <button type="button" onClick={() => setPendingDelete({ type: "rule", id: rule.id, label: rule.title })} className="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                  </div>
                )) : <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No community rules yet.</div>}
              </div>
            </section>

            <section className="yapster-card p-5 sm:p-6">
              <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-600">Organization</p><h2 className="mt-1 text-xl font-bold text-slate-950">Post flairs</h2></div><span className="text-xs font-medium text-slate-400">{flairs.length} total</span></div>

              <form className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4" onSubmit={(event) => { event.preventDefault(); addFlair.mutate(); }}>
                <input value={flairName} onChange={(event) => setFlairName(event.target.value)} maxLength={40} placeholder="Flair name — e.g. Question" className={fieldClass} />
                <div className="mt-4 flex flex-wrap items-center gap-2">{palette.map((color) => <button key={color} type="button" onClick={() => setFlairColor(color)} className={`h-7 w-7 rounded-full transition ${flairColor === color ? "ring-2 ring-slate-500 ring-offset-2" : "ring-1 ring-slate-200"}`} style={{ backgroundColor: color }} aria-label={`Use ${color} for flair`} />)}<input type="color" value={flairColor} onChange={(event) => setFlairColor(event.target.value)} className="ml-1 h-8 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" aria-label="Custom flair color" /></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end"><label className="text-xs font-medium text-slate-500">Hex<input value={flairColor.toUpperCase()} onChange={(event) => { if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) setFlairColor(event.target.value); }} className="mt-1.5 block w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal text-slate-700 outline-none" /></label><div><span className="text-xs font-medium text-slate-500">RGB</span><div className="mt-1.5 flex gap-1.5">{(["r","g","b"] as const).map((channel) => <label key={channel} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><span className="text-[10px] uppercase text-slate-400">{channel}</span><input type="number" min={0} max={255} value={rgb[channel]} onChange={(event) => { const next = { ...rgb, [channel]: Math.max(0, Math.min(255, Number(event.target.value) || 0)) }; setFlairColor(rgbToHex(next.r, next.g, next.b)); }} className="w-10 border-0 bg-transparent p-0 text-xs font-normal text-slate-700 outline-none" /></label>)}</div></div></div>
                <div className="mt-4 flex items-center justify-between gap-3"><span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${flairColor}20`, color: flairColor }}>{flairName.trim() || "Preview"}</span><button type="submit" disabled={addFlair.isPending || !flairName.trim()} className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-50">{addFlair.isPending ? "Adding..." : "Add flair"}</button></div>
              </form>

              <div className="mt-5 space-y-3">
                {flairsLoading ? <p className="text-sm text-slate-400">Loading flairs...</p> : flairs.length ? flairs.map((flair) => (
                  <div key={flair.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: flair.color }} />
                    <span className={`min-w-0 flex-1 truncate font-semibold ${flair.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>{flair.name}</span>
                    <button type="button" onClick={() => toggleFlair.mutate(flair)} className="text-xs font-medium text-violet-600 hover:text-violet-800">{flair.is_active ? "Disable" : "Enable"}</button>
                    <button type="button" onClick={() => setPendingDelete({ type: "flair", id: flair.id, label: flair.name })} className="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                  </div>
                )) : <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No post flairs yet.</div>}
              </div>
            </section>
          </div>
        </div>
      </main>

      <ConfirmDialog open={!!pendingDelete} title={`Delete ${pendingDelete?.type || "item"}?`} description={pendingDelete ? `“${pendingDelete.label}” will be permanently removed.` : undefined} confirmLabel="Delete" isPending={deletePending} onCancel={() => setPendingDelete(null)} onConfirm={() => { if (!pendingDelete) return; if (pendingDelete.type === "rule") deleteRule.mutate(pendingDelete.id); else deleteFlair.mutate(pendingDelete.id); }} />
    </>
  );
};
