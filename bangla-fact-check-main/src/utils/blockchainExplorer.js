export const BLOCK_EXPLORER_TX_BASE =
  (import.meta.env.VITE_BLOCK_EXPLORER_TX_BASE || "").trim() ||
  "https://sepolia.etherscan.io/tx/";

export function buildTxExplorerUrl(txHash) {
  if (!txHash) return null;
  const normalized = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  return `${BLOCK_EXPLORER_TX_BASE}${normalized}`;
}

export function pickTxUrl(onchain, txHash) {
  if (!txHash || !onchain || typeof onchain !== "object") return null;
  const registration = onchain.registration || {};
  const direct =
    registration.tx_url ||
    registration.txUrl ||
    registration.explorer_url ||
    registration.explorerUrl ||
    onchain.tx_url ||
    onchain.txUrl ||
    onchain.explorer_url ||
    onchain.explorerUrl;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  return buildTxExplorerUrl(txHash);
}
