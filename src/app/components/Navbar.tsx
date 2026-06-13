import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "./Logo";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "Home", to: "/" },
    { label: "AI Interview Practice", to: "/ai-practice" },
    { label: "Communication Practice", to: "/communication-practice" },
    { label: "Blog", to: "/blog" },
  ];

  return (
    <header className="w-full bg-surface-1/80 border-b border-glass-border backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <Logo className="h-12" />
          </Link>

          {/* Center Nav Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
                className="text-text-secondary hover:text-text-primary transition-colors duration-150 px-4 py-2 rounded-lg hover:bg-white/5 text-sm whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Side */}
          <div className="hidden lg:flex items-center gap-4">
            <Link
              to="/signin"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              className="text-text-secondary hover:text-text-primary transition-colors duration-150 text-sm"
            >
              Sign in
            </Link>
            <Link
              to="/dashboard"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
              className="bg-primary hover:bg-primary/90 text-white text-sm px-5 py-2.5 rounded-lg transition-colors duration-150 shadow-lg shadow-purple-500/20"
            >
              Start for Free
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-lg text-text-secondary hover:bg-white/5 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-glass-border bg-surface-2 px-6 py-4 flex flex-col gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              className="text-text-secondary hover:text-text-primary py-2 text-sm transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-col gap-3 pt-3 border-t border-glass-border mt-2">
            <Link
              to="/dashboard"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              className="text-text-secondary text-sm text-center py-2 hover:text-text-primary"
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
            <Link
              to="/dashboard"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
              className="bg-primary text-white text-sm px-5 py-2.5 rounded-lg text-center"
              onClick={() => setMobileOpen(false)}
            >
              Start for Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}