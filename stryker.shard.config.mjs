// Shards run without a breaking threshold: Stryker applies it per process, and
// scripts/mutation-score.mjs gates the aggregate score against the same
// thresholds.break from stryker.config.json.
import baseConfig from "./stryker.config.json" with { type: "json" }

export default {
  ...baseConfig,
  thresholds: { ...baseConfig.thresholds, break: null },
}
