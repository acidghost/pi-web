import { afterEach, expect, test } from "bun:test";
import { applyBrowserEvent, state } from "./state";

afterEach(() => {
  state.metadata = null;
  state.isStreaming = false;
});

test("session state updates the model's available thinking levels", () => {
  state.metadata = {
    id: "session-1",
    cwd: "/tmp",
    createdAt: 1,
    updatedAt: 1,
    isStreaming: false,
    model: { provider: "example", id: "reasoning", name: "Reasoning" },
    thinkingLevel: "high",
    availableThinkingLevels: ["off", "high"],
  };

  applyBrowserEvent({
    type: "session_state",
    sessionId: "session-1",
    updatedAt: 2,
    isStreaming: false,
    model: { provider: "example", id: "basic", name: "Basic" },
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
  });

  expect(state.metadata).toMatchObject({
    model: { id: "basic" },
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
  });
});
