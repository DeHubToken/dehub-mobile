import { apiClient } from "../libs";

// Local helpers (mirroring pattern used in feed.service)
function removeUndefined<T extends Record<string, any>>(obj?: T): Partial<T> {
  if (!obj) return {};
  const out: Partial<T> = {};
  (Object.entries(obj) as [keyof T, any][]).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") (out as any)[k] = v;
  });
  return out;
}

function objectToGetParams(obj?: Record<string, any>): string {
  if (!obj) return "";
  const entries = Object.entries(obj);
  if (!entries.length) return "";
  const query = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `?${query}`;
}

export async function dpayCreateOrder(data: any) {
  const url = `/dpay/checkout`;
  try {
    const res = await apiClient.post<{ result: any }>(
      url,
      data,
      { isAuthRequired: true }
    );
    return res;
  } catch (error: any) {
    console.error("[DpayService] createOrder error:", error);
    // Normalize common errors
    const msg = String(error?.message || "Create order failed");
    if (msg.includes("400") || /Invalid/i.test(msg)) {
      throw new Error("Invalid data provided for creating order.");
    } else if (msg.includes("401") || /Authentication/i.test(msg)) {
      throw new Error("Unauthorized. Please log in to continue.");
    } else if (msg.includes("500") || /Server error/i.test(msg)) {
      throw new Error("Server error while creating order. Try again later.");
    }
    throw new Error(msg);
  }
}

export async function getDpayTnx(filter: any) {
  const query = objectToGetParams(removeUndefined(filter));
  const url = `/dpay/tnxs${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    return res;
  } catch (error: any) {
    console.error("[DpayService] getDpayTnx error:", error);
    const msg = String(error?.message || "Fetch transaction failed");
    if (/400/.test(msg)) throw new Error("Invalid filter provided.");
    if (/404/.test(msg)) throw new Error("Transaction not found.");
    if (/500|Server/i.test(msg)) throw new Error("Server error while fetching transaction.");
    throw new Error(msg);
  }
}

export async function getDpayPrice(filter: { currency: string; amount: number; tokenSymbol: string; chainId: number; }) {
  const query = objectToGetParams(removeUndefined(filter));
  const url = `/dpay/price${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    return res;
  } catch (error: any) {
    console.error("[DpayService] getDpayPrice error:", error);
    const msg = String(error?.message || "Fetch price failed");
    if (/400/.test(msg)) throw new Error("Invalid request to fetch price.");
    if (/404/.test(msg)) throw new Error("Price data not found.");
    if (/500|Server/i.test(msg)) throw new Error("Server error while fetching price.");
    throw new Error(msg);
  }
}

export async function getSupply() {
  const url = "/dpay/available/tokens";
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: false });
    return res;
  } catch (error: any) {
    console.error("[DpayService] getSupply error:", error);
    const msg = String(error?.message || "Fetch supply failed");
    if (/400/.test(msg)) throw new Error("Invalid request to fetch available token supply.");
    if (/404/.test(msg)) throw new Error("Token supply data not found.");
    if (/500|Server/i.test(msg)) throw new Error("Server error while fetching token supply.");
    throw new Error(msg);
  }
}

export async function getSuccessTotal() {
  const url = "/dpay/total?type=success";
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: false });
    return res;
  } catch (error: any) {
    console.error("[DpayService] getSuccessTotal error:", error);
    const msg = String(error?.message || "Fetch total failed");
    if (/400/.test(msg)) throw new Error("Invalid request to fetch available token total.");
    if (/404/.test(msg)) throw new Error("Total data not found.");
    if (/500|Server/i.test(msg)) throw new Error("Server error while fetching token total.");
    throw new Error(msg);
  }
}

export default {
  dpayCreateOrder,
  getDpayTnx,
  getDpayPrice,
  getSupply,
  getSuccessTotal,
};
