import { CreateCommunity } from "../components/CreateCommunity";

export const CreateCommunityPage = () => {
  return (
    <main className="pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[980px] px-4 sm:px-6">
        <div className="mb-6 flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#101017] shadow-sm">
            <img src="/yapster-mark.svg" alt="" className="h-7 w-7" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">New community</p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-[2.15rem]">Create a community</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Set the purpose, visual identity, rules, and post labels in one clean setup.
            </p>
          </div>
        </div>

        <CreateCommunity />
      </div>
    </main>
  );
};
