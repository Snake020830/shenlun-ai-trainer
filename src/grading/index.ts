import { createGradingService } from "./contracts";
import { mockGradingProvider } from "./mockProvider";

export const gradingService = createGradingService(mockGradingProvider);

export * from "./contracts";
