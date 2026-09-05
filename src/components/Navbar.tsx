import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase-client";
import { MessageButton } from "./MessageButton";
import { NotificationBell } from "./NotificationBell";

interface CurrentProfile {
  username: string | null;
  avatar_url: string | null;
}

type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const storedTheme = window.localStorage.getItem("yapster-theme");
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const fetchCurrentProfile = async (userId: string): Promise<CurrentProfile | null> => {
  const { data, error } = await supabase.from("profiles").select("username, avatar_url").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CurrentProfile | null;
};

const HomeIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8v9.1a1.1 1.1 0 0 1-1.1 1.1h-5.2v-6.2H9.3V21H4.1A1.1 1.1 0 0 1 3 19.9v-9.1Z" /></svg>);
const CompassIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" /></svg>);
const SearchIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.7" /><path d="m16 16 4.1 4.1" /></svg>);
const PlusIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>);
const UserIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.7-4.1 3.2-6.2 7.5-6.2s6.8 2.1 7.5 6.2" /></svg>);
const SunIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>);
const MoonIcon = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.1 15.3A8.5 8.5 0 0 1 8.7 3.9 8.5 8.5 0 1 0 20.1 15.3Z" /></svg>);

export const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const location = useLocation();
  const { signInWithGitHub, signOut, user } = useAuth();

  const closeMenu = () => {
    if (!menuOpen || menuClosing) return;
    setMenuClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
      closeTimerRef.current = null;
    }, 90);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("yapster-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, menuClosing]);

  useEffect(() => {
    if (menuOpen) closeMenu();
  }, [location.pathname]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  const { data: currentProfile } = useQuery({
    queryKey: ["profile-navbar", user?.id],
    queryFn: () => (user ? fetchCurrentProfile(user.id) : null),
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const profileUsername = currentProfile?.username?.trim() || user?.user_metadata?.user_name?.trim() || user?.email || "User";
  const avatarUrl = currentProfile?.avatar_url?.trim() || user?.user_metadata?.avatar_url || null;
  const profileHref = `/profile/${encodeURIComponent(profileUsername)}`;
  const navItems = [
    { label: "Home", to: "/", icon: <HomeIcon /> },
    { label: "Communities", to: "/communities", icon: <CompassIcon /> },
    { label: "Search", to: "/search", icon: <SearchIcon /> },
  ];
  const isActive = (to: string) => to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <>
      <header className="yapster-navbar">
        <div className="yapster-navbar__inner">
          <Link to="/" className="yapster-brand" aria-label="Yapster home"><img src="/yapster-mark.svg" alt="" className="yapster-brand__mark" /><span className="yapster-brand__word">Yapster</span></Link>
          <nav className="yapster-desktop-nav" aria-label="Main navigation">
            {navItems.slice(0, 2).map((item) => <Link key={item.label} to={item.to} className={`yapster-nav-link ${isActive(item.to) ? "is-active" : ""}`}>{item.label}</Link>)}
          </nav>
          <Link to="/search" className="yapster-search-trigger" aria-label="Search Yapster"><SearchIcon /><span>Search communities, posts, and people</span><kbd>/</kbd></Link>

          <div className="yapster-navbar__actions">
            <button type="button" className="yapster-theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>

            {user ? (
              <>
                <Link to="/create" className="yapster-create-button"><PlusIcon /><span>Create</span></Link>
                <MessageButton />
                <NotificationBell />
                <button ref={triggerRef} type="button" className="yapster-profile-trigger" onClick={() => { if (menuOpen) closeMenu(); else { setMenuClosing(false); setMenuOpen(true); } }} aria-expanded={menuOpen && !menuClosing} aria-label="Open account menu">
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{profileUsername.slice(0, 1).toUpperCase()}</span>}
                </button>
              </>
            ) : (
              <div className="yapster-guest-actions"><Link to="/login" className="yapster-button yapster-button--ghost">Log in</Link><Link to="/signup" className="yapster-button yapster-button--primary">Join Yapster</Link></div>
            )}
          </div>

          {user && menuOpen && (
            <div ref={menuRef} className={`yapster-account-menu ${menuClosing ? "is-closing" : ""}`}>
              <div className="yapster-account-menu__identity"><strong>{profileUsername}</strong><span>{user.email}</span></div>
              <Link to={profileHref} onClick={closeMenu}>View profile</Link>
              <Link to="/messages" onClick={closeMenu}>Messages</Link>
              <Link to="/saved" onClick={closeMenu}>Saved posts</Link>
              <Link to="/reports" onClick={closeMenu}>My reports</Link>
              <Link to="/communities" onClick={closeMenu}>My communities</Link>
              <button type="button" onClick={() => { closeMenu(); void signOut(); }}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <nav className="yapster-mobile-nav" aria-label="Mobile navigation">
        <Link to="/" className={isActive("/") ? "is-active" : ""}><HomeIcon /><span>Home</span></Link>
        <Link to="/communities" className={isActive("/communities") ? "is-active" : ""}><CompassIcon /><span>Explore</span></Link>
        <Link to={user ? "/create" : "/login"} className="yapster-mobile-create" aria-label="Create post"><PlusIcon /></Link>
        <Link to="/search" className={isActive("/search") ? "is-active" : ""}><SearchIcon /><span>Search</span></Link>
        <Link to={user ? profileHref : "/login"} className={location.pathname.startsWith("/profile") ? "is-active" : ""}><UserIcon /><span>{user ? "Profile" : "Log in"}</span></Link>
      </nav>

      {!user && <button type="button" onClick={signInWithGitHub} className="sr-only" aria-label="Continue with GitHub" />}
    </>
  );
};
