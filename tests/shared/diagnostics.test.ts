// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TestDiagnostics } from './diagnostics';

describe('test diagnostic guard', () => {
  it('fails on unexpected errors and React warnings', () => {
    const diagnostics = new TestDiagnostics();
    diagnostics.record('error', ['An update was not wrapped in act(...)']);
    diagnostics.record('warn', ['Synthetic unexpected warning']);
    expect(() => diagnostics.assertEmpty()).toThrow('An update was not wrapped in act(...)');
    expect(() => diagnostics.assertEmpty()).toThrow('Synthetic unexpected warning');
  });

  it('consumes only the expected level and message', () => {
    const diagnostics = new TestDiagnostics();
    diagnostics.record('error', ['Expected failure']);
    diagnostics.record('warn', ['Expected failure']);
    diagnostics.record('error', ['Unrelated failure']);
    diagnostics.consume('error', 'Expected failure');
    expect(() => diagnostics.assertEmpty()).toThrow('warn: Expected failure');
    expect(() => diagnostics.assertEmpty()).toThrow('Unrelated failure');
    diagnostics.consume('warn', 'Expected failure');
    diagnostics.consume('error', 'Unrelated failure');
    expect(() => diagnostics.assertEmpty()).not.toThrow();
  });

  it('requires the exact expected number of diagnostics', () => {
    const diagnostics = new TestDiagnostics();
    diagnostics.record('error', ['Expected failure']);
    diagnostics.record('error', ['Expected failure']);
    expect(() => diagnostics.consume('error', 'Expected failure')).toThrow('received 2');
    diagnostics.consume('error', 'Expected failure', 2);
    expect(() => diagnostics.assertEmpty()).not.toThrow();
  });

  it('rejects an expected error that was never logged', () => {
    const diagnostics = new TestDiagnostics();
    expect(() => diagnostics.consume('error', 'Missing failure')).toThrow('received 0');
  });

  it('does not retain diagnostics between tests', () => {
    const diagnostics = new TestDiagnostics();
    diagnostics.record('error', ['Previous failure']);
    diagnostics.clear();
    expect(() => diagnostics.assertEmpty()).not.toThrow();
  });
});
