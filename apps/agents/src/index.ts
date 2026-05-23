export { Agent, type AgentConfig } from "./agent.js";
export { registerAgent } from "./register.js";
export { heuristics, claudeForecast, hasModelProvider, type MarketContext, type Forecast, type StrategyName } from "./strategies.js";
export {
  createCircleClient,
  createAgentWallets,
  registerAgentViaCircle,
  type CircleClient,
  type AgentWallet,
} from "./circleWallet.js";
