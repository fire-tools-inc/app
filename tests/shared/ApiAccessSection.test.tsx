import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiAccessSection } from '../../src/components/ApiAccessSection';
import type { ApiAccessState } from '../../src/utils/apiBase';
import { expectDiagnostic } from './diagnostics';

const FILE = '/synthetic/profile/local-api.json';
const base: ApiAccessState = {
  ok: true, enabled: false, available: true, port: 47820, defaultPort: 47820,
  listening: false, baseUrl: null, portError: null, discoveryFile: FILE,
};
const on = (overrides: Partial<ApiAccessState> = {}): ApiAccessState => ({
  ...base, enabled: true, listening: true, baseUrl: 'http://127.0.0.1:47820/api/v1', ...overrides,
});

function installBridge(initial: ApiAccessState, set?: (opts: { enabled?: boolean; port?: number }) => Promise<ApiAccessState>) {
  const bridge = {
    get: vi.fn(async () => initial),
    set: vi.fn(set ?? (async (opts: { enabled?: boolean; port?: number }) => (opts.enabled === false ? base : on({ port: opts.port ?? 47820 })))),
    regenerateToken: vi.fn(async () => on()),
    copyToken: vi.fn(async () => ({ ok: true })),
  };
  window.fireTools = { apiAccess: bridge };
  return bridge;
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  delete window.fireTools;
});

describe('ApiAccessSection', () => {
  it('renders nothing outside the desktop app', () => {
    const { container } = render(<ApiAccessSection collapsed={false} onToggle={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('turns access on and shows the stable address, token actions and connection file', async () => {
    const bridge = installBridge(base);
    render(<ApiAccessSection collapsed={false} onToggle={() => {}} />);
    await waitFor(() => expect(button('On').disabled).toBe(false));
    expect(screen.queryByText(FILE)).toBeNull();

    fireEvent.click(button('On'));

    await waitFor(() => expect(button('On').getAttribute('aria-pressed')).toBe('true'));
    expect(bridge.set).toHaveBeenCalledWith({ enabled: true });
    expect(screen.getByText('http://127.0.0.1:47820/api/v1').tagName).toBe('CODE');
    expect(screen.getByText(FILE).tagName).toBe('CODE');
    expect(screen.getByText(/that has the token can read and change/i).className).toContain('callout--warning');

    fireEvent.click(button('Copy token'));
    await waitFor(() => expect(bridge.copyToken).toHaveBeenCalledTimes(1));
    fireEvent.click(button('Regenerate token'));
    await waitFor(() => expect(bridge.regenerateToken).toHaveBeenCalledTimes(1));
  });

  it('validates and saves a new port, and explains when the port is taken', async () => {
    const bridge = installBridge(on(), async (opts) => on({ port: opts.port, listening: false, baseUrl: 'http://127.0.0.1:53000/api/v1', portError: 'in_use' }));
    render(<ApiAccessSection collapsed={false} onToggle={() => {}} />);
    const port = await screen.findByLabelText('Port') as HTMLInputElement;
    await waitFor(() => expect(port.value).toBe('47820'));
    expect(button('Use this port').disabled).toBe(true);

    fireEvent.change(port, { target: { value: '80' } });
    expect(button('Use this port').disabled).toBe(true);
    expect(port.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(port, { target: { value: '51000' } });
    fireEvent.click(button('Use this port'));
    await waitFor(() => expect(bridge.set).toHaveBeenCalledWith({ port: 51000 }));
    expect((await screen.findByText(/Port 51000 is used by another program/)).className).toContain('callout--warning');
  });

  it('keeps access unavailable without the built-in database and reports failed changes', async () => {
    installBridge({ ...base, available: false });
    render(<ApiAccessSection collapsed={false} onToggle={() => {}} />);
    expect((await screen.findByText(/needs the built-in database/i)).className).toContain('callout');
    expect(button('On').disabled).toBe(true);
    cleanup();

    installBridge(base, async () => ({ ok: false, error: 'disk full' }));
    render(<ApiAccessSection collapsed={false} onToggle={() => {}} />);
    await waitFor(() => expect(button('On').disabled).toBe(false));
    fireEvent.click(button('On'));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not change API access: disk full');
    expect(button('On').getAttribute('aria-pressed')).toBe('false');
    expectDiagnostic('error', 'could not update API access');
  });
});
