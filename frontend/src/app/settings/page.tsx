"use client";

import { useState, useEffect } from "react";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";

export default function SettingsPage() {
  const { user, updateProfile, apiBase } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<UserRole>("BUYER");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [industry, setIndustry] = useState("Automotive Parts & Assemblies");
  const [gstNumber, setGstNumber] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [resettingSeed, setResettingSeed] = useState(false);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setCompanyName(user.company_name || "");
      setCity(user.city || "Bengaluru");
      setIndustry(user.industry || "Automotive Parts & Assemblies");
      setGstNumber(user.gst_number || "");
    }
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-[1100px] mx-auto py-16 px-4 text-center">
        <p className="text-gray-500 mb-3">Please sign in to access settings.</p>
        <Link href="/" className="text-blue-700 underline text-sm">
          Go to home page
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      role,
      company_name: companyName,
      city,
      industry,
      gst_number: gstNumber,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetSeed = async () => {
    if (!confirm("Reset database to hypothetical baseline?")) return;
    setResettingSeed(true);
    try {
      await fetch(`${apiBase}/api/seed/reset`, { method: "POST" });
      alert("Database reset to hypothetical baseline state.");
      window.location.reload();
    } catch (e) {
      alert("Reset failed: " + e);
    } finally {
      setResettingSeed(false);
    }
  };

  return (
    <div className="max-w-[700px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold text-[#111111]">Settings & Profile</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          Manage your enterprise profile and active demo role.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
          Profile updated successfully.
        </div>
      )}

      <Card className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Active Role */}
          <div>
            <label className="block text-gray-700 font-semibold mb-1.5">
              Select active role
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRole("BUYER")}
                className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                  role === "BUYER"
                    ? "border-blue-700 bg-blue-50/50 text-blue-900 font-semibold"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="block text-sm">Buyer</span>
                <span className="text-[11px] text-gray-500 font-normal">Procure parts & capacity</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("SELLER")}
                className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                  role === "SELLER"
                    ? "border-blue-700 bg-blue-50/50 text-blue-900 font-semibold"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="block text-sm">Seller</span>
                <span className="text-[11px] text-gray-500 font-normal">List stock & capacity</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("QC_INSPECTOR")}
                className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                  role === "QC_INSPECTOR"
                    ? "border-blue-700 bg-blue-50/50 text-blue-900 font-semibold"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="block text-sm">QC Inspector</span>
                <span className="text-[11px] text-gray-500 font-normal">Audit certificates</span>
              </button>
            </div>
          </div>

          {/* Company Details */}
          <div>
            <label className="block text-gray-600 mb-1 font-medium">Company name</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-600 mb-1 font-medium">Hub city</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
              >
                <option value="Bengaluru">Bengaluru</option>
                <option value="Chennai">Chennai</option>
                <option value="Pune">Pune</option>
                <option value="Hyderabad">Hyderabad</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-600 mb-1 font-medium">GST number (optional)</label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="29AABCU9603R1Z7"
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-xs text-gray-900 font-mono focus:outline-none focus:border-blue-700"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-gray-100">
            <Button type="submit">
              Save changes
            </Button>

            <Button
              variant="secondary"
              onClick={handleResetSeed}
              disabled={resettingSeed}
              className="text-xs"
            >
              {resettingSeed ? "Resetting..." : "Reset database"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
