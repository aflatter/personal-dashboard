{ pkgs, config, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs-slim_26;
    pnpm.enable = true;
  };

  packages = [ pkgs.secretspec ];

  enterShell = ''
    echo "personal-dashboard · node $(node --version) · pnpm $(pnpm --version)"
  '';

  # The collector loads its own secrets in-process (secretspec SDK). Ports are
  # allocated from a base (a free port is found upward from it) so parallel git
  # worktrees don't collide. The dashboard waits for the collector's readiness
  # probe before starting; running just the dashboard task
  # (`devenv tasks run devenv:processes:dashboard`) pulls the collector in via
  # that dependency. Set MONEYMONEY=1 to enable the opt-in MoneyMoney source.
  processes.collector = {
    exec = "COLLECTOR_PORT=${toString config.processes.collector.ports.http.value} node packages/collector/src/main.ts";
    ports.http.allocate = 4319;
    ready = {
      http.get = {
        port = config.processes.collector.ports.http.value;
        path = "/health";
      };
      initial_delay = 2;
      period = 2;
      failure_threshold = 60; # allow for the 1Password prompt on first boot
    };
  };

  processes.dashboard = {
    exec = ''
      COLLECTOR_URL="http://127.0.0.1:${toString config.processes.collector.ports.http.value}" \
      PORT="''${PORT:-${toString config.processes.dashboard.ports.http.value}}" \
      pnpm --filter @dash/dashboard dev
    '';
    ports.http.allocate = 5173;
    after = [ "devenv:processes:collector@ready" ];
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
