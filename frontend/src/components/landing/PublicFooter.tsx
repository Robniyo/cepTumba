import { Facebook, Twitter, Instagram, Mail, Phone, MapPin } from "lucide-react";

const PublicFooter = () => {
  const currentYear = new Date().getFullYear();
  
  const quickLinks = [
    { name: "Home", href: "#home" },
    { name: "About", href: "#about" },
    { name: "Events", href: "#events" },
    { name: "Schedule", href: "#schedule" },
  ];

  const resources = [
    { name: "Announcements", href: "#announcements" },
    { name: "Leadership", href: "#leadership" },
    { name: "Contact", href: "#contact" },
    { name: "Login", href: "/login" },
  ];

  return (
    <footer className="bg-[#0F172A] text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* About */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/logo-cep.png"
                alt="CEP Tumba logo"
                className="h-10 w-10 rounded-lg object-cover"
              />
              <div>
                <div className="font-display font-bold">CEP Tumba</div>
                <div className="text-xs text-gray-400">College Association</div>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              A community of students growing in faith, fellowship, and service through Christ.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-display font-bold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <a 
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-display font-bold mb-4">Resources</h3>
            <ul className="space-y-2">
              {resources.map((link) => (
                <li key={link.name}>
                  <a 
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-display font-bold mb-4">Contact</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-sm text-gray-400">
                <Phone className="h-4 w-4 text-[#F59E0B]" />
                <span>+250 791 811 475</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-gray-400">
                <Mail className="h-4 w-4 text-[#F59E0B]" />
                <span><a href="mailto:ceprptumbacollege@gmail.com" className="text-[#F59E0B] hover:text-orange-300 transition-colors">ceprptumbacollege@gmail.com</a></span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-400">
                <MapPin className="h-4 w-4 mt-0.5 text-[#F59E0B]" />
                <span>Tumba College Campus, Kigali, Rwanda</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-gray-800 pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-400">
                © {currentYear} CEP Tumba College Association. All rights reserved.
              </p>
              <p className="text-xs text-gray-500">
                Developed by: 0782034865
              </p>
            </div>
            <div className="flex gap-3">
            
              <a href="https://x.com/NSHUTIEmma64721" className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:bg-[#1E3A8A] hover:text-white transition-colors">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="https://www.instagram.com/nshuti_ya_emmanuel/" className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:bg-[#1E3A8A] hover:text-white transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
