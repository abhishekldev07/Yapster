import { useParams } from "react-router";
import { CommunityDisplay } from "../components/CommunityDisplay";

export const CommunityPage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="pt-6 pb-12">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <CommunityDisplay communityId={Number(id)} />
      </div>
    </div>
  );
};
