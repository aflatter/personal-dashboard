{ pkgs, ... }:

{
  # System dependencies for the personal dashboard.
  # Node.js is managed here (a modern nixpkgs release), so Vite+'s own
  # runtime/package-manager management ("env" feature) is turned off via
  # `vp env off` — see README.md.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm.enable = true;
  };

  enterShell = ''
    echo "personal-dashboard · node $(node --version)"
  '';
}
