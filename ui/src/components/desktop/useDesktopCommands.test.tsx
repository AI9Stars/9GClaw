import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopCommand } from '../../../shared/desktopCommands';
import { useDesktopCommands } from './useDesktopCommands';

afterEach(() => { cleanup(); delete window.pilotdeckDesktop; });
it('rechecks modal state at delivery, respects context and cleans up the bridge', async () => {
  let deliver: (command: DesktopCommand) => void = () => {};
  const setMenuState = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn();
  window.pilotdeckDesktop = { platform: 'darwin', setMenuState, onCommand: (callback: (command: DesktopCommand) => void) => { deliver = callback; return stop; } } as any;
  const execute = vi.fn();
  function Shell({ hasProject = false }) {
    useDesktopCommands({ canNewConversation: true, hasProject, canFind: true, sidebarVisible: true, integrateMacCaption: false, execute });
    return <input aria-label="Editor" />;
  }
  const view = render(<Shell />);
  expect(setMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ ready: true, hasProject: false }));
  act(() => deliver('files'));
  expect(execute).not.toHaveBeenCalled();
  view.rerender(<Shell hasProject />);
  act(() => deliver('files'));
  expect(execute).toHaveBeenLastCalledWith('files');
  const modal = document.createElement('div');
  modal.setAttribute('aria-modal', 'true');
  document.body.append(modal);
  execute.mockClear();
  act(() => deliver('new-project'));
  expect(execute).not.toHaveBeenCalled();
  await waitFor(() => expect(setMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ blocked: true })));
  modal.remove();
  act(() => deliver('new-conversation'));
  expect(execute).toHaveBeenLastCalledWith('new-conversation');
  execute.mockClear();
  fireEvent.keyDown(view.getByRole('textbox'), { key: 'b', metaKey: true });
  expect(execute).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: 'b', metaKey: true, ctrlKey: true });
  expect(execute).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: 'b', metaKey: true });
  expect(execute).toHaveBeenCalledWith('toggle-sidebar');
  view.unmount();
  expect(stop).toHaveBeenCalledOnce();
  expect(setMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ ready: false }));
});
