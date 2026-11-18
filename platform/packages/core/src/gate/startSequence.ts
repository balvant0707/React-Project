// The order of an app's start-up, apart from React so it can be tested in Node (startSequence.test.mjs): the preparation first,
// a failure of it never stops the start; then the app is loaded, a failure of that is shown, never left as an empty page.
export type StartSequence<App> = {
  prepare?: () => Promise<void>;
  loadApp: () => Promise<App>;
  onLoaded: (app: App) => void;
  onFailed: (error: unknown) => void;
  log?: (message: string, error: unknown) => void;
};

export const runStart = async <App,>({ prepare, loadApp, onLoaded, onFailed, log = () => undefined }: StartSequence<App>): Promise<void> => {
  // Work before the first render is a convenience (a device cache): if it fails the app starts without it.
  try {
    await prepare?.();
  } catch (error) {
    log("start-up preparation failed, starting without it", error);
  }
  let app: App;
  try {
    app = await loadApp();
  } catch (error) {
    log("the app could not be loaded", error);
    return onFailed(error);
  }
  onLoaded(app);
};
