/**
 * Tests for src/lib/platform-admin/governance.ts
 *
 * En V1 aucune table de gouvernance durable n'existe -> toutes les actions
 * doivent être disabled avec une raison explicite. Aucune mutation simulée.
 */
import { describe, it, expect, afterEach } from "vitest";
import { getGovernanceActions, governanceFoundationPresent } from "../governance";

const ORIGINAL = process.env.PLATFORM_ADMIN_GOVERNANCE_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PLATFORM_ADMIN_GOVERNANCE_ENABLED;
  else process.env.PLATFORM_ADMIN_GOVERNANCE_ENABLED = ORIGINAL;
});

describe("governanceFoundationPresent", () => {
  it("is false by default (no durable table in V1)", () => {
    delete process.env.PLATFORM_ADMIN_GOVERNANCE_ENABLED;
    expect(governanceFoundationPresent()).toBe(false);
  });
  it("is true only with explicit flag", () => {
    process.env.PLATFORM_ADMIN_GOVERNANCE_ENABLED = "true";
    expect(governanceFoundationPresent()).toBe(true);
  });
});

describe("getGovernanceActions", () => {
  it("disables every action with a reason when no foundation", () => {
    delete process.env.PLATFORM_ADMIN_GOVERNANCE_ENABLED;
    const actions = getGovernanceActions();
    expect(actions.length).toBeGreaterThanOrEqual(5);
    for (const a of actions) {
      expect(a.enabled).toBe(false);
      expect(a.disabledReason).toBeTruthy();
      expect(a.disabledReason).toMatch(/requiert/i);
    }
  });
  it("covers the five governance keys", () => {
    const keys = getGovernanceActions().map((a) => a.key).sort();
    expect(keys).toEqual(
      ["add_operator_note", "mark_approved", "set_run_quota", "set_tenant_status", "toggle_tool_permission"].sort(),
    );
  });
});
