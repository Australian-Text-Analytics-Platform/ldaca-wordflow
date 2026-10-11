/** Portal credentials belong to the Loader window, never to host preferences. */
export function PortalSettings() {
  return (
    <section className="max-w-prose space-y-3">
      <h2 className="text-heading-3 font-semibold">Portal access</h2>
      <p>
        Enter an access token inline in Data Loader’s LDaCA source to browse restricted collections.
      </p>
      <p>
        The token stays in this window’s memory until it closes. Public collections work without a
        token.
      </p>
    </section>
  );
}
