import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="container">
      <div className="error-state">
        <div className="error-state__icon">🧭</div>
        <h2 className="error-state__title">Page not found</h2>
        <p>The page you are looking for does not exist.</p>
        <Link to="/" className="btn btn--primary">← Go to VEAP home</Link>
      </div>
    </div>
  );
}
