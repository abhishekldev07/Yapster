import { ChangeEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "../supabase-client";
import { useAuth } from "../context/AuthContext";
import { Community, fetchCommunities } from "./CommunityList";
import { getFriendlyErrorMessage } from "../lib/auth";

interface PostInput {
  title: string;
  content: string;
  avatar_url: string | null;
  community_id?: number | null;
}

interface MembershipStatus {
  role: string;
  muted: boolean;
  banned: boolean;
}

const createPost = async (post: PostInput, imageFile: File) => {
  const filePath = `${post.title}-${Date.now()}-${imageFile.name}`;

  const { error: uploadError } = await supabase.storage
    .from("post-images")
    .upload(filePath, imageFile);

  if (uploadError) throw new Error(uploadError.message);

  const { data: publicURLData } = supabase.storage
    .from("post-images")
    .getPublicUrl(filePath);

  const { data, error } = await supabase
    .from("posts")
    .insert({ ...post, image_url: publicURLData.publicUrl });

  if (error) throw new Error(error.message);

  return data;
};

const fetchUserMembershipStatus = async (communityId: number, userId: string): Promise<MembershipStatus | null> => {
  const { data, error } = await supabase
    .from("community_members")
    .select("role, muted, banned")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as MembershipStatus | null;
};

const ImageIcon = () => (
  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
  </svg>
);

export const CreatePost = () => {
  const [searchParams] = useSearchParams();
  const communityFromRoute = Number(searchParams.get("community"));
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [communityId, setCommunityId] = useState<number | null>(
    Number.isFinite(communityFromRoute) && communityFromRoute > 0 ? communityFromRoute : null
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: communities } = useQuery<Community[], Error>({
    queryKey: ["communities"],
    queryFn: fetchCommunities,
  });

  const { data: membershipStatus } = useQuery<MembershipStatus | null, Error>({
    queryKey: ["membership-status", communityId, user?.id],
    queryFn: () => (user && communityId ? fetchUserMembershipStatus(communityId, user.id) : Promise.resolve(null)),
    enabled: !!user && !!communityId,
    retry: false,
  });

  const { mutate, isPending, isError, error: mutationError } = useMutation({
    mutationFn: (data: { post: PostInput; imageFile: File }) => createPost(data.post, data.imageFile),
    onSuccess: () => {
      navigate("/");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile || !title.trim() || !content.trim()) return;
    mutate({
      post: {
        title,
        content,
        avatar_url: user?.user_metadata.avatar_url || null,
        community_id: communityId,
      },
      imageFile: selectedFile,
    });
  };

  const handleCommunityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setCommunityId(value ? Number(value) : null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleCancel = () => {
    navigate(-1);
  };

  const isFormValid = title.trim() && content.trim() && selectedFile && communityId;
  const isBanned = membershipStatus?.banned || false;
  const isMuted = membershipStatus?.muted || false;
  const canPost = !isBanned && !isMuted;
  const fieldClassName = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-850 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/60";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="community" className="mb-2 flex items-center justify-between gap-3 text-sm font-extrabold text-slate-700">
          <span>Community</span>
          <span className="text-[11px] font-semibold text-slate-400">Required</span>
        </label>
        <select
          id="community"
          value={communityId || ""}
          onChange={handleCommunityChange}
          className={fieldClassName}
          required
        >
          <option value="">Choose where to post</option>
          {communities?.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </select>
      </div>

      {communityId && (isBanned || isMuted) && (
        <div className={`rounded-xl border p-4 ${isBanned ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-sm font-semibold ${isBanned ? "text-red-800" : "text-amber-800"}`}>
            {isBanned
              ? "You are banned from this community and cannot post here."
              : "You are muted in this community and cannot post or comment here."}
          </p>
        </div>
      )}

      <div>
        <label htmlFor="title" className="mb-2 flex items-center justify-between gap-3 text-sm font-extrabold text-slate-700">
          <span>Title</span>
          <span className="text-[11px] font-semibold text-slate-400">Make it clear</span>
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What is this discussion about?"
          className={fieldClassName}
          required
        />
      </div>

      <div>
        <label htmlFor="content" className="mb-2 flex items-center justify-between gap-3 text-sm font-extrabold text-slate-700">
          <span>Body</span>
          <span className="text-[11px] font-semibold text-slate-400">Add context</span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Share the details, your question, recommendation, or point of view..."
          className={`${fieldClassName} min-h-36 resize-y leading-6`}
          rows={7}
          required
        />
      </div>

      <div>
        <label htmlFor="image" className="mb-2 flex items-center justify-between gap-3 text-sm font-extrabold text-slate-700">
          <span>Image</span>
          <span className="text-[11px] font-semibold text-slate-400">Required in the current post format</span>
        </label>
        {!previewUrl ? (
          <div className="relative">
            <input
              type="file"
              id="image"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              required={!selectedFile}
            />
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-9 text-center text-slate-400 transition hover:border-violet-300 hover:bg-violet-50/40 hover:text-violet-600">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <ImageIcon />
              </div>
              <p className="mt-3 text-sm font-extrabold text-slate-700">Upload an image</p>
              <p className="mt-1 text-xs text-slate-400">PNG, JPG, or WEBP</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img src={previewUrl} alt="Post preview" className="max-h-80 w-full object-cover" />
            <div className="flex items-center gap-4 border-t border-slate-200 bg-white p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-slate-800">{selectedFile?.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {(selectedFile ? selectedFile.size / 1024 : 0).toFixed(1)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-600 transition hover:bg-red-100"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            {getFriendlyErrorMessage(mutationError, "Unable to create post. Please try again.")}
          </p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleCancel}
          className="yapster-button yapster-button--ghost sm:min-w-28"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isFormValid || isPending || !canPost}
          className="yapster-button yapster-button--primary sm:min-w-36 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Publishing..." : "Publish post"}
        </button>
      </div>
    </form>
  );
};
