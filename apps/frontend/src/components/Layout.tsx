import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { homeFor, useAuth } from "../lib/auth";
import { initials } from "../lib/util";
import { Logo } from "./Logo";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const onEmergency = loc.pathname.startsWith("/e/");

  return (
    <div className="page-wrapper">
      <header className="navbar-wrap">
        <div className="container container--wide">
          <nav className="navbar" aria-label="Main">
            <Link to="/" className="navbar__brand" aria-label="VEAP home">
              <Logo size={34} />
              <span>VEAP{onEmergency && <small>Emergency</small>}</span>
            </Link>
            <div className="navbar__links">
              {user ? (
                <>
                  <span className="navbar__user"><span className="avatar" aria-hidden>{initials(user.name)}</span>{user.name}</span>
                  <Link to={homeFor(user)} className="btn btn--ghost btn--sm">{user.role === "patient" ? "Dashboard" : user.role === "admin" ? "Admin" : "Responder"}</Link>
                  <button className="btn btn--ghost btn--sm" onClick={async () => { nav("/"); await logout(); }}>Log out</button>
                </>
              ) : (
                <>
                  <Link to="/responder/register" className="btn btn--ghost btn--sm" style={{ display: onEmergency ? "none" : undefined }}>For responders</Link>
                  <Link to="/login" className="btn btn--ghost btn--sm">Log in</Link>
                  <Link to="/register" className="btn btn--primary btn--sm">Get started</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main className="page-main"><Outlet /></main>
      <footer className="footer">
        <div className="container container--wide">VEAP, Verified Emergency Access Protocol &copy; 2026 · In an emergency always call your local emergency number first.</div>
      </footer>
      {!online && <div className="offline-banner" role="status">📡 You are offline. Showing the last saved emergency information where available.</div>}
    </div>
  );
}
