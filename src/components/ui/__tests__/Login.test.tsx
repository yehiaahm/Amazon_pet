import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { Login } from '../Login';

/**
 * PinPolicy allows 4–10 digit PINs, so no length is "the end" of a PIN. The keypad used to submit
 * by itself after the fourth digit, which sent the first four digits of a longer PIN to the
 * server, cleared the pad mid-entry and spent a throttled attempt on every login.
 */
describe('Login PIN keypad', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, message: 'رمز الدخول السري غير صحيح!' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    // This jsdom setup exposes a localStorage without getItem, which getBackendUrl() calls
    // before the request is ever made — so without this stub no test reaches fetch at all.
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const press = (digits: string) => {
    for (const d of digits) {
      fireEvent.click(screen.getByRole('button', { name: d }));
    }
  };

  const submit = () => fireEvent.click(document.querySelector('button[type="submit"]') as HTMLButtonElement);

  it('does not submit on its own after four digits, however long the pause', async () => {
    render(<Login />);
    press('1234');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a longer PIN intact across a slow fifth digit and submits all of it on request', async () => {
    render(<Login />);
    press('1234');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    press('56');
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ pin: '123456' });
  });

  it('still logs a four-digit PIN in through the arrow button', async () => {
    render(<Login />);
    press('4321');
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ pin: '4321' });
  });

  it('does not send a PIN shorter than the minimum', async () => {
    render(<Login />);
    press('123');
    submit();
    fireEvent.keyDown(window, { key: 'Enter' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
