import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { NotificationBell } from "./NotificationBell";

interface CurrentProfile {
  username: string | null;
}

const fetchCurrentProfile = async (userId: string): Promise<CurrentProfile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as CurrentProfile | null;
};

export const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { signInWithGitHub, signOut, user } = useAuth();

  const { data: currentProfile } = useQuery({
    queryKey: ["profile-navbar", user?.id],
    queryFn: () => (user ? fetchCurrentProfile(user.id) : null),
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const profileUsername =
    currentProfile?.username?.trim() ||
    user?.user_metadata?.user_name?.trim() ||
    user?.email ||
    "User";

  const navItems = [
    { label: "Home", to: "/" },
    { label: "Explore", to: "/communities" },
    { label: "Communities", to: "/communities" },
    { label: "Create", to: "/create" },
    { label: "Search", to: "/search" },
  ];

  return (
    <nav className="fixed top-0 z-40 w-full h4up-navbar">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link to="/" className="h4up-brand" aria-label="H4UP home">
            <span className="h4up-brand__mark">H4</span>
            <span className="h4up-brand__word">UP</span>
          </Link>

          <div className="hidden items-center gap-2 md:flex" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="h4up-nav-link"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <div className="flex items-center gap-3">
                <NotificationBell />
                {user.user_metadata?.avatar_url && (
                  <Link to={`/profile/${encodeURIComponent(profileUsername)}`}>
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="User Avatar"
                      className="h4up-avatar"
                    />
                  </Link>
                )}
                <Link to={`/profile/${encodeURIComponent(profileUsername)}`} className="h4up-user-name hover:text-emerald-800 transition-colors">
                  {profileUsername}
                </Link>
                <button type="button" onClick={signOut} className="h4up-button h4up-button--ghost">
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="h4up-button h4up-button--ghost">Sign in</Link>
                <Link to="/signup" className="h4up-button h4up-button--primary">Sign up</Link>
                <button type="button" onClick={signInWithGitHub} className="h4up-button h4up-button--ghost">GitHub</button>
              </div>
            )}
          </div>

          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="h4up-menu-toggle"
              aria-label="Toggle menu"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                {menuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="h4up-mobile-menu md:hidden">
          <div className="mx-auto max-w-6xl space-y-1 px-4 pb-4 pt-2 sm:px-6">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="h4up-mobile-link"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            <Link
              to="/community/create"
              className="h4up-mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              Create Community
            </Link>

            {user ? (
              <div className="h4up-mobile-auth">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {user.user_metadata?.avatar_url && (
                      <Link to={`/profile/${encodeURIComponent(profileUsername)}`}>
                        <img
                          src={user.user_metadata.avatar_url}
                          alt="User Avatar"
                          className="h4up-avatar"
                        />
                      </Link>
                    )}
                    <Link to={`/profile/${encodeURIComponent(profileUsername)}`} className="h4up-user-name hover:text-emerald-800 transition-colors">
                      {profileUsername}
                    </Link>
                  </div>
                  <NotificationBell />
                </div>
                <button type="button" onClick={signOut} className="h4up-button h4up-button--ghost w-full">
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="grid gap-2">
                <Link to="/login" className="h4up-button h4up-button--ghost w-full" onClick={() => setMenuOpen(false)}>Sign in</Link>
                <Link to="/signup" className="h4up-button h4up-button--primary w-full" onClick={() => setMenuOpen(false)}>Sign up</Link>
                <button type="button" onClick={signInWithGitHub} className="h4up-button h4up-button--ghost w-full">Continue with GitHub</button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
