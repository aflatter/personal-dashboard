{ pkgs, config, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs-slim_26;
    pnpm.enable = true;
  };

  packages = [
    pkgs.secretspec
    pkgs.just # deploy workflow (justfile)
    pkgs.kubectl # applying manifests / rollouts
  ];

  enterShell = ''
    echo "personal-dashboard · node $(node --version) · pnpm $(pnpm --version)"
  '';

  # The backend loads its own secrets in-process (secretspec SDK). Ports are
  # allocated from a base (a free port is found upward from it) so parallel git
  # worktrees don't collide. The dashboard waits for the backend's readiness
  # probe before starting; running just the dashboard task
  # (`devenv tasks run devenv:processes:dashboard`) pulls the backend in via
  # that dependency. MoneyMoney is not polled here — it syncs on-demand via the
  # bank card's ↺ button (the backend's `syncBank` mutation).
  processes.backend = {
    exec = "SECRETSPEC_PROFILE=backend COLLECTOR_PORT=${toString config.processes.backend.ports.http.value} node packages/backend/src/main.ts";
    ports.http.allocate = 4319;
    ready = {
      http.get = {
        port = config.processes.backend.ports.http.value;
        path = "/health";
      };
      initial_delay = 2;
      period = 2;
      failure_threshold = 60; # allow for the 1Password prompt on first boot
    };
  };

  processes.dashboard = {
    exec = ''
      COLLECTOR_URL="http://127.0.0.1:${toString config.processes.backend.ports.http.value}" \
      PORT="''${PORT:-${toString config.processes.dashboard.ports.http.value}}" \
      pnpm --filter @dash/dashboard dev
    '';
    ports.http.allocate = 5173;
    after = [ "devenv:processes:backend@ready" ];
    ready = {
      http.get = {
        port = config.processes.dashboard.ports.http.value;
        path = "/";
      };
      initial_delay = 2;
      period = 2;
    };
  };
}
