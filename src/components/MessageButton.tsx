import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { fetchUnreadMessageCount } from "../lib/social";

export const MessageButton = () => {
  const { user } = useAuth();
  const unreadQuery = useQuery<number, Error>({
    queryKey: ["messages-unread-count", user?.id],
    queryFn: () => user ? fetchUnreadMessageCount(user.id) : 0,
    enabled: !!user,
    retry: false,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  if (!user) return null;
  const unread = unreadQuery.data ?? 0;

  return (
    <Link
      to="/messages"
      aria-label="Messages"
      className="relative inline-flex h-[37px] w-[37px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-white/65 transition hover:bg-white/10 hover:text-white"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 5.5h14A2.5 2.5 0 0 1 21.5 8v7A2.5 2.5 0 0 1 19 17.5h-7L6 21v-3.5H5A2.5 2.5 0 0 1 2.5 15V8A2.5 2.5 0 0 1 5 5.5Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-gradient-to-br from-orange-500 via-pink-500 to-violet-600 px-1 py-0.5 text-[9px] font-black text-white ring-2 ring-[#0b0b12]">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
};
