// A/B winner selection with a significance test.

/**
 * Two-proportion z-test on click rate, then confirmed-open rate. A variant only
 * "wins" on a metric when the difference is statistically significant
 * (p < 0.05); otherwise it falls through to the next metric, and a full tie
 * keeps A — the sender's primary choice. Before, 3 clicks vs 2 was declared
 * a winner: that is noise.
 */
export function pickAbWinner(
  a: { delivered: number; clicks: number; confirmedOpens: number },
  b: { delivered: number; clicks: number; confirmedOpens: number },
): { winner: 'A' | 'B'; basis: 'clicks' | 'opens' | 'tie'; pValue: number | null } {
  for (const metric of ['clicks', 'confirmedOpens'] as const) {
    const p = twoProportionPValue(a[metric], a.delivered, b[metric], b.delivered)
    if (p !== null && p < 0.05) {
      const rateA = a[metric] / a.delivered
      const rateB = b[metric] / b.delivered
      return { winner: rateB > rateA ? 'B' : 'A', basis: metric === 'clicks' ? 'clicks' : 'opens', pValue: Number(p.toFixed(4)) }
    }
  }
  return { winner: 'A', basis: 'tie', pValue: null }
}

export function twoProportionPValue(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null
  const p1 = x1 / n1
  const p2 = x2 / n2
  const pooled = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
  if (se === 0) return null
  const z = Math.abs(p1 - p2) / se
  // Two-sided p-value from the standard normal CDF (Abramowitz-Stegun erf)
  return 2 * (1 - normalCdf(z))
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2))
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return 0.5 * (1 + erf)
}

