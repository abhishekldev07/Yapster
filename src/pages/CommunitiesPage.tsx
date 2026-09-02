import { Link } from "react-router";
import { CommunityList } from "../components/CommunityList";

export const CommunitiesPage = () => {
  return (
    <div className="pt-6 pb-12">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              H4UP communities
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Communities
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Discover topic-based communities where people share recommendations, conversations, questions, and local updates.
            </p>
          </div>

          <Link
            to="/community/create"
            className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
          >
            Create Community
          </Link>
        </div>

        <CommunityList />
      </div>
    </div>
  );
};
