import type { z } from "zod";
import type { strategySchema } from "./validation";
export type StrategySnapshot = {
  mode: string;
  pool: string;
  dryRun: boolean;
  values: z.infer<typeof strategySchema>;
  modules: string[];
  pauseConditions: string[];
};
export interface StrategyRepository {
  load(): StrategySnapshot | undefined;
  save(snapshot: StrategySnapshot): void;
  reset(): void;
}
/** A separate memory repository per console provider, never shared between SSR requests. */
export function createSessionStrategyRepository(): StrategyRepository {
  let strategy: StrategySnapshot | undefined;
  return {
    load: () => (strategy ? structuredClone(strategy) : undefined),
    save: (value) => {
      strategy = structuredClone(value);
    },
    reset: () => {
      strategy = undefined;
    },
  };
}