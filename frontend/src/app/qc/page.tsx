"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatSellerName } from "@/lib/formatters";

interface CertificateItem {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_city: string;
  cert_name: string;
  issuer: string;
  cert_number: string;
  issue_date: string;
  expiry_date: string;
  status: string;
  rejection_reason?: string;
  seller_trust_score: number;
}

interface FlaggedOrder {
  id: string;
  order_id: string;
  po_number: string;
  seller_id: string;
  seller_name: string;
  seller_city: string;
  buyer_id: string;
  buyer_name: string;
  quality_rating: number;
  delivery_rating: number;
  tags: string[];
  comment: string;
  seller_response?: string;
  qc_status: string;
  qc_notes?: string;
  created_at: string;
}

export default function QCInspectorPage() {
  const { user, apiBase } = useAuth();
  const [certs, setCerts] = useState<CertificateItem[]>([]);
  const [flaggedOrders, setFlaggedOrders] = useState<FlaggedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"certs" | "flagged">("certs");

  // Certificate reject modal
  const [rejectModalCert, setRejectModalCert] = useState<CertificateItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Flagged order review modal
  const [selectedFlag, setSelectedFlag] = useState<FlaggedOrder | null>(null);
  const [qcNotes, setQcNotes] = useState("");

  const fetchData = async () => {
    try {
      const [certRes, flagRes] = await Promise.all([
        fetch(`${apiBase}/api/qc/certificates`),
        fetch(`${apiBase}/api/qc/flagged-orders`),
      ]);
      const certData = await certRes.json();
      const flagData = await flagRes.json();
      setCerts(certData);
      setFlaggedOrders(flagData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, apiBase]);

  const handleVerifyCert = async (certId: string, action: "APPROVE" | "REJECT", reason = "") => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `${apiBase}/api/qc/certificates/${certId}/verify?action=${action}&reason=${encodeURIComponent(reason)}`,
        {
          method: "POST",
          headers: { "X-Demo-User": user?.id || "qc-inspector-1" },
        }
      );
      if (res.ok) {
        setRejectModalCert(null);
        setRejectReason("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveFlag = async (reviewId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `${apiBase}/api/qc/flagged-orders/${reviewId}/resolve?action=RESOLVED&notes=${encodeURIComponent(qcNotes)}`,
        {
          method: "POST",
          headers: { "X-Demo-User": user?.id || "qc-inspector-1" },
        }
      );
      if (res.ok) {
        setSelectedFlag(null);
        setQcNotes("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCerts = certs.filter((c) => c.status === "PENDING");
  const verifiedCerts = certs.filter((c) => c.status !== "PENDING");
  const pendingFlags = flaggedOrders.filter((f) => f.qc_status === "PENDING_REVIEW");

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111111]">QC Inspector Audit</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Audit supplier certificates and investigate low-rating delivery alerts.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1 bg-white">
          <button
            onClick={() => setActiveTab("certs")}
            className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition ${
              activeTab === "certs" ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Certificates ({pendingCerts.length})
          </button>
          <button
            onClick={() => setActiveTab("flagged")}
            className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition ${
              activeTab === "flagged" ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Flagged alerts ({pendingFlags.length})
          </button>
        </div>
      </div>

      {activeTab === "certs" ? (
        <>
          {/* Pending Queue */}
          <Card className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900">
                Pending certificate verification ({pendingCerts.length})
              </h2>
              {pendingCerts.length > 0 && <Badge variant="warning">Action needed</Badge>}
            </div>

            {pendingCerts.length === 0 ? (
              <p className="text-xs text-gray-500">No pending certificates waiting for review.</p>
            ) : (
              <div className="space-y-3">
                {pendingCerts.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 rounded-lg border border-amber-200 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-gray-900 text-sm">{c.cert_name}</strong>
                        <Badge variant="warning">Pending review</Badge>
                      </div>
                      <p className="text-gray-600 mt-1">
                        Supplier: <strong>{formatSellerName(c.seller_name, c.seller_city)}</strong> · Issuer: {c.issuer}
                      </p>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        License #{c.cert_number} · Valid until {new Date(c.expiry_date).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button onClick={() => handleVerifyCert(c.id, "APPROVE")} disabled={submitting}>
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          setRejectModalCert(c);
                          setRejectReason("Documentation expired or unverified by BIS/TUV");
                        }}
                        disabled={submitting}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Audit History Table */}
          <Card className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Certificate ledger ({verifiedCerts.length})</h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3">Standard</th>
                    <th className="py-2.5 px-3">Issuer</th>
                    <th className="py-2.5 px-3">Expiry</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-800">
                  {verifiedCerts.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 px-3">{formatSellerName(c.seller_name, c.seller_city)}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{c.cert_name}</td>
                      <td className="py-2.5 px-3 text-gray-500">{c.issuer}</td>
                      <td className="py-2.5 px-3 text-gray-500">
                        {new Date(c.expiry_date).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={c.status === "APPROVED" ? "success" : "danger"}>
                          {c.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        /* Flagged Orders Queue */
        <Card className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-gray-900">
              Low-Rating Quality & Delivery Alerts ({flaggedOrders.length})
            </h2>
            <span className="text-xs text-gray-500">Orders with ratings ≤ 2 stars automatically flagged</span>
          </div>

          {flaggedOrders.length === 0 ? (
            <p className="text-xs text-gray-500">No quality alerts currently require inspection.</p>
          ) : (
            <div className="space-y-3">
              {flaggedOrders.map((f) => (
                <div
                  key={f.id}
                  className="p-4 rounded-lg border border-red-200 bg-red-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gray-900 text-sm">{f.po_number}</span>
                      <Badge variant="danger">Low Rating Alert</Badge>
                      <Badge variant={f.qc_status === "RESOLVED" ? "success" : "warning"}>
                        {f.qc_status}
                      </Badge>
                    </div>
                    <p className="text-gray-700">
                      Supplier: <strong>{formatSellerName(f.seller_name, f.seller_city)}</strong> · Buyer: {f.buyer_name}
                    </p>
                    <div className="flex items-center gap-3 text-gray-800 font-medium pt-0.5">
                      <span className="text-red-700">★ {f.quality_rating} / 5 Quality</span>
                      <span>·</span>
                      <span className="text-amber-800">★ {f.delivery_rating} / 5 Delivery</span>
                      {f.tags.length > 0 && (
                        <span className="text-gray-500 text-[11px]">Tags: [{f.tags.join(", ")}]</span>
                      )}
                    </div>
                    {f.comment && (
                      <p className="text-gray-600 bg-white p-2 rounded border border-gray-200 mt-1 italic">
                        &quot;{f.comment}&quot;
                      </p>
                    )}
                    {f.qc_notes && (
                      <p className="text-emerald-800 text-[11px] pt-1">
                        <strong>Inspector resolution:</strong> {f.qc_notes}
                      </p>
                    )}
                  </div>

                  {f.qc_status !== "RESOLVED" && (
                    <Button
                      onClick={() => {
                        setSelectedFlag(f);
                        setQcNotes("Supplier contacted. Root cause identified and corrective batch dispatched.");
                      }}
                      className="whitespace-nowrap"
                    >
                      Resolve alert
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Reject Reason Modal */}
      {rejectModalCert && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 shadow-xl relative text-xs">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Reject certificate
            </h2>
            <p className="text-gray-500 mb-3">
              Rejecting {rejectModalCert.cert_name} for {formatSellerName(rejectModalCert.seller_name, rejectModalCert.seller_city)}.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyCert(rejectModalCert.id, "REJECT", rejectReason);
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Rejection reason</label>
                <textarea
                  rows={2}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-red-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setRejectModalCert(null)}>
                  Cancel
                </Button>
                <Button variant="danger" type="submit" disabled={submitting}>
                  {submitting ? "Rejecting..." : "Confirm rejection"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Flagged Order Modal */}
      {selectedFlag && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 shadow-xl relative text-xs">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Investigate & Resolve Alert
            </h2>
            <p className="text-gray-500 mb-3">
              Audit {selectedFlag.po_number} with {formatSellerName(selectedFlag.seller_name, selectedFlag.seller_city)}.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleResolveFlag(selectedFlag.id);
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Investigation notes & resolution</label>
                <textarea
                  rows={3}
                  required
                  value={qcNotes}
                  onChange={(e) => setQcNotes(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setSelectedFlag(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Resolving..." : "Complete investigation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
