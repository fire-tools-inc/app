import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentAccessSection } from '../../src/components/AgentAccessSection';
import type { AgentAccessState } from '../../src/utils/apiBase';
import { expectDiagnostic } from './diagnostics';

const FILE = '/synthetic/profile/agent-api.json';

function installBridge(initial: AgentAccessState, onSet?: (enabled: boolean) => Promise<AgentAccessState>) {
  const set = vi.fn(onSet ?? (async (enabled: boolean) => ({ ok: true, enabled, available: true, discoveryFile: FILE })));
  window.fireTools = {
    agentAccess: {
      get: vi.fn(async () => initial),
      set: vi.fn(({ enabled }: { enabled: boolean }) => set(enabled)),
    },
  };
  return set;
}

afterEach(() => {
  cleanup();
  delete window.fireTools;
});

describe('AgentAccessSection', () => {
  it('renders nothing outside the desktop app', () => {
    const { container } = render(<AgentAccessSection collapsed={false} onToggle={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('turns access on and then shows the risk and the connection file', async () => {
    const set = installBridge({ ok: true, enabled: false, available: true, discoveryFile: FILE });
    render(<AgentAccessSection collapsed={false} onToggle={() => {}} />);
    const on = await screen.findByRole('button', { name: 'On' });
    await waitFor(() => expect((on as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(FILE)).toBeNull();

    fireEvent.click(on);

    await waitFor(() => expect(on.getAttribute('aria-pressed')).toBe('true'));
    expect(set).toHaveBeenCalledWith(true);
    expect(screen.getByText(FILE).tagName).toBe('CODE');
    expect(screen.getByText(/any program running under your user account/i).className).toContain('callout--warning');
  });

  it('keeps access unavailable without the built-in database and reports failed changes', async () => {
    installBridge({ ok: true, enabled: false, available: false, discoveryFile: FILE });
    render(<AgentAccessSection collapsed={false} onToggle={() => {}} />);
    expect((await screen.findByText(/needs the built-in database/i)).className).toContain('callout');
    expect((screen.getByRole('button', { name: 'On' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    installBridge({ ok: true, enabled: false, available: true, discoveryFile: FILE },
      async () => ({ ok: false, error: 'disk full' }));
    render(<AgentAccessSection collapsed={false} onToggle={() => {}} />);
    const on = await screen.findByRole('button', { name: 'On' });
    await waitFor(() => expect((on as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(on);
    expect((await screen.findByRole('alert')).textContent).toBe('Could not change agent access: disk full');
    expect(on.getAttribute('aria-pressed')).toBe('false');
    expectDiagnostic('error', 'could not update agent access');
  });
});
