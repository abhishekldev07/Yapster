import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { COMMUNITY_CATEGORIES, CommunityCategory } from "../lib/communityCategories";
import { getFriendlyErrorMessage } from "../lib/auth";
import { supabase } from "../supabase-client";

interface CommunityRuleDraft { title: string; description: string; }
interface FlairDraft { name: string; color: string; }
interface UploadResult { url: string; path: string; }

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 8 * 1024 * 1024;

const readPreview = (file: File, callback: (value: string) => void) => {
  const reader = new FileReader();
  reader.onload = () => callback(String(reader.result));
  reader.readAsDataURL(file);
};

const uploadCommunityMedia = async (userId: string, file: File, kind: "icon" | "banner"): Promise<UploadResult> => {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error(`${kind === "icon" ? "Icon" : "Banner"} must be PNG, JPG, or WEBP.`);
  const limit = kind === "icon" ? MAX_ICON_BYTES : MAX_BANNER_BYTES;
  if (file.size > limit) throw new Error(`${kind === "icon" ? "Icon" : "Banner"} must be ${kind === "icon" ? "2" : "8"} MB or smaller.`);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${Date.now()}-${kind}.${ext}`;
  const { error } = await supabase.storage.from("community-media").upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return { path, url: supabase.storage.from("community-media").getPublicUrl(path).data.publicUrl };
};

export const CreateCommunity = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CommunityCategory>("Other");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [rules, setRules] = useState<CommunityRuleDraft[]>([{ title: "", description: "" }]);
  const [flairs, setFlairs] = useState<FlairDraft[]>([{ name: "", color: "#7c3aed" }]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You must be signed in to create a community.");
      if (!name.trim()) throw new Error("Community name is required.");

      const uploadedPaths: string[] = [];
      try {
        const icon = iconFile ? await uploadCommunityMedia(user.id, iconFile, "icon") : null;
        if (icon) uploadedPaths.push(icon.path);
        const banner = bannerFile ? await uploadCommunityMedia(user.id, bannerFile, "banner") : null;
        if (banner) uploadedPaths.push(banner.path);

        const cleanRules = rules
          .map((rule) => ({ title: rule.title.trim(), description: rule.description.trim() }))
          .filter((rule) => rule.title);
        const cleanFlairs = flairs
          .map((flair) => ({ name: flair.name.trim(), color: flair.color }))
          .filter((flair) => flair.name);

        const { data, error } = await supabase.rpc("create_community_bundle", {
          p_name: name.trim(),
          p_description: description.trim(),
          p_category: category,
          p_icon_url: icon?.url ?? null,
          p_banner_url: banner?.url ?? null,
          p_rules: cleanRules,
          p_flairs: cleanFlairs,
        });
        if (error) throw new Error(error.message);
        const id = Number(data);
        if (!Number.isFinite(id) || id <= 0) throw new Error("Community was created but its ID could not be resolved.");
        return id;
      } catch (error) {
        if (uploadedPaths.length) await supabase.storage.from("community-media").remove(uploadedPaths);
        throw error;
      }
    },
    onSuccess: async (communityId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["communities"] }),
        queryClient.invalidateQueries({ queryKey: ["community-trend-stats"] }),
      ]);
      navigate(`/community/${communityId}`);
    },
  });

  const fieldClassName = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60";
  const cleanName = name.trim() || "Your community";

  if (!user) {
    return <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"><div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" /><div className="p-8 text-center"><img src="/yapster-mark.svg" alt="" className="mx-auto h-12 w-12" /><h2 className="mt-4 text-2xl font-black text-slate-950">Sign in to start a community</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create a space, set its identity and rules, and become its first admin.</p><Link to="/login" className="yapster-button yapster-button--primary mt-5">Sign in</Link></div></section>;
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="p-5 sm:p-7">
          <div><h2 className="text-xl font-black text-slate-950">Build your community</h2><p className="mt-1 text-sm text-slate-500">Set up the identity, category, rules, and post flairs before you open the doors.</p></div>

          <div className="mt-6 space-y-6">
            <section className="space-y-4">
              <div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">1 · Basics</p></div>
              <label className="block text-sm font-extrabold text-slate-700">Community name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="e.g. Indie Game Dev" className={`${fieldClassName} mt-2`} required /></label>
              <label className="block text-sm font-extrabold text-slate-700">Category<select value={category} onChange={(event) => setCategory(event.target.value as CommunityCategory)} className={`${fieldClassName} mt-2`}>{COMMUNITY_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="block text-sm font-extrabold text-slate-700">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={500} placeholder="What is this community for?" className={`${fieldClassName} mt-2 resize-y leading-6`} /><span className="mt-1.5 flex justify-end text-[11px] font-medium text-slate-400">{description.length}/500</span></label>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">2 · Branding</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-extrabold text-slate-700">Community icon <span className="font-medium text-slate-400">· optional</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setIconFile(file); if (file && file.size <= MAX_ICON_BYTES) readPreview(file, setIconPreview); else setIconPreview(null); }} className="mt-2 block w-full text-sm font-normal text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-violet-700" /><span className="mt-1 block text-[11px] font-medium text-slate-400">Square image · max 2 MB.</span>{iconFile && iconFile.size > MAX_ICON_BYTES && <span className="mt-1 block text-xs text-red-600">Icon is larger than 2 MB.</span>}</label>
                <label className="block text-sm font-extrabold text-slate-700">Banner <span className="font-medium text-slate-400">· optional</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setBannerFile(file); if (file && file.size <= MAX_BANNER_BYTES) readPreview(file, setBannerPreview); else setBannerPreview(null); }} className="mt-2 block w-full text-sm font-normal text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-violet-700" /><span className="mt-1 block text-[11px] font-medium text-slate-400">Wide image · max 8 MB.</span>{bannerFile && bannerFile.size > MAX_BANNER_BYTES && <span className="mt-1 block text-xs text-red-600">Banner is larger than 8 MB.</span>}</label>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">3 · Rules</p><p className="mt-1 text-xs text-slate-400">You can add up to 10 now and edit them later.</p></div>{rules.length < 10 && <button type="button" onClick={() => setRules((current) => [...current, { title: "", description: "" }])} className="text-xs font-extrabold text-violet-700">+ Add rule</button>}</div>
              <div className="mt-3 space-y-3">{rules.map((rule, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"><div className="flex gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-black text-violet-700 ring-1 ring-slate-200">{index + 1}</span><div className="min-w-0 flex-1 space-y-2"><input value={rule.title} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} maxLength={80} placeholder="Rule title" className={fieldClassName} /><textarea value={rule.description} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} rows={2} maxLength={300} placeholder="What does this rule mean?" className={`${fieldClassName} resize-y`} /></div>{rules.length > 1 && <button type="button" onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="self-start rounded-lg px-2 py-1 text-xs font-black text-red-500">×</button>}</div></div>)}</div>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-600">4 · Post flairs</p><p className="mt-1 text-xs text-slate-400">Optional labels members can attach to posts.</p></div>{flairs.length < 12 && <button type="button" onClick={() => setFlairs((current) => [...current, { name: "", color: "#7c3aed" }])} className="text-xs font-extrabold text-violet-700">+ Add flair</button>}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">{flairs.map((flair, index) => <div key={index} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"><input type="color" value={flair.color} onChange={(event) => setFlairs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))} className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={`Flair ${index + 1} color`} /><input value={flair.name} onChange={(event) => setFlairs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} maxLength={40} placeholder="e.g. Discussion" className={`${fieldClassName} min-w-0 flex-1`} />{flairs.length > 1 && <button type="button" onClick={() => setFlairs((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="px-1 text-sm font-black text-red-500">×</button>}</div>)}</div>
            </section>
          </div>

          {mutation.error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{getFriendlyErrorMessage(mutation.error, "Unable to create community. Please try again.")}</div>}
          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => navigate(-1)} className="yapster-button yapster-button--ghost">Cancel</button><button type="submit" disabled={mutation.isPending || !name.trim() || Boolean(iconFile && iconFile.size > MAX_ICON_BYTES) || Boolean(bannerFile && bannerFile.size > MAX_BANNER_BYTES)} className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-50">{mutation.isPending ? "Creating..." : "Create community"}</button></div>
        </form>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0 sm:p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Live preview</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative h-24 overflow-hidden bg-[#12121b]">{bannerPreview ? <img src={bannerPreview} alt="Banner preview" className="h-full w-full object-cover" /> : <><div className="absolute -left-8 -top-12 h-32 w-32 rounded-full bg-orange-500/30 blur-2xl" /><div className="absolute -right-5 -top-12 h-36 w-36 rounded-full bg-violet-600/40 blur-2xl" /></>}</div>
            <div className="p-4"><div className="flex items-center gap-3"><span className="-mt-8 grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-white bg-gradient-to-br from-orange-100 via-pink-100 to-violet-100 text-lg font-black text-violet-800">{iconPreview ? <img src={iconPreview} alt="Icon preview" className="h-full w-full object-cover" /> : cleanName.slice(0,1).toUpperCase()}</span><div className="min-w-0"><strong className="block truncate text-base font-extrabold text-slate-950">{cleanName}</strong><span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-violet-600">{category}</span></div></div><p className="mt-4 text-xs leading-5 text-slate-500">{description.trim() || "A clear description helps people understand what belongs here."}</p><div className="mt-4 flex flex-wrap gap-1.5">{flairs.filter((flair) => flair.name.trim()).slice(0,4).map((flair, index) => <span key={index} className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ backgroundColor: `${flair.color}20`, color: flair.color }}>{flair.name.trim()}</span>)}</div></div>
          </div>
          <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50/60 p-3.5"><p className="text-xs font-extrabold text-violet-800">You’ll be the owner</p><p className="mt-1 text-[11px] leading-5 text-violet-700/70">You can edit the identity, rules, flairs, and moderation team after creation.</p></div>
        </aside>
      </div>
    </section>
  );
};
