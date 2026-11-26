import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BookOpen,
  LayoutDashboard,
  LibraryBig,
  BookMarked,
  History,
  Bookmark,
  Bell,
  Users,
  BarChart3,
  Settings2,
  ScrollText,
  LogOut,
  Menu,
  X,
  Search,
  PanelLeftClose,
  CircleHelp,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../../features/auth/AuthProvider";
import { Brand } from "../ui/Common";
import { useToast } from "../ui/Toast";
import { initials } from "../../lib/format";

const studentItems = [
  ["", "Overview", LayoutDashboard],
  ["catalog", "Explore books", LibraryBig],
  ["loans", "My borrowed books", BookMarked],
  ["reservations", "Reservations", Bookmark],
  ["history", "Reading history", History],
];
const adminItems = [
  ["", "Overview", LayoutDashboard],
  ["catalog", "Book catalog", LibraryBig],
  ["inventory", "Inventory", BookOpen],
  ["circulation", "Circulation", BookMarked],
  ["reservations", "Reservations", Bookmark],
  ["students", "Students", Users],
  ["reports", "Reports & insights", BarChart3],
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 800px)").matches,
  );
  const sidebarRef = useRef(null);
  const [search, setSearch] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const admin = user.role === "LIBRARIAN";
  useEffect(() => {
    setOpen(false);
    document.getElementById("main-content")?.focus();
  }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const change = () => {
      setMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () =>
      [
        ...sidebarRef.current.querySelectorAll("a[href],button:not(:disabled)"),
      ].filter((element) => element.getClientRects().length);
    items()[0]?.focus();
    const close = (event) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const targets = items();
        if (event.shiftKey && document.activeElement === targets[0]) {
          event.preventDefault();
          targets.at(-1)?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === targets.at(-1)
        ) {
          event.preventDefault();
          targets[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  async function logout() {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        inert={mobile && !open ? true : undefined}
        aria-hidden={mobile && !open ? true : undefined}
        className={`sidebar ${open ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <Link to="/app" aria-label="Archthea home">
            <Brand light />
          </Link>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">
            <LibraryBig size={17} />
          </span>
          <div>
            Archthea Library
            <small>{admin ? "Librarian workspace" : "Student workspace"}</small>
          </div>
        </div>
        <p className="nav-label">YOUR LIBRARY</p>
        <nav>
          {(admin ? adminItems : studentItems).map(([path, name, Icon]) => (
            <NavLink
              key={path}
              end={path === ""}
              to={`/app${path ? `/${path}` : ""}`}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{name}</span>
            </NavLink>
          ))}
        </nav>
        <p className="nav-label">PREFERENCES</p>
        <nav>
          <NavLink to="/app/notifications">
            <Bell size={19} strokeWidth={1.7} />
            Notifications
          </NavLink>
          <NavLink to="/app/account">
            <Settings2 size={19} strokeWidth={1.7} />
            My account
          </NavLink>
          {admin && (
            <>
              <NavLink to="/app/settings">
                <Settings2 size={19} strokeWidth={1.7} />
                Library settings
              </NavLink>
              <NavLink to="/app/activity">
                <ScrollText size={19} strokeWidth={1.7} />
                Activity log
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <BookOpen size={25} strokeWidth={1.3} />
            <p>
              A world of ideas.
              <br />
              <strong>One place to begin.</strong>
            </p>
          </div>
          <button
            className="logout-button"
            disabled={signingOut}
            onClick={logout}
          >
            <LogOut size={18} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-toggle"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="desktop-icon">
              <PanelLeftClose size={19} />
            </span>
            <span className="breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {(admin ? adminItems : studentItems).find(
                  ([path]) =>
                    location.pathname === `/app${path ? `/${path}` : ""}`,
                )?.[1] || "My library"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <form
              className="topbar-search"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(`/app/catalog?q=${encodeURIComponent(search)}`);
              }}
            >
              <Search size={17} />
              <input
                aria-label="Search all books"
                placeholder="Find your next read"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </form>
            <Link
              className="icon-button header-bell"
              to="/app/notifications"
              aria-label="Notifications"
            >
              <Bell size={20} />
            </Link>
            <Link className="user-profile" to="/app/account">
              <span className="avatar">{initials(user.full_name)}</span>
              <span>
                <strong>{user.full_name}</strong>
                <small>{admin ? "Librarian" : "Student"}</small>
              </span>
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <motion.div
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </main>
        <footer className="app-footer">
          <span>
            Archthea Library <span className="footer-dot">·</span> A place for
            curious minds.
          </span>
          <Link to="/app/account">
            <CircleHelp size={14} /> Your library account
          </Link>
        </footer>
      </div>
    </div>
  );
}
