/**
 * Reputation weighting (P9-03, FR-D3, B9).
 * Weights sellers by unique buyers, account age (ledgers), volume,
 * and strictly excludes self-dealing and wash trading.
 */
export interface PactHistoryRecord {
  pactId: string;
  seller: string;
  buyer: string;
  amount: string;
  ledgerSeq: number;
  verdict: "allow" | "deny";
}

export interface WeightedReputationResult {
  seller: string;
  score: number; // 0..100
  uniqueBuyers: number;
  totalVolume: number;
  ageLedgers: number;
  selfDealingExcluded: number;
  washTradingPenalty: number;
}

export function computeWeightedReputation(
  seller: string,
  history: PactHistoryRecord[],
  currentLedger = 100_000,
): WeightedReputationResult {
  const sellerLower = seller.toLowerCase();
  let selfDealingCount = 0;
  const validRecords: PactHistoryRecord[] = [];

  for (const record of history) {
    if (record.seller.toLowerCase() !== sellerLower) {
      continue;
    }
    // Exclude self-dealing: buyer == seller
    if (record.buyer.toLowerCase() === sellerLower) {
      selfDealingCount++;
      continue;
    }
    validRecords.push(record);
  }

  if (validRecords.length === 0) {
    return {
      seller,
      score: 0,
      uniqueBuyers: 0,
      totalVolume: 0,
      ageLedgers: 0,
      selfDealingExcluded: selfDealingCount,
      washTradingPenalty: selfDealingCount > 0 ? 50 : 0,
    };
  }

  const buyersMap = new Map<string, number>();
  let totalVolume = 0;
  let successCount = 0;
  let minLedger = currentLedger;

  for (const r of validRecords) {
    const buyerLower = r.buyer.toLowerCase();
    buyersMap.set(buyerLower, (buyersMap.get(buyerLower) ?? 0) + 1);

    const amt = parseFloat(r.amount);
    totalVolume += isNaN(amt) ? 0 : amt;

    if (r.verdict === "allow") {
      successCount++;
    }

    if (r.ledgerSeq < minLedger) {
      minLedger = r.ledgerSeq;
    }
  }

  const uniqueBuyers = buyersMap.size;
  const ageLedgers = Math.max(0, currentLedger - minLedger);

  // Wash trading detection: if one buyer makes up >50% of trades when count >= 4
  let maxTradesByOneBuyer = 0;
  for (const count of buyersMap.values()) {
    if (count > maxTradesByOneBuyer) {
      maxTradesByOneBuyer = count;
    }
  }

  let washPenalty = 0;
  if (validRecords.length >= 4) {
    const topBuyerRatio = maxTradesByOneBuyer / validRecords.length;
    if (topBuyerRatio > 0.5) {
      washPenalty = Math.round((topBuyerRatio - 0.4) * 60);
    }
  }

  // Scoring breakdown:
  // 1. Unique buyers: up to 35 points (10 unique buyers gives 35)
  const uniqueScore = Math.min(35, uniqueBuyers * 3.5);

  // 2. Success rate (verdict ALLOW): up to 35 points
  const successRate = successCount / validRecords.length;
  const successScore = successRate * 35;

  // 3. Age: up to 15 points
  const ageScore = Math.min(15, (ageLedgers / 50_000) * 15);

  // 4. Volume: up to 15 points
  const volumeScore = Math.min(15, (totalVolume / 100) * 15);

  const rawScore = uniqueScore + successScore + ageScore + volumeScore - washPenalty;
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    seller,
    score: finalScore,
    uniqueBuyers,
    totalVolume: Math.round(totalVolume * 100) / 100,
    ageLedgers,
    selfDealingExcluded: selfDealingCount,
    washTradingPenalty: washPenalty,
  };
}
