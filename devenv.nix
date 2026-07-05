{ pkgs, ... }:

{
  # System dependencies for the personal dashboard.
  # Node.js is managed here (a modern nixpkgs release), so Vite+'s own
  # runtime/package-manager management ("env" feature) is turned off via
  # `vp env off` — see README.md.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs-slim_26;
    pnpm.enable = true;
  };

  enterShell = ''
    echo "personal-dashboard · node $(node --version) · pnpm $(pnpm --version)"
  '';

  # `devenv up` runs the collector service and the dashboard dev server together.
  # Stage 3 wraps the collector in `secretspec run -- …` to inject 1Password secrets.
  processes = {
    collector.exec = "node packages/collector/src/main.ts";
    dashboard.exec = "pnpm --filter @dash/dashboard dev";
  };
}
