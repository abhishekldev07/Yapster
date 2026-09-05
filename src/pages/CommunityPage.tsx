import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { CommunityDisplay } from "../components/CommunityDisplay";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";

const fetchCanManageCommunity = async (communityId: number, userId: string): Promise<boolean> => {
  const [{ data: community, error: communityError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("communities").select("created_by").eq("id", communityId).maybeSingle(),
    supabase.from("community_members").select("role").eq("community_id", communityId).eq("user_id", userId).maybeSingle(),
  ]);
  if (communityError) throw new Error(communityError.message);
  if (membershipError) throw new Error(membershipError.message);
  return community?.created_by === userId || membership?.role === "moderator";
};

export const CommunityPage = () => {
  const { id } = useParams<{ id: string }>();
  const communityId = Number(id);
  const { user } = useAuth();
  const { data: canManage = false } = useQuery<boolean, Error>({
    queryKey: ["community-can-manage", communityId, user?.id],
    queryFn: () => (user ? fetchCanManageCommunity(communityId, user.id) : Promise.resolve(false)),
    enabled: !!user && Number.isFinite(communityId) && communityId > 0,
    retry: false,
  });

  return (
    <main className="yapster-community-page pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        {canManage && (
          <div className="mb-3 flex justify-end">
            <Link to={`/community/${communityId}/settings`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-700">
              Rules & flairs
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
        <CommunityDisplay communityId={communityId} />
      </div>
    </main>
  );
};
