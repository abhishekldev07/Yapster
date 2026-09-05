import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { CommunityDisplay } from "../components/CommunityDisplay";
import { useAuth } from "../context/AuthContext";
import { getFriendlyErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

interface CommunityPresentation {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  icon_url: string | null;
  banner_url: string | null;
}

interface CommunityAccess {
  canManage: boolean;
  isModerator: boolean;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 8 * 1024 * 1024;

const fetchCommunityAccess = async (communityId: number, userId: string): Promise<CommunityAccess> => {
  const { data, error } = await supabase.from("community_members").select("role, banned").eq("community_id", communityId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const isModerator = data?.role === "moderator" && !data?.banned;
  return { canManage: isModerator, isModerator };
};

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
const ToolArrow = () => <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M4 10h12m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export const CommunityPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const communityDisplayRef = useRef<HTMLDivElement>(null);
  const [ownerToolsOpen, setOwnerToolsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);

  const { data: presentation } = useQuery<CommunityPresentation | null, Error>({
    queryKey: ["community-presentation", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("id, name, description, created_by, icon_url, banner_url").eq("id", communityId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunityPresentation | null;
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
    staleTime: 30_000,
  });

  const isOwner = Boolean(user && presentation?.created_by === user.id);
  const { data: access } = useQuery<CommunityAccess, Error>({
    queryKey: ["community-can-manage", communityId, user?.id],
    queryFn: () => user ? fetchCommunityAccess(communityId, user.id) : Promise.resolve({ canManage: false, isModerator: false }),
    enabled: !!user && Number.isFinite(communityId) && communityId > 0 && !isOwner,
    retry: false,
  });
  const canManage = isOwner || Boolean(access?.canManage);

  const { data: openReportCount = 0 } = useQuery<number, Error>({
    queryKey: ["community-open-report-count", communityId],
    queryFn: async () => {
      const { count, error } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("community_id", communityId).in("status", ["open", "reviewing"]);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: canManage,
    retry: false,
  });

  const openDetails = () => {
    setEditName(presentation?.name ?? "");
    setEditDescription(presentation?.description ?? "");
    setIconFile(null);
    setBannerFile(null);
    setRemoveIcon(false);
    setRemoveBanner(false);
    setDetailsOpen(true);
  };

  const saveDetailsMutation = useMutation({
    mutationFn: async () => {
      if (!user || !isOwner || !presentation) throw new Error("Only the community owner can edit community details.");
      if (!editName.trim()) throw new Error("Community name is required.");
      let iconUrl = removeIcon ? null : presentation.icon_url;
      let bannerUrl = removeBanner ? null : presentation.banner_url;
      if (iconFile) iconUrl = await uploadCommunityMedia(user.id, iconFile, "icon");
      if (bannerFile) bannerUrl = await uploadCommunityMedia(user.id, bannerFile, "banner");
      const { error } = await supabase.from("communities").update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        icon_url: iconUrl,
        banner_url: bannerUrl,
      }).eq("id", communityId).eq("created_by", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setDetailsOpen(false);
      setIconFile(null);
      setBannerFile(null);
      setRemoveIcon(false);
      setRemoveBanner(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["community", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-presentation", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["community-settings-summary", communityId] }),
        queryClient.invalidateQueries({ queryKey: ["communities"] }),
        queryClient.invalidateQueries({ queryKey: ["trending-communities"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
      ]);
    },
  });

  useEffect(() => {
    const root = communityDisplayRef.current;
    if (!root) return;
    const decorateCommunityHero = () => {
      const section = root.querySelector("section");
      const hero = section?.firstElementChild as HTMLElement | null;
      if (!hero) return;
      if (presentation?.banner_url) {
        hero.style.backgroundImage = `linear-gradient(90deg, rgba(11,9,20,.80), rgba(11,9,20,.48)), url("${presentation.banner_url.replace(/"/g, "%22")}")`;
        hero.style.backgroundSize = "cover";
        hero.style.backgroundPosition = "center";
      } else {
        hero.style.removeProperty("background-image");
        hero.style.removeProperty("background-size");
        hero.style.removeProperty("background-position");
      }
      const avatar = hero.querySelector(".h-20.w-20") as HTMLElement | null;
      if (avatar && presentation?.icon_url) {
        avatar.style.backgroundImage = `url("${presentation.icon_url.replace(/"/g, "%22")}")`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.style.color = "transparent";
      } else if (avatar) {
        avatar.style.removeProperty("background-image");
        avatar.style.removeProperty("background-size");
        avatar.style.removeProperty("background-position");
        avatar.style.removeProperty("color");
      }
    };
    decorateCommunityHero();
    const observer = new MutationObserver(decorateCommunityHero);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [communityId, presentation?.banner_url, presentation?.icon_url]);

  const interceptManage = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwner) return;
    const button = (event.target as HTMLElement).closest("button");
    if (!button || button.textContent?.trim() !== "Manage") return;
    event.preventDefault();
    event.stopPropagation();
    setOwnerToolsOpen((current) => !current);
    setDetailsOpen(false);
  };

  const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60";

  return (
    <main className="yapster-community-page pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <Link to={`/community/${communityId}/rules`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-orange-200 hover:text-orange-700">Community rules <span aria-hidden="true">→</span></Link>
          {canManage && !isOwner && <>
            <Link to={`/community/${communityId}/moderation`} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100">Moderation{openReportCount > 0 ? ` · ${openReportCount}` : ""} <span aria-hidden="true">→</span></Link>
            <Link to={`/community/${communityId}/members/manage`} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200">Manage members <span aria-hidden="true">→</span></Link>
            <Link to={`/community/${communityId}/settings`} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200">Rules & flairs <span aria-hidden="true">→</span></Link>
          </>}
        </div>

        <div ref={communityDisplayRef} onClickCapture={interceptManage}><CommunityDisplay communityId={communityId} /></div>

        {ownerToolsOpen && isOwner && (
          <section className="mt-6 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Owner tools</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-slate-950">Manage community</h2><p className="mt-1 text-sm text-slate-500">Moderation, members, organization, and community identity in one place.</p></div>
              <button type="button" onClick={() => { setOwnerToolsOpen(false); setDetailsOpen(false); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">Close</button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Link to={`/community/${communityId}/moderation`} className="group rounded-2xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-slate-300 hover:bg-white"><span className="text-sm font-semibold text-slate-900">Moderation</span><p className="mt-1 text-xs leading-5 text-slate-500">Review reports and moderation history.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Open{openReportCount > 0 ? ` · ${openReportCount}` : ""}<ToolArrow /></span></Link>
              <Link to={`/community/${communityId}/members/manage`} className="group rounded-2xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-slate-300 hover:bg-white"><span className="text-sm font-semibold text-slate-900">Manage members</span><p className="mt-1 text-xs leading-5 text-slate-500">Remove members and handle member safety.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Open<ToolArrow /></span></Link>
              <Link to={`/community/${communityId}/settings`} className="group rounded-2xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-slate-300 hover:bg-white"><span className="text-sm font-semibold text-slate-900">Rules & flairs</span><p className="mt-1 text-xs leading-5 text-slate-500">Set standards and organize posts.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Open<ToolArrow /></span></Link>
              <button type="button" onClick={openDetails} className={`rounded-2xl border p-4 text-left transition ${detailsOpen ? "border-violet-300 bg-violet-50/50" : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white"}`}><span className="text-sm font-semibold text-slate-900">Edit community details</span><p className="mt-1 text-xs leading-5 text-slate-500">Name, description, icon, and cover image.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600">Edit<ToolArrow /></span></button>
            </div>

            {detailsOpen && (
              <form onSubmit={(event) => { event.preventDefault(); saveDetailsMutation.mutate(); }} className="mt-6 border-t border-slate-100 pt-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">Community name<input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} required className={`${fieldClass} mt-2`} /></label>
                  <label className="text-sm font-semibold text-slate-700 lg:col-span-2">Description<textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={4} maxLength={500} className={`${fieldClass} mt-2 resize-y leading-6`} /></label>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
                    <div className="flex items-center gap-3">{presentation?.icon_url && !removeIcon ? <img src={presentation.icon_url} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-slate-200 text-lg font-semibold text-slate-600">{editName.trim().slice(0,1).toUpperCase() || "Y"}</span>}<div><h3 className="text-sm font-semibold text-slate-800">Community icon</h3><p className="mt-1 text-xs text-slate-400">Square image · max 2 MB</p></div></div>
                    <div className="mt-4 flex flex-wrap items-center gap-2"><label className="yapster-upload-button cursor-pointer"><UploadIcon /> {iconFile ? "Choose another" : "Upload icon"}<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setIconFile(file); if (file) setRemoveIcon(false); }} /></label>{(presentation?.icon_url || iconFile) && <button type="button" onClick={() => { setIconFile(null); setRemoveIcon(true); }} className="rounded-lg px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-50">Remove</button>}</div>
                    {iconFile && <p className="mt-3 truncate text-xs text-slate-400">Selected: {iconFile.name}</p>}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">{presentation?.banner_url && !removeBanner ? <img src={presentation.banner_url} alt="" className="h-24 w-full object-cover" /> : <div className="grid h-24 place-items-center text-xs text-slate-400">No cover image</div>}</div>
                    <div className="mt-3"><h3 className="text-sm font-semibold text-slate-800">Cover banner</h3><p className="mt-1 text-xs text-slate-400">Wide image · max 8 MB</p></div>
                    <div className="mt-4 flex flex-wrap items-center gap-2"><label className="yapster-upload-button cursor-pointer"><UploadIcon /> {bannerFile ? "Choose another" : "Upload banner"}<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setBannerFile(file); if (file) setRemoveBanner(false); }} /></label>{(presentation?.banner_url || bannerFile) && <button type="button" onClick={() => { setBannerFile(null); setRemoveBanner(true); }} className="rounded-lg px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-50">Remove</button>}</div>
                    {bannerFile && <p className="mt-3 truncate text-xs text-slate-400">Selected: {bannerFile.name}</p>}
                  </div>
                </div>

                {saveDetailsMutation.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{getFriendlyErrorMessage(saveDetailsMutation.error, "Community details could not be saved.")}</div>}
                <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDetailsOpen(false)} className="yapster-button yapster-button--ghost">Cancel</button><button type="submit" disabled={saveDetailsMutation.isPending || !editName.trim()} className="yapster-button yapster-button--primary disabled:opacity-50">{saveDetailsMutation.isPending ? "Saving..." : "Save community details"}</button></div>
              </form>
            )}
          </section>
        )}
      </div>
    </main>
  );
};
