import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const PublicNavbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { name: "Home", href: "#home" },
    { name: "About", href: "#about" },
    { name: "Events", href: "#events" },
    { name: "Schedule", href: "#schedule" },
    { name: "Announcements", href: "#announcements" },
    { name: "Leadership", href: "#leadership" },
    { name: "Contact", href: "#contact" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Name */}
          <div className="flex items-center gap-3">
            <img
              src="/logo-cep.png"
              alt="CEP Tumba logo"
              className="h-10 w-10 rounded-lg object-cover"
            />
            <div>
              <div className="font-display font-bold text-[#0F172A]">CEP Tumba</div>
              <div className="text-xs text-gray-600">College Association</div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-[#1E3A8A]"
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Desktop CTA Buttons */}
          <div className="hidden items-center gap-3 lg:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Login</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-[#1E3A8A] text-white hover:bg-[#1E3A8A]/90"
            >
              <Link to="/login">Join Us</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="lg:hidden rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white">
          <div className="space-y-1 px-4 py-3">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {link.name}
              </a>
            ))}
            <div className="mt-4 space-y-2 pt-4 border-t border-gray-200">
              <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                <Link to="/login" onClick={() => setIsMenuOpen(false)}>Login</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="w-full bg-[#1E3A8A] text-white hover:bg-[#1E3A8A]/90"
              >
                <Link to="/login" onClick={() => setIsMenuOpen(false)}>Join Us</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default PublicNavbar;
