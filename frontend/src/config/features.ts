export type FeatureStatus = "live" | "coming_soon";

export interface FeatureConfig {
  id: string;
  name: string;
  status: FeatureStatus;
  description: string;
}

export const FEATURES: Record<string, FeatureConfig> = {
  google_signin: {
    id: "google_signin",
    name: "Production Google Sign-in",
    status: "coming_soon",
    description: "Direct Firebase OAuth requires configured cloud tenant keys. Use Demo Mode.",
  },
  ai_chat_assistant: {
    id: "ai_chat_assistant",
    name: "Interactive AI Copilot",
    status: "live",
    description: "Conversational assistant powered by Google Gemini for querying supplier constraints and logistics.",
  },
  smart_sort: {
    id: "smart_sort",
    name: "Smart Sort (NLP)",
    status: "live",
    description: "Natural language query semantics reranker powered by Google Gemini structured outputs.",
  },
  compare: {
    id: "compare",
    name: "Side-by-Side Comparison",
    status: "live",
    description: "Compare up to 3 candidate components side-by-side on price, SLA, and trust.",
  },
  reviews_and_ratings: {
    id: "reviews_and_ratings",
    name: "Verified Ratings & Reviews",
    status: "live",
    description: "Two-factor quality and delivery rating after goods-receipt inspection.",
  },
  seller_replies: {
    id: "seller_replies",
    name: "Seller Dispute Replies",
    status: "live",
    description: "Single-reply seller response to verified buyer ratings.",
  },
  qc_inspector_queue: {
    id: "qc_inspector_queue",
    name: "QC Inspector Queue",
    status: "live",
    description: "Audit ISO/IATF certificate filings and investigate low-rating alerts.",
  },
  warehouse_transport_listings: {
    id: "warehouse_transport_listings",
    name: "Warehouse & Fleet Transport",
    status: "coming_soon",
    description: "Dedicated bay allocation and telematics-connected transport reservations.",
  },
  csv_export: {
    id: "csv_export",
    name: "Audit Log CSV Export",
    status: "live",
    description: "Download immutable chronological ledger of all decisions as CSV.",
  },
  route_map: {
    id: "route_map",
    name: "Live Supply Chain Route Map",
    status: "coming_soon",
    description: "Interactive geographical transit routing and multi-hub freight tracking.",
  },
  learning_hub_panel: {
    id: "learning_hub_panel",
    name: "Enterprise Learning Hub LMS",
    status: "coming_soon",
    description: "Procurement team training sync with SAP SuccessFactors / LMS.",
  },
  impact_panel: {
    id: "impact_panel",
    name: "ESG & Scope-3 Emissions Analytics",
    status: "coming_soon",
    description: "Calculates carbon and freight emissions delta for multi-supplier routing.",
  },
};

export function isFeatureLive(featureKey: string): boolean {
  return FEATURES[featureKey]?.status === "live";
}
