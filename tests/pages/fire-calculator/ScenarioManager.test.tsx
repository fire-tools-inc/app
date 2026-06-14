import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, within } from '@testing-library/react';
import { ScenarioManager } from '../../../src/components/ScenarioManager';
import { DEFAULT_INPUTS } from '../../../src/utils/defaults';
import { clearScenarios, loadScenarios } from '../../../src/utils/cookieStorage';
import { MAX_SCENARIOS } from '../../../src/types/scenario';
import { CalculatorInputs } from '../../../src/types/calculator';

// Mock cookie + localStorage so cookieStorage persistence works in jsdom.
const cookieMock = (() => {
  let cookies: Record<string, string> = {};
  const DEL = ['max-age=0', 'expires=Thu, 01 Jan 1970'];
  return {
    get: () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
    set: (raw: string) => {
      const [pair] = raw.split(';');
      const [k, v] = pair.split('=');
      if (k && v !== undefined) {
        if (v === '' || DEL.some((m) => raw.includes(m))) delete cookies[k.trim()];
        else cookies[k.trim()] = v.trim();
      }
    },
    clear: () => { cookies = {}; },
  };
})();

Object.defineProperty(document, 'cookie', {
  get: () => cookieMock.get(),
  set: (v: string) => cookieMock.set(v),
  configurable: true,
});

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

const inputs: CalculatorInputs = { ...DEFAULT_INPUTS, initialSavings: 123456 };

describe('ScenarioManager', () => {
  beforeEach(() => {
    cookieMock.clear();
    localStorageMock.clear();
    clearScenarios();
  });

  const openDropdown = () => {
    fireEvent.click(screen.getByRole('button', { name: /save and load scenarios/i }));
  };

  it('saves the current inputs as a named scenario', () => {
    render(<ScenarioManager inputs={inputs} onLoad={vi.fn()} />);
    openDropdown();

    fireEvent.change(screen.getByPlaceholderText(/scenario name/i), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const stored = loadScenarios();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('My Plan');
    expect(stored[0].inputs.initialSavings).toBe(123456);
  });

  it('does not save when the name is empty', () => {
    render(<ScenarioManager inputs={inputs} onLoad={vi.fn()} />);
    openDropdown();

    const saveBtn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(loadScenarios()).toHaveLength(0);
  });

  it('loads a saved scenario via onLoad', () => {
    const onLoad = vi.fn();
    render(<ScenarioManager inputs={inputs} onLoad={onLoad} />);
    openDropdown();

    fireEvent.change(screen.getByPlaceholderText(/scenario name/i), {
      target: { value: 'Loadable' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Loadable' }));
    expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({ initialSavings: 123456 })
    );
  });

  it('deletes a saved scenario', () => {
    render(<ScenarioManager inputs={inputs} onLoad={vi.fn()} />);
    openDropdown();

    fireEvent.change(screen.getByPlaceholderText(/scenario name/i), {
      target: { value: 'Removable' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(loadScenarios()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /delete scenario removable/i }));
    expect(loadScenarios()).toHaveLength(0);
  });

  it(`enforces a maximum of ${MAX_SCENARIOS} scenarios`, () => {
    render(<ScenarioManager inputs={inputs} onLoad={vi.fn()} />);
    openDropdown();

    const nameInput = screen.getByPlaceholderText(/scenario name/i);
    for (let i = 0; i < MAX_SCENARIOS; i++) {
      fireEvent.change(nameInput, { target: { value: `Scenario ${i}` } });
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    }

    expect(loadScenarios()).toHaveLength(MAX_SCENARIOS);
    // Input and save are disabled once the limit is reached.
    expect((screen.getByPlaceholderText(/scenario name/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an empty state when there are no scenarios', () => {
    render(<ScenarioManager inputs={inputs} onLoad={vi.fn()} />);
    openDropdown();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/no saved scenarios yet/i)).toBeTruthy();
  });
});
