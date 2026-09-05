import { Link } from "react-router";
import { CommunityList } from "../components/CommunityList";

export const CommunitiesPage = () => {
  return (
    <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <section className="relative mb-7 overflow-hidden rounded-[22px] border border-slate-900 bg-[#0e0e15] p-6 text-white shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-32 h-52 w-52 rounded-full bg-pink-600/15 blur-3xl" />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <img src="/yapster-mark.svg" alt="" className="h-8 w-8" />
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/45">
                  Yapster communities
                </p>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">
                Find a place for every interest.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/58 sm:text-[0.95rem]">
                Browse communities built around topics, hobbies, questions, places, professions, and the conversations people keep coming back to.
              </p>
            </div>

            <Link
              to="/community/create"
              className="inline-flex w-fit items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-100"
            >
              Create a community
            </Link>
          </div>
        </section>

        <CommunityList />
      </div>
    </main>
  );
};
