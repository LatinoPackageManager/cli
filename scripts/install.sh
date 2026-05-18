#!/bin/bash
# Latino Package Manager CLI Installer for Linux/macOS

set -e

INSTALL_DIR="${LATIPM_INSTALL_DIR:-$HOME/.latipm}"
BIN_DIR="${LATIPM_BIN_DIR:-$INSTALL_DIR/bin}"
RELEASE_URL="https://github.com/LatinoPackageManager/cli/releases/latest/download/latipm-cli.zip"
TMP_DIR="/tmp/latipm-install-$$"

info() { echo "[INFO] $*"; }
error() { echo "[ERROR] $*" >&2; }

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

ensure_bun_installed() {
    if ! command_exists bun; then
        info "bun no esta instalado. Instalando bun..."
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    fi
}

cleanup() {
    if [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi
}

trap cleanup EXIT

info "Iniciando instalacion de latipm CLI..."

ensure_bun_installed

mkdir -p "$TMP_DIR"
mkdir -p "$BIN_DIR"

ZIP_FILE="$TMP_DIR/latipm.zip"
info "Descargando CLI desde $RELEASE_URL..."
curl -L "$RELEASE_URL" -o "$ZIP_FILE"

info "Extrayendo archivos..."
unzip -q "$ZIP_FILE" -d "$TMP_DIR"

info "Copiando CLI a $BIN_DIR..."
cp "$TMP_DIR/cli.js" "$BIN_DIR/lpm.js"
cp "$TMP_DIR/cli.js" "$BIN_DIR/latipm.js"
cp "$TMP_DIR/cli.js" "$BIN_DIR/latinopm.js"

cat > "$BIN_DIR/lpm" << 'WRAPPER'
#!/bin/sh
bun run "$(dirname "$0")/lpm.js" "$@"
WRAPPER
chmod +x "$BIN_DIR/lpm"

cat > "$BIN_DIR/latipm" << 'WRAPPER'
#!/bin/sh
bun run "$(dirname "$0")/latipm.js" "$@"
WRAPPER
chmod +x "$BIN_DIR/latipm"

cat > "$BIN_DIR/latinopm" << 'WRAPPER'
#!/bin/sh
bun run "$(dirname "$0")/latinopm.js" "$@"
WRAPPER
chmod +x "$BIN_DIR/latinopm"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    info "Agregando $BIN_DIR al PATH..."
    echo "" >> "$HOME/.bashrc"
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$HOME/.bashrc"
    if [ -f "$HOME/.zshrc" ]; then
        echo "" >> "$HOME/.zshrc"
        echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$HOME/.zshrc"
    fi
    info "Reinicia tu terminal o ejecuta 'source ~/.bashrc' para aplicar los cambios."
fi

info "Instalacion completada!"
info "Ejecuta 'lpm --help' para ver los comandos disponibles."
