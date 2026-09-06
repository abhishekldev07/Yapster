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

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized.length === 3 ? normalized.split("").map((value) => value + value).join("") : normalized, 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
};

const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;

const UploadIcon = () => <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d="M12 16V5m0 0-4 4m4-4 4 4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export const CreateCommunity = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CommunityCategory>("Other");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
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

        const cleanRules = rules.map((rule) => ({ title: rule.title.trim(), description: rule.description.trim() })).filter((rule) => rule.title);
        const cleanFlairs = flairs.map((flair) => ({ name: flair.name.trim(), color: flair.color })).filter((flair) => flair.name);

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
        queryClient.invalidateQueries({ queryKey: ["trending-communities"] }),
      ]);
      navigate(`/community/${communityId}`);
    },
  });

  const fieldClassName = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-800 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60";

  const updateFlairRgb = (index: number, channel: "r" | "g" | "b", rawValue: string) => {
    const current = hexToRgb(flairs[index].color);
    const value = Math.max(0, Math.min(255, Number(rawValue) || 0));
    const next = { ...current, [channel]: value };
    setFlairs((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, color: rgbToHex(next.r, next.g, next.b) } : item));
  };

  if (!user) {
    return <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"><div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" /><div className="p-8 text-center"><img src="/yapster-mark.svg" alt="" className="mx-auto h-12 w-12" /><h2 className="mt-4 text-2xl font-bold text-slate-950">Sign in to start a community</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create a space, set its identity and rules, and become its first admin.</p><Link to="/login" className="yapster-button yapster-button--primary mt-5">Sign in</Link></div></section>;
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
      <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="p-5 sm:p-7 lg:p-8">
        <div><h2 className="text-xl font-bold text-slate-950">Community details</h2><p className="mt-1 text-sm text-slate-500">Set the identity, rules and posting structure before publishing.</p></div>

        <div className="mt-7 space-y-8">
          <section className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-600">1 · Basics</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">Community name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="e.g. Indie Game Dev" className={`${fieldClassName} mt-2`} required /></label>
              <label className="block text-sm font-semibold text-slate-700">Category<select value={category} onChange={(event) => setCategory(event.target.value as CommunityCategory)} className={`${fieldClassName} mt-2`}>{COMMUNITY_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={500} placeholder="What is this community for?" className={`${fieldClassName} mt-2 resize-y leading-6`} /><span className="mt-1.5 flex justify-end text-[11px] font-medium text-slate-400">{description.length}/500</span></label>
          </section>

          <section className="border-t border-slate-100 pt-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-600">2 · Community images</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">Community icon</h3><p className="mt-1 text-xs leading-5 text-slate-400">Square PNG, JPG or WEBP · max 2 MB.</p></div>{iconFile && <span className="max-w-36 truncate text-[11px] text-slate-400">{iconFile.name}</span>}</div>
                <label className="yapster-upload-button mt-4 cursor-pointer"><UploadIcon /> Choose icon<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setIconFile(event.target.files?.[0] || null)} /></label>
                {iconFile && iconFile.size > MAX_ICON_BYTES && <p className="mt-2 text-xs text-red-600">Icon is larger than 2 MB.</p>}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">Cover banner</h3><p className="mt-1 text-xs leading-5 text-slate-400">Wide PNG, JPG or WEBP · max 8 MB.</p></div>{bannerFile && <span className="max-w-36 truncate text-[11px] text-slate-400">{bannerFile.name}</span>}</div>
                <label className="yapster-upload-button mt-4 cursor-pointer"><UploadIcon /> Choose banner<input className="yapster-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /></label>
                {bannerFile && bannerFile.size > MAX_BANNER_BYTES && <p className="mt-2 text-xs text-red-600">Banner is larger than 8 MB.</p>}
              </div>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-7">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-600">3 · Rules</p><p className="mt-1 text-xs text-slate-400">Add up to 10. You can edit them later.</p></div>{rules.length < 10 && <button type="button" onClick={() => setRules((current) => [...current, { title: "", description: "" }])} className="text-xs font-semibold text-violet-700">+ Add rule</button>}</div>
            <div className="mt-4 space-y-3">{rules.map((rule, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{index + 1}</span><div className="min-w-0 flex-1 grid gap-3 md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]"><input value={rule.title} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} maxLength={80} placeholder="Rule title" className={fieldClassName} /><textarea value={rule.description} onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} rows={2} maxLength={300} placeholder="What does this rule mean?" className={`${fieldClassName} resize-y`} /></div>{rules.length > 1 && <button type="button" onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="self-start rounded-lg px-2 py-1 text-sm font-medium text-red-500 hover:bg-red-50">×</button>}</div></div>)}</div>
          </section>

          <section className="border-t border-slate-100 pt-7">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-600">4 · Post flairs</p><p className="mt-1 text-xs text-slate-400">Optional labels members can attach to posts.</p></div>{flairs.length < 12 && <button type="button" onClick={() => setFlairs((current) => [...current, { name: "", color: "#7c3aed" }])} className="text-xs font-semibold text-violet-700">+ Add flair</button>}</div>
            <div className="mt-4 space-y-3">{flairs.map((flair, index) => {
              const rgb = hexToRgb(flair.color);
              return <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_auto_auto] lg:items-end">
                  <label className="block text-xs font-medium text-slate-500">Flair name<input value={flair.name} onChange={(event) => setFlairs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} maxLength={40} placeholder="e.g. Discussion" className={`${fieldClassName} mt-1.5`} /></label>
                  <div><span className="block text-xs font-medium text-slate-500">Color</span><div className="mt-1.5 flex items-center gap-2"><input type="color" value={flair.color} onChange={(event) => setFlairs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" aria-label={`Flair ${index + 1} color`} /><input value={flair.color.toUpperCase()} onChange={(event) => { const value = event.target.value; if (/^#[0-9a-fA-F]{6}$/.test(value)) setFlairs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color: value } : item)); }} className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal text-slate-600 outline-none" aria-label="Hex color" /></div></div>
                  <div><span className="block text-xs font-medium text-slate-500">RGB</span><div className="mt-1.5 flex gap-1.5">{(["r","g","b"] as const).map((channel) => <label key={channel} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><span className="text-[10px] uppercase text-slate-400">{channel}</span><input type="number" min={0} max={255} value={rgb[channel]} onChange={(event) => updateFlairRgb(index, channel, event.target.value)} className="w-10 border-0 bg-transparent p-0 text-xs font-normal text-slate-700 outline-none" /></label>)}</div></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3"><span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${flair.color}20`, color: flair.color }}>{flair.name.trim() || "Flair preview"}</span>{flairs.length > 1 && <button type="button" onClick={() => setFlairs((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-medium text-red-500 hover:text-red-700">Remove</button>}</div>
              </div>;
            })}</div>
          </section>
        </div>

        {mutation.error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{getFriendlyErrorMessage(mutation.error, "Unable to create community. Please try again.")}</div>}
        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => navigate(-1)} className="yapster-button yapster-button--ghost">Cancel</button><button type="submit" disabled={mutation.isPending || !name.trim() || Boolean(iconFile && iconFile.size > MAX_ICON_BYTES) || Boolean(bannerFile && bannerFile.size > MAX_BANNER_BYTES)} className="yapster-button yapster-button--primary disabled:cursor-not-allowed disabled:opacity-50">{mutation.isPending ? "Creating..." : "Create community"}</button></div>
      </form>
    </section>
  );
};
