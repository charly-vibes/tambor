# devenv.sh — single source of truth for tambor's toolchain (spike for DDL-irv).
# Verify: devenv shell -- npm test
{ pkgs, ... }: {
  packages = with pkgs; [
    lefthook # git hooks (lefthook.yml)
    git
  ];

  languages.javascript = {
    enable = true;
    npm.enable = true;
  };

  enterShell = ''
    if [ ! -d node_modules ]; then
      echo "devenv: node_modules missing — run 'npm ci'"
    fi
  '';
}
