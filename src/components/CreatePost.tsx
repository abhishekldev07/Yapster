import { ChangeEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "../supabase-client";
import { useAuth } from "../context/AuthContext";
import { Community, fetchCommunities } from "./CommunityList";

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
    mutationFn: (data: { post: PostInput; imageFile: File }) => {
      return createPost(data.post, data.imageFile);
    },
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

  const handleCommunityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setCommunityId(value ? Number(value) : null);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Create preview
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Community Selector */}
      <div>
        <label htmlFor="community" className="mb-2 block text-sm font-medium text-slate-700">
          Community
        </label>
        <select
          id="community"
          value={communityId || ""}
          onChange={handleCommunityChange}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none transition-colors"
          required
        >
          <option value="">Choose a community</option>
          {communities?.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </select>
      </div>

      {/* Banned/Muted Status Warning */}
      {communityId && (isBanned || isMuted) && (
        <div className={`rounded-xl border p-4 ${
          isBanned
            ? "border-red-200 bg-red-50"
            : "border-yellow-200 bg-yellow-50"
        }`}>
          <p className={`text-sm font-medium ${
            isBanned
              ? "text-red-800"
              : "text-yellow-800"
          }`}>
            {isBanned
              ? "❌ You are banned from this community. You cannot post here."
              : "⚠️ You are muted in this community. You cannot post or comment here."}
          </p>
        </div>
      )}

      {/* Title Input */}
      <div>
        <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-700">
          Title
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's your post about?"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none transition-colors"
          required
        />
      </div>

      {/* Content Textarea */}
      <div>
        <label htmlFor="content" className="mb-2 block text-sm font-medium text-slate-700">
          Content
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share your thoughts, recommendations or questions..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none transition-colors resize-none"
          rows={6}
          required
        />
      </div>

      {/* Image Upload */}
      <div>
        <label htmlFor="image" className="mb-2 block text-sm font-medium text-slate-700">
          Image
        </label>
        {!previewUrl ? (
          <div className="relative">
            <input
              type="file"
              id="image"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              required={!selectedFile}
            />
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-8 px-4 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
              <svg
                className="mb-2 h-8 w-8 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm font-medium text-slate-700">Click to upload an image</p>
              <p className="text-xs text-slate-500 mt-1">PNG, JPG or WEBP</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-4">
              <img
                src={previewUrl}
                alt="Preview"
                className="h-16 w-16 rounded-lg object-cover"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{selectedFile?.name}</p>
                <p className="text-xs text-slate-500">
                  {(selectedFile ? selectedFile.size / 1024 : 0).toFixed(2)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">
            {mutationError instanceof Error
              ? mutationError.message
              : "Error creating post. Please try again."}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={!isFormValid || isPending || !canPost}
          className="flex-1 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Creating..." : "Create Post"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
