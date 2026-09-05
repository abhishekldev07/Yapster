import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { CommunityDisplay } from "../components/CommunityDisplay";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

interface CommunityPresentation {
  icon_url: string | null;
  banner_url: string | null;
}

const fetchCanManageCommunity = async (communityId: number, userId: string): Promise<boolean> => {
  const [{ data: community, error: communityError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("communities").select("created_by").eq("id", communityId).maybeSingle(),
    supabase.from("community_members").select("role, banned").eq("community_id", communityId).eq("user_id", userId).maybeSingle(),
  ]);
  if (communityError) throw new Error(communityError.message);
  if (membershipError) throw new Error(membershipError.message);
  return community?.created_by === userId || (membership?.role === "moderator" && !membership?.banned);
};

export const CommunityPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const communityDisplayRef = useRef<HTMLDivElement>(null);

  const { data: canManage = false } = useQuery<boolean, Error>({
    queryKey: ["community-can-manage", communityId, user?.id],
    queryFn: () => user ? fetchCanManageCommunity(communityId, user.id) : Promise.resolve(false),
    enabled: !!user && Number.isFinite(communityId) && communityId > 0,
    retry: false,
  });

  const { data: presentation } = useQuery<CommunityPresentation | null, Error>({
    queryKey: ["community-presentation", communityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("communities").select("icon_url, banner_url").eq("id", communityId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as CommunityPresentation | null;
    },
    enabled: Number.isFinite(communityId) && communityId > 0,
    staleTime: 60_000,
  });

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

  useEffect(() => {
    const root = communityDisplayRef.current;
    if (!root) return;

    const decorateCommunityHero = () => {
      const section = root.querySelector("section");
      const hero = section?.firstElementChild as HTMLElement | null;
      if (hero) {
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
      }
    };

    decorateCommunityHero();
    const observer = new MutationObserver(decorateCommunityHero);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [communityId, presentation?.banner_url, presentation?.icon_url]);

  return (
    <main className="yapster-community-page pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <Link to={`/community/${communityId}/rules`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-orange-200 hover:text-orange-700">Community rules <span aria-hidden="true">→</span></Link>
          {canManage && <>
            <Link to={`/community/${communityId}/moderation`} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-extrabold text-red-700 shadow-sm transition hover:bg-red-100">Moderation{openReportCount > 0 ? ` · ${openReportCount}` : ""} <span aria-hidden="true">→</span></Link>
            <Link to={`/community/${communityId}/members/manage`} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-extrabold text-red-700 shadow-sm transition hover:bg-red-50">Manage members <span aria-hidden="true">→</span></Link>
            <Link to={`/community/${communityId}/settings`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-700">Rules & flairs <span aria-hidden="true">→</span></Link>
          </>}
        </div>
        <div ref={communityDisplayRef}><CommunityDisplay communityId={communityId} /></div>
      </div>
    </main>
  );
};
