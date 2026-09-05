import { CreatePost } from "../components/CreatePost";

export const CreatePostPage = () => {
  return (
    <main className="yapster-create-post-page pb-16 pt-7 max-[760px]:pb-8 max-[760px]:pt-4">
      <div className="mx-auto max-w-[760px] px-4 sm:px-6">
        <div className="mb-6 flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#101017] shadow-sm">
            <img src="/yapster-mark.svg" alt="" className="h-8 w-8" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-violet-600">Create post</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">Start a conversation.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Choose a community, give people a reason to click, and share something worth discussing.</p>
          </div>
        </div>

        <section className="yapster-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600" />
          <div className="p-5 sm:p-7"><CreatePost /></div>
        </section>
      </div>
    </main>
  );
};
