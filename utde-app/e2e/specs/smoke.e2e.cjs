// Smoke test: prove the bundled SPA renders inside the native webview.
//
// This is the runtime signal CI can't otherwise give (that the desktop shell
// loads the real frontend under WebKitGTK/WebView2). Kept deliberately minimal
// so it's robust; the natural next step — trigger an engine action and assert
// the Pyodide runtime reaches "ready" — is noted in ./README.md and should be
// added once selectors are confirmed on a first green run.

describe("UTDE desktop shell", () => {
  it("renders the app UI in the native webview", async () => {
    await browser.waitUntil(
      async () => {
        const text = await $("body").getText();
        return text && text.trim().length > 0;
      },
      { timeout: 60000, timeoutMsg: "app UI did not render in the webview" }
    );

    // The persistent tab bar is present once the shell is up.
    const body = await $("body").getText();
    expect(body).toMatch(/Setup|Simulate|Post/);
  });
});
