import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import Layout from "./components/Layout";
import { Logo } from "./components/Logo";
import { homeFor, useAuth } from "./lib/auth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResponderRegister from "./pages/ResponderRegister";
import Dashboard from "./pages/Dashboard";
import Emergency from "./pages/Emergency";
import Admin from "./pages/Admin";
import Responder from "./pages/Responder";
import NotFound from "./pages/NotFound";

function Guard({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container"><div className="center-state"><Logo size={64} className="hero__icon" /><p className="mt-md">Loading your account...</p></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/responder/register" element={<ResponderRegister />} />
        <Route path="/dashboard" element={<Guard roles={["patient"]}><Dashboard /></Guard>} />
        <Route path="/responder" element={<Guard roles={["responder", "medical_professional"]}><Responder /></Guard>} />
        <Route path="/admin" element={<Guard roles={["admin"]}><Admin /></Guard>} />
        <Route path="/e/:token" element={<Emergency />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
