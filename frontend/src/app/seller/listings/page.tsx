"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import Link from "next/link";

interface Listing {
  id: string;
  title: string;
  category: string;
  listing_type: string;
  specs: Record<string, any>;
  units_available: number;
  reserved_units: number;
  net_available: number;
  price_per_unit: number;
  lead_days: number;
  min_order: number;
  city: string;
  created_at: string;
}

export default function SellerListingsPage() {
  const { user, apiBase } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    category: "Braking Systems",
    listing_type: "PRODUCT_STOCK",
    units_available: 500,
    price_per_unit: 85.0,
    lead_days: 1,
    min_order: 25,
    city: "Bengaluru",
    specKey: "Friction Rating",
    specVal: "GG Class",
    cert_name: "ISO 9001:2015",
    cert_expiry_days: 180,
  });

  const fetchListings = async () => {
    try {
      const res = await fetch(`${apiBase}/api/seller/listings`, {
        headers: { "X-Demo-User": user?.id || "seller-factory-a" },
      });
      const data = await res.json();
      setListings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [user, apiBase]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      title: "",
      category: "Braking Systems",
      listing_type: "PRODUCT_STOCK",
      units_available: 500,
      price_per_unit: 85.0,
      lead_days: 1,
      min_order: 25,
      city: user?.city || "Bengaluru",
      specKey: "Specification",
      specVal: "Standard Grade",
      cert_name: "ISO 9001:2015",
      cert_expiry_days: 180,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Listing) => {
    setEditingId(item.id);
    const firstKey = Object.keys(item.specs)[0] || "Spec";
    const firstVal = item.specs[firstKey] || "";
    setFormData({
      title: item.title,
      category: item.category,
      listing_type: item.listing_type,
      units_available: item.units_available,
      price_per_unit: item.price_per_unit,
      lead_days: item.lead_days,
      min_order: item.min_order,
      city: item.city,
      specKey: firstKey,
      specVal: firstVal,
      cert_name: "ISO 9001 / IATF",
      cert_expiry_days: 180,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: formData.title,
      category: formData.category,
      listing_type: formData.listing_type,
      units_available: Number(formData.units_available),
      price_per_unit: Number(formData.price_per_unit),
      lead_days: Number(formData.lead_days),
      min_order: Number(formData.min_order),
      city: formData.city,
      specs: { [formData.specKey]: formData.specVal },
      cert_name: formData.cert_name,
      cert_expiry_days: Number(formData.cert_expiry_days),
    };

    try {
      const url = editingId
        ? `${apiBase}/api/seller/listings/${editingId}`
        : `${apiBase}/api/seller/listings`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "seller-factory-a",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchListings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#111111]">Listings & Spare Capacity</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Published parts, machinery capacity, and transport services.
          </p>
        </div>

        <Button onClick={handleOpenCreate}>
          Create new listing
        </Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading listings...</div>
      ) : listings.length === 0 ? (
        <div className="p-12 text-center text-gray-500 text-sm border border-gray-200 rounded-lg bg-gray-50">
          No listings created yet.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Available</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Lead days</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              {listings.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/60">
                  <td className="py-3 px-4 font-semibold text-gray-900">{item.title}</td>
                  <td className="py-3 px-4 text-gray-600">{item.category}</td>
                  <td className="py-3 px-4">
                    <Badge variant="neutral">
                      {item.listing_type === "PRODUCT_STOCK" ? "Stock" : "Capacity"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    {item.net_available} units
                    {item.reserved_units > 0 && (
                      <span className="text-red-600 ml-1">({item.reserved_units} held)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-semibold">₹{item.price_per_unit}</td>
                  <td className="py-3 px-4">{item.lead_days} day(s)</td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="link" onClick={() => handleOpenEdit(item)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create or Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-lg max-w-lg w-full p-6 shadow-xl relative text-xs">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              {editingId ? "Edit listing" : "Create new listing"}
            </h2>
            <p className="text-gray-500 mb-4">
              Parts and capacity will be visible in marketplace and emergency solver.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-gray-600 mb-1 font-medium">Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Ceramic Composite Brake Pads"
                  className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Type</label>
                  <select
                    value={formData.listing_type}
                    onChange={(e) => setFormData({ ...formData, listing_type: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
                  >
                    <option value="PRODUCT_STOCK">Product stock</option>
                    <option value="PRODUCTION_CAPACITY">Production capacity</option>
                    <option value="WAREHOUSE_SPACE">Warehouse space</option>
                    <option value="TRANSPORT">Transport</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
                  >
                    <option value="Braking Systems">Braking Systems</option>
                    <option value="Chassis & Suspension">Chassis & Suspension</option>
                    <option value="Drivetrain & Transmission">Drivetrain & Transmission</option>
                    <option value="Engine & Powertrain">Engine & Powertrain</option>
                    <option value="Electrical & Electronics">Electrical & Electronics</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Units available</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.units_available}
                    onChange={(e) => setFormData({ ...formData, units_available: Number(e.target.value) })}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Price per unit (₹)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    value={formData.price_per_unit}
                    onChange={(e) => setFormData({ ...formData, price_per_unit: Number(e.target.value) })}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Lead days</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.lead_days}
                    onChange={(e) => setFormData({ ...formData, lead_days: Number(e.target.value) })}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1 font-medium">Hub city</label>
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
                  >
                    <option value="Bengaluru">Bengaluru</option>
                    <option value="Chennai">Chennai</option>
                    <option value="Pune">Pune</option>
                    <option value="Hyderabad">Hyderabad</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingId ? "Save changes" : "Publish listing"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
