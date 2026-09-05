import { apiRequest } from "./client";

export function previewOfx(file, directions = ["expense", "income"]) {
  return apiRequest("/api/bank-imports/ofx/preview", {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": "application/x-ofx",
      "X-File-Name": encodeURIComponent(file.name || "extrato.ofx"),
      "X-Import-Directions": directions.join(","),
    },
  });
}

export function confirmBankImport(importId, decisions) {
  return apiRequest(`/api/bank-imports/${encodeURIComponent(importId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ decisions }),
  });
}

export function getBankImports(page = 1, pageSize = 20) {
  return apiRequest(`/api/bank-imports?page=${page}&pageSize=${pageSize}`);
}

export function getBankImport(importId) {
  return apiRequest(`/api/bank-imports/${encodeURIComponent(importId)}`);
}

export function undoBankImport(importId) {
  return apiRequest(`/api/bank-imports/${encodeURIComponent(importId)}/undo`, {
    method: "POST",
    body: "{}",
  });
}
