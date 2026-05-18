# Latino Package Manager (CLI)

[![npm version](https://img.shields.io/npm/v/latipm-cli.svg)](https://www.npmjs.com/package/latipm-cli)
[![npm downloads](https://img.shields.io/npm/dm/latipm-cli.svg)](https://www.npmjs.com/package/latipm-cli)

Gestor de paquetes para el ecosistema Latino. Instala, publica y gestiona paquetes de manera sencilla.

## Instalación

### npm

```bash
npm install -g latipm-cli
```

### Bun

```bash
bun add -g latipm-cli
```

### Scripts de instalación

**Windows (PowerShell):**
```powershell
npm run install:win
# o
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

**Linux/macOS:**
```bash
npm run install:unix
# o
bash scripts/install.sh
```

## Verificación

Después de instalar, verifica que funcione correctamente:

```bash
lpm --version
# o
latipm --version
# o
latinopm --version
```

## Comandos Disponibles

### `lpm init [name] [version]`

Crea un nuevo proyecto Latino con el archivo `latino.pkg.json`.

```bash
lpm init mi-proyecto 1.0.0
lpm init  # Usa el nombre del directorio actual
```

### `lpm set-registry <url>`

Configura el registry a usar para las operaciones de paquetes.

```bash
lpm set-registry https://registry-lpm.mdcdev.me
```

### `lpm login <email> <password>`

Inicia sesión en el registry para poder publicar paquetes.

```bash
lpm login usuario@ejemplo.com miPassword
```

### `lpm logout`

Cierra la sesión actual del registry.

```bash
lpm logout
```

### `lpm whoami`

Muestra el usuario autenticado actualmente.

```bash
lpm whoami
```

### `lpm add <package[@version]>` (alias: `lpm i`)

Agrega una dependencia al proyecto y la instala.

```bash
lpm add red@1.0.0
lpm add red  # Instala la última versión
lpm i blue   # Alias corto
```

### `lpm install [package[@version]] [registry]`

Instala las dependencias del proyecto. Opcionalmente puede instalar un paquete específico.

```bash
lpm install                    # Instala todas las dependencias
lpm install red@1.0.0          # Instala un paquete específico
lpm install red https://other-registry.com
```

### `lpm publish [directory]`

Publica un paquete en el registry.

```bash
lpm publish           # Publica el proyecto actual
lpm publish ./mi-pkg  # Publica desde otro directorio
```

### `lpm update [package]`

Actualiza las dependencias del proyecto.

```bash
lpm update           # Actualiza todas las dependencias
lpm update red       # Actualiza un paquete específico
```

### `lpm tree`

Muestra el árbol de dependencias instaladas.

```bash
lpm tree
```

### `lpm why <package>`

Explica por qué un paquete está instalado (qué dependencias lo requieren).

```bash
lpm why red
```

### `lpm help [command]`

Muestra información de ayuda sobre los comandos.

```bash
lpm help              # Ayuda general
lpm help add          # Ayuda específica de un comando
lpm help install
```

### `lpm version`

Muestra la versión actual del CLI.

```bash
lpm version
lpm -v
lpm --version
```

### `lpm self-update`

Actualiza el CLI a la última versión disponible en npm.

```bash
lpm self-update
```

## Comandos Alias

El CLI está disponible bajo tres comandos diferentes:

- `lpm` - Comando principal (recomendado)
- `latipm` - Nombre completo
- `latinopm` - Nombre alternativo

Todos funcionan de manera idéntica:

```bash
lpm --version
latipm --version
latinopm --version
```

## Archivos del Proyecto

| Archivo | Descripción |
|---------|-------------|
| `latino.pkg.json` | Manifiesto del proyecto (dependencias, versión, etc.) |
| `latino.lock.json` | Lockfile que asegura instalaciones consistentes |
| `latino_modules/` | Directorio donde se instalan los paquetes |
| `.latipm-cache/` | Caché de descargas temporales |

## Ejemplo de Uso

### Crear un nuevo proyecto

```bash
mkdir mi-proyecto
cd mi-proyecto
lpm init mi-proyecto 1.0.0
```

### Agregar dependencias

```bash
lpm add red@1.0.0
lpm add blue@2.0.0
```

### Instalar dependencias

```bash
lpm install
```

### Publicar un paquete

```bash
# Iniciar sesión
lpm login usuario@ejemplo.com password123

# Publicar
lpm publish
```

## Configuración

La configuración se guarda en `~/.latipm/config.json` e incluye:

- `registry`: URL del registry a usar
- `token`: Token de autenticación (después de hacer login)

## Requisitos

- [Bun](https://bun.sh) runtime (para ejecutar el CLI)
- npm o Bun para la instalación global

## Desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/LatinoPackageManager/cli.git
cd cli

# Instalar dependencias
bun install

# Ejecutar en modo desarrollo
bun run dev

# Ejecutar comandos directamente
bun run src/cli.ts --help
```

## Licencia

MIT

## Enlaces

- [Repositorio GitHub](https://github.com/LatinoPackageManager/cli)
- [npm Package](https://www.npmjs.com/package/latipm-cli)
- [Reportar Issues](https://github.com/LatinoPackageManager/cli/issues)
