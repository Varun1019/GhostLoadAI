"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/ui/Badge";
import { ComingSoonBadge } from "@/components/ui/ComingSoon";

export default function Navbar() {
  const { user, logout, switchRole, apiBase } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [learningHubOpen, setLearningHubOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  // Max 4 navigation items per role
  const navItems = {
    BUYER: [
      { label: "Marketplace", href: "/marketplace" },
      { label: "Emergency", href: "/emergency" },
      { label: "Orders", href: "/orders" },
      { label: "Audit log", href: "/audit" },
    ],
    SELLER: [
      { label: "Listings", href: "/seller/listings" },
      { label: "Requests", href: "/seller/reservations" },
      { label: "Orders", href: "/seller" },
      { label: "Trust score", href: "/seller#trust" },
    ],
    QC_INSPECTOR: [
      { label: "Certificates", href: "/qc" },
      { label: "Audit log", href: "/audit" },
    ],
  }[user.role] || [];

  const handleRoleChange = async (newRole: UserRole) => {
    await switchRole(newRole);
    setMenuOpen(false);
    if (newRole === "BUYER") router.push("/marketplace");
    else if (newRole === "SELLER") router.push("/seller");
    else router.push("/qc");
  };

  const handleExportCSV = () => {
    window.open(`${apiBase}/api/audit/export-csv`, "_blank");
    setMenuOpen(false);
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-2">
              <span className="font-bold text-lg text-gray-900 tracking-tight">
                GhostLoad AI
              </span>
            </Link>

            {/* Top Navigation - Max 4 items */}
            <nav className="hidden sm:flex items-center space-x-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href) && item.href !== "/seller");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "text-blue-700 font-semibold border-b-2 border-blue-700"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Side: Role Badge & Profile Dropdown */}
          <div className="relative flex items-center space-x-3" ref={menuRef}>
            <Badge variant={user.role === "BUYER" ? "blue" : user.role === "SELLER" ? "success" : "warning"}>
              {user.role === "BUYER" ? "Buyer" : user.role === "SELLER" ? "Seller" : "QC Inspector"}
            </Badge>

            {/* Profile Menu Trigger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition cursor-pointer"
              aria-label="Profile and options menu"
            >
              <span>{user.name.split(" ")[0]}</span>
              <span className="text-xs text-gray-400">▾</span>
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <div className="absolute right-0 top-12 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50 text-sm">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="font-semibold text-gray-900 truncate">{user.company_name || user.name}</p>
                  <p className="text-xs text-gray-500">{user.city} · {user.role}</p>
                </div>

                {/* Switch Role Section */}
                <div className="px-4 py-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                    Switch demo role
                  </span>
                  <div className="space-y-1">
                    <button
                      onClick={() => handleRoleChange("BUYER")}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                        user.role === "BUYER" ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      Buyer mode
                    </button>
                    <button
                      onClick={() => handleRoleChange("SELLER")}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                        user.role === "SELLER" ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      Seller mode
                    </button>
                    <button
                      onClick={() => handleRoleChange("QC_INSPECTOR")}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                        user.role === "QC_INSPECTOR" ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      QC Inspector mode
                    </button>
                  </div>
                </div>

                {/* Additional Utilities */}
                <div className="py-1 border-b border-gray-100">
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-1.5 text-gray-700 hover:bg-gray-50 text-xs"
                  >
                    Settings & profile
                  </Link>
                  <Link
                    href="/chat"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-1.5 text-gray-800 font-medium hover:bg-gray-50 text-xs flex items-center justify-between"
                  >
                    <span>AI Copilot (Gemini)</span>
                    <Badge variant="blue">Live</Badge>
                  </Link>
                  <button
                    onClick={() => {
                      setLearningHubOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left block px-4 py-1.5 text-gray-700 hover:bg-gray-50 text-xs"
                  >
                    Learning Hub reference
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="w-full text-left block px-4 py-1.5 text-gray-700 hover:bg-gray-50 text-xs"
                  >
                    Export audit log (CSV)
                  </button>
                </div>

                {/* Upcoming Modules */}
                <div className="py-1 border-b border-gray-100">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block px-4 pt-1 pb-0.5">
                    Preview features
                  </span>
                  <Link
                    href="/route-map"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-1 text-gray-500 hover:bg-gray-50 text-xs flex items-center justify-between"
                  >
                    <span>Route map canvas</span>
                    <ComingSoonBadge />
                  </Link>
                  <Link
                    href="/impact"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-1 text-gray-500 hover:bg-gray-50 text-xs flex items-center justify-between"
                  >
                    <span>ESG Carbon tracker</span>
                    <ComingSoonBadge />
                  </Link>
                  <Link
                    href="/warehouse"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-1 text-gray-500 hover:bg-gray-50 text-xs flex items-center justify-between"
                  >
                    <span>Warehouse & freight</span>
                    <ComingSoonBadge />
                  </Link>
                </div>

                {/* Sign out */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                      router.push("/");
                    }}
                    className="w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 text-xs font-medium"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="sm:hidden border-t border-gray-100 px-4 py-2 flex items-center space-x-4 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-xs whitespace-nowrap ${
                  isActive ? "text-blue-700 font-semibold" : "text-gray-600"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Learning Hub Dialog Modal */}
      {learningHubOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-lg w-full p-6 shadow-xl relative">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900 text-base">SAP Learning Hub Modules</h3>
              <button
                onClick={() => setLearningHubOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Architectural foundation modules referenced by our engineering design:
            </p>
            <div className="space-y-3 text-xs text-gray-700">
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <span className="font-semibold block text-gray-900">C_S4EWM · SAP Extended Warehouse Management</span>
                <span className="text-gray-500 mt-0.5 block">Buffer inventory, slotting rules, and express cross-docking dispatch</span>
              </div>
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <span className="font-semibold block text-gray-900">C_IBP · SAP Integrated Business Planning</span>
                <span className="text-gray-500 mt-0.5 block">Multi-tier supply chain resilience & sudden demand disruption modeling</span>
              </div>
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <span className="font-semibold block text-gray-900">SAP AI Core · GenAI Hub Architecture</span>
                <span className="text-gray-500 mt-0.5 block">Unstructured incident extraction and contextual explanation generation</span>
              </div>
            </div>
            <div className="mt-5 text-right">
              <button
                onClick={() => setLearningHubOpen(false)}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
