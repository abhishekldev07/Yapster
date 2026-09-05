import { useParams } from "react-router";
import { CommunityDisplay } from "../components/CommunityDisplay";

export const CommunityPage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="yapster-community-page pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <CommunityDisplay communityId={Number(id)} />
      </div>
    </main>
  );
};
