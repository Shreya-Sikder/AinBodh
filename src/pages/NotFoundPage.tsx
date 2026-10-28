import { Link } from "react-router-dom";
export default function NotFoundPage() { return <div className="flex min-h-screen items-center justify-center bg-[#f4f6f9] p-6"><div className="card max-w-md p-8 text-center"><p className="text-[11px] font-bold uppercase tracking-widest text-muted">404</p><h1 className="pt-2 text-2xl font-bold text-navy">Page not found</h1><p className="pt-2 text-[11px] text-muted">The page you requested does not exist.</p><Link to="/" className="primary-btn mt-5">Return Home</Link></div></div> }

