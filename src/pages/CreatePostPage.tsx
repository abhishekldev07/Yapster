import { CreatePost } from "../components/CreatePost";

export const CreatePostPage = () => {
  return (
    <div className="pt-6 pb-12">
      <div className="mx-auto max-w-[620px] px-4 sm:px-6">
        {/* Eyebrow text */}
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 mb-3">
          Create Post
        </p>

        {/* Main heading */}
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">
          Share something
        </h1>

        {/* Subtitle */}
        <p className="text-sm leading-6 text-slate-600 mb-6">
          Post to one of your communities and start a discussion.
        </p>

        {/* Form card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <CreatePost />
        </div>
      </div>
    </div>
  );
};
