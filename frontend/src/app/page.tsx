"use client";

import { useState } from "react";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";

export default function HomePage() {
  const { user, loginAsDemo, updateProfile, apiBase } = useAuth();
  const router = useRouter();

  // Step state: 'signin' | 'role_select' | 'company_details'
  const [step, setStep] = useState<"signin" | "role_select" | "company_details">("signin");
  const [selectedRole, setSelectedRole] = useState<UserRole>("BUYER");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Company details form state
  const [companyName, setCompanyName] = useState<string>("");
  const [city, setCity] = useState<string>("Bengaluru");
  const [industry, setIndustry] = useState<string>("Automotive Parts & Assemblies");
  const [gstNumber, setGstNumber] = useState<string>("");

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      // Simulate/trigger Google popup with network resilience check
      const response = await fetch(`${apiBase}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "mock-google-token" }),
      }).catch(() => null);

      if (!response || !response.ok) {
        // Fallback for offline demo mode or blocked popup
        setErrorMessage("Could not connect to Google authentication. Use the offline demo buttons below to continue.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (data.user) {
        setStep("role_select");
      }
    } catch {
      setErrorMessage("Google sign-in popup was blocked or network is offline. Use demo mode below.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async (role: "BUYER" | "SELLER") => {
    setLoading(true);
    setErrorMessage("");
    const demoId = role === "BUYER" ? "buyer-1" : "seller-factory-a";
    try {
      await loginAsDemo(demoId, role);
      setSelectedRole(role);
      setCompanyName(role === "BUYER" ? "Apex Mobility Tech Ltd" : "Factory A (Precision Dynamics)");
      setCity(role === "BUYER" ? "Bengaluru" : "Bengaluru");
      setStep("role_select");
    } catch (e) {
      console.error(e);
      setErrorMessage("Failed to initialize demo session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setStep("company_details");
  };

  const handleSaveCompanyDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile({
        role: selectedRole,
        company_name: companyName || (selectedRole === "BUYER" ? "Apex Mobility Tech Ltd" : "Factory A Precision Ltd"),
        city: city || "Bengaluru",
        industry: industry || "Automotive Parts & Assemblies",
        gst_number: gstNumber,
        is_onboarded: true,
      });

      if (selectedRole === "BUYER") {
        router.push("/marketplace");
      } else if (selectedRole === "SELLER") {
        router.push("/seller");
      } else {
        router.push("/qc");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-16 px-4 sm:px-6 w-full max-w-[1100px] mx-auto min-h-[70vh]">
      {/* STEP 1: MINIMALIST SIGN-IN PAGE */}
      {step === "signin" && (
        <div className="w-full max-w-md mx-auto text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#111111]">
              GhostLoad AI
            </h1>
            <p className="text-base text-gray-600">
              Find hidden supply capacity when your supply chain breaks.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 text-left bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
              {errorMessage}
            </div>
          )}

          {/* Primary Action: Continue with Google */}
          <div className="pt-2">
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 border border-gray-300 rounded-lg bg-white text-[#111111] font-medium text-base hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-700 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span className="text-gray-600 text-sm">Connecting...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>
          </div>

          {/* Offline Demo Access Divider & Outlined Buttons */}
          <div className="pt-4 space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="border-t border-gray-200 w-full" />
              <span className="bg-white px-3 text-xs text-gray-500 font-normal uppercase tracking-wider relative">
                or try the demo
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleDemoSignIn("BUYER")}
                disabled={loading}
                className="py-2.5 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none transition cursor-pointer text-center"
              >
                Demo buyer
              </button>
              <button
                type="button"
                onClick={() => handleDemoSignIn("SELLER")}
                disabled={loading}
                className="py-2.5 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none transition cursor-pointer text-center"
              >
                Demo seller
              </button>
            </div>
          </div>

          {/* Small Footer Notice */}
          <p className="text-xs text-gray-500 pt-4">
            Demo uses hypothetical data.
          </p>
        </div>
      )}

      {/* STEP 2: ROLE SELECTION CARDS */}
      {step === "role_select" && (
        <div className="w-full max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-[#111111]">Select your role</h2>
            <p className="text-sm text-gray-600">Choose how your organisation will interact with GhostLoad AI.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              onClick={() => handleSelectRole("BUYER")}
              className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-700 hover:bg-blue-50/20 text-left transition cursor-pointer space-y-2 group"
            >
              <div className="text-lg font-bold text-gray-900 group-hover:text-blue-700">
                I buy parts
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Source verified parts and deploy emergency recovery capacity when your suppliers fail.
              </p>
            </button>

            <button
              onClick={() => handleSelectRole("SELLER")}
              className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-700 hover:bg-blue-50/20 text-left transition cursor-pointer space-y-2 group"
            >
              <div className="text-lg font-bold text-gray-900 group-hover:text-blue-700">
                I supply parts
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                List spare stock and factory machine hours to receive purchase orders and 24h capacity holds.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: COMPANY DETAILS SHORT FORM */}
      {step === "company_details" && (
        <Card className="w-full max-w-md mx-auto p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[#111111]">Company Profile</h2>
            <p className="text-xs text-gray-600">
              Set up your organisation for {selectedRole === "BUYER" ? "procurement" : "supplier listings"}.
            </p>
          </div>

          <form onSubmit={handleSaveCompanyDetails} className="space-y-4 text-xs">
            <div>
              <label className="block text-gray-700 font-medium mb-1">Company name</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Apex Mobility Tech Ltd"
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-700"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">City</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-700"
              >
                <option value="Bengaluru">Bengaluru</option>
                <option value="Chennai">Chennai</option>
                <option value="Pune">Pune</option>
                <option value="Hyderabad">Hyderabad</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">Industry</label>
              <input
                type="text"
                required
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-700"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">
                GST Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="e.g. 29AABCU9603R1Z7"
                className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-700"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={loading} className="w-full text-sm py-2.5">
                {loading ? "Saving..." : "Complete setup & start"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
