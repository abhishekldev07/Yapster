import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { getFriendlyErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

interface CommunityRecord {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  icon_url: string | null;
  banner_url: string | null;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 8 * 1024 * 1024;

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
const Arrow = () => <span aria-hidden="true">→</span>;

export const ManageCommunityPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const communityQuery = useQuery<CommunityRecord | null, Error>({
    queryKey: ["manage-community", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id, name, description, created_by, icon_url, banner_url").eq("id", communityId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunityRecord | null;
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
  });

  const community = communityQuery.data;
  const isOwner = Boolean(user && community?.created_by === user.id);

  const reportsQuery = useQuery<number, Error>({
    queryKey: ["community-open-report-count", communityId],
    queryFn: async () => {
      const { count, error } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("community_id", communityId).in("status", ["open", "reviewing"]);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: isOwner,
    retry: false,
  });

  if (community && isOwner && !editorReady) {
    setName(community.name);
    setDescription(community.description ?? "");
    setEditorReady(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !community || !isOwner) throw new Error("Only the community owner can edit community details.");
      if (!name.trim()) throw new Error("Community name is required.");
      let iconUrl = removeIcon ? null : community.icon_url;
      let bannerUrl = removeBanner ? null : community.banner_url;
      if (iconFile) iconUrl = await uploadCommunityMedia(user.id, iconFile, "icon");
      if (bannerFile) bannerUrl = await uploadCommunityMedia(user.id, bannerFile, "banner");
      const { error } = await supabase.from("communities").update({ name: name.trim(), description: description.trim() || null, icon_url: iconUrl, banner_url: bannerUrl }).eq("id", communityId).eq("created_by", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setIconFile(null);
      setBannerFile(null);
      setRemoveIcon(false);
      setRemoveBanner(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["manage-community", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-presentation", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-settings-summary", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["communities"] }),
        queryClient.invalidateQueries({ queryKey: ["trending-communities"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
      ]);
    },
  });

  if (communityQuery.isLoading) return <main className="pb-16 pt-7"><div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="yapster-card animate-pulse p-8"><div className="h-8 w-64 rounded bg-slate-100" /><div className="mt-6 h-52 rounded-2xl bg-slate-100" /></div></div></main>;
  if (!community) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-8 text-center"><h1 className="text-xl font-bold text-slate-950">Community not found</h1></div></div></main>;
  if (!user || !isOwner) return <main className="pb-16 pt-7"><div className="mx-auto max-w-3xl px-4 sm:px-6"><div className="yapster-card p-9 text-center"><h1 className="text-2xl font-bold text-slate-950">Owner access required</h1><p className="mt-2 text-sm text-slate-500">Only the community owner can open the owner tools page.</p><Link to={`/community/${communityId}`} className="yapster-button yapster-button--primary mt-5">Back to community</Link></div></div></main>;

  const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60";
  const openReports = reportsQuery.data ?? 0;

  return (
    <main className="pb-16 pt-7 max-[760px]:pb-24 max-[760px]:pt-4">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <header className="mb-7">
          <Link to={`/community/${communityId}`} className="yapster-back-community">← Back to community</Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Owner tools</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em] text-slate-950">Manage community</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Moderation, members, organization, and community identity in one place.</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link to={`/community/${communityId}/moderation`} className="yapster-card group p-4 transition hover:border-slate-300"><h2 className="text-sm font-semibold text-slate-900">Moderation</h2><p className="mt-1 text-xs leading-5 text-slate-500">Review reports and moderation history.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Open{openReports > 0 ? ` · ${openReports}` : ""} <Arrow /></span></Link>
          <Link to={`/community/${communityId}/members/manage`} className="yapster-card group p-4 transition hover:border-slate-300"><h2 className="text-sm font-semibold text-slate-900">Manage members</h2><p className="mt-1 text-xs leading-5 text-slate-500">Remove members and handle member safety.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Open <Arrow /></span></Link>
          <Link to={`/community/${communityId}/settings`} className="yapster-card group p-4 transition hover:border-slate-300"><h2 className="text-sm font-semibold text-slate-900">Rules & flairs</h2><p className="mt-1 text-xs leading-5 text-slate-500">Set standards and organize posts.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Open <Arrow /></span></Link>
          <a href="#community-details" className="yapster-card group p-4 transition hover:border-slate-300"><h2 className="text-sm font-semibold text-slate-900">Edit community details</h2><p className="mt-1 text-xs leading-5 text-slate-500">Name, description, icon, and cover image.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Edit <Arrow /></span></a>
        </section>

        <section id="community-details" className="yapster-card mt-6 scroll-mt-24 p-5 sm:p-6">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Community details</p><h2 className="mt-1 text-xl font-bold text-slate-950">Identity & appearance</h2><p className="mt-1 text-sm text-slate-500">Update the public name, description, icon, and cover banner.</p></div>

          <form onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }} className="mt-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 lg:col-span-2">Community name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required className={`${fieldClass} mt-2`} /></label>
              <label className="text-sm font-semibold text-slate-700 lg:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={500} className={`${fieldClass} mt-2 resize-y leading-6`} /></label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
                <div className="flex items-center gap-3">{community.icon_url && !removeIcon ? <img src={community.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-slate-200 text-lg font-semibold text-slate-600">{name.trim().slice(0,1).toUpperCase() || "Y"}</span>}<div><h3 className="text-sm font-semibold text-slate-800">Community icon</h3><p className="mt-1 text-xs text-slate-400">Square image · max 2 MB</p></div></div>
                <div className="mt-4 flex flex-wrap items-center gap-2"><label className="yapster-upload-button cursor-pointer"><UploadIcon /> {iconFile ? "Choose another" : "Upload icon"}<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setIconFile(file); if (file) setRemoveIcon(false); }} /></label>{(community.icon_url || iconFile) && <button type="button" onClick={() => { setIconFile(null); setRemoveIcon(true); }} className="rounded-lg px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-50">Remove</button>}</div>
                {iconFile && <p className="mt-3 truncate text-xs text-slate-400">Selected: {iconFile.name}</p>}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">{community.banner_url && !removeBanner ? <img src={community.banner_url} alt="" className="h-24 w-full object-cover" /> : <div className="grid h-24 place-items-center text-xs text-slate-400">No cover image</div>}</div>
                <div className="mt-3"><h3 className="text-sm font-semibold text-slate-800">Cover banner</h3><p className="mt-1 text-xs text-slate-400">Wide image · max 8 MB</p></div>
                <div className="mt-4 flex flex-wrap items-center gap-2"><label className="yapster-upload-button cursor-pointer"><UploadIcon /> {bannerFile ? "Choose another" : "Upload banner"}<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setBannerFile(file); if (file) setRemoveBanner(false); }} /></label>{(community.banner_url || bannerFile) && <button type="button" onClick={() => { setBannerFile(null); setRemoveBanner(true); }} className="rounded-lg px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-50">Remove</button>}</div>
                {bannerFile && <p className="mt-3 truncate text-xs text-slate-400">Selected: {bannerFile.name}</p>}
              </div>
            </div>

            {saveMutation.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{getFriendlyErrorMessage(saveMutation.error, "Community details could not be saved.")}</div>}
            {saveMutation.isSuccess && <p className="mt-4 text-sm font-medium text-emerald-600">Community details saved.</p>}
            <div className="mt-5 flex justify-end"><button type="submit" disabled={saveMutation.isPending || !name.trim()} className="yapster-button yapster-button--primary disabled:opacity-50">{saveMutation.isPending ? "Saving..." : "Save community details"}</button></div>
          </form>
        </section>
      </div>
    </main>
  );
};