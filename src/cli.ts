#!/usr/bin/env bun
// Latino Package Manager CLI.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import semver from "semver";
import ignore from "ignore";
import fs from "node:fs";
import { execSync } from "node:child_process";

const HOME = process.env.HOME || process.env.USERPROFILE || ".";
const CONFIG_DIR = path.join(HOME, ".latipm");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const MANIFEST = "latino.pkg.json";
const LOCKFILE = "latino.lock.json";
const MODULES_DIR = "latino_modules";
const CACHE_DIR = ".latipm-cache";
const DEFAULT_REGISTRY = "https://registry-lpm.mdcdev.me";

const PACKAGE_JSON = JSON.parse(
    fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
);
const CLI_VERSION = PACKAGE_JSON.version;

type Manifest = {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    registry?: string;
    [key: string]: unknown;
};

type Config = {
    registry: string;
    token: string;
};

type PackageVersion = {
    version: string;
    dist: {
        tarball: string;
        shasum: string;
    };
    manifest?: Manifest;
};

type PackageInfo = {
    name: string;
    versions: PackageVersion[];
};

type ResolvedPackage = {
    name: string;
    version: string;
    requested: string[];
    dependencies: Record<string, string>;
    dependents: string[];
    dist: PackageVersion["dist"];
};

type Lockfile = {
    lockfileVersion: 1;
    registry: string;
    root: {
        name: string;
        version: string;
        dependencies: Record<string, string>;
    };
    packages: Record<string, ResolvedPackage>;
};

async function loadConfig(): Promise<Config> {
    if (!existsSync(CONFIG_PATH)) {
        await mkdir(CONFIG_DIR, { recursive: true });
        await writeFile(CONFIG_PATH, JSON.stringify({ registry: DEFAULT_REGISTRY, token: "" }, null, 2));
    }
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

async function saveConfig(cfg: Config) {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

async function loadManifest(cwd = process.cwd()): Promise<Manifest> {
    const manifestPath = path.join(cwd, MANIFEST);
    const raw = await readFile(manifestPath, "utf8").catch(() => null);
    if (!raw) throw new Error(`No se encontro ${MANIFEST}. Ejecuta 'lpm init' primero.`);
    return JSON.parse(raw);
}

async function saveManifest(mf: Manifest) {
    await writeFile(MANIFEST, JSON.stringify(mf, null, 2));
}

async function loadLock(): Promise<Lockfile | null> {
    const raw = await readFile(LOCKFILE, "utf8").catch(() => null);
    return raw ? JSON.parse(raw) : null;
}

async function saveLock(lock: Lockfile) {
    await writeFile(LOCKFILE, JSON.stringify(lock, null, 2));
}

function normalizeRegistry(url: string) {
    return url.replace(/\/$/, "").replace(/^=/, "");
}

function normalizeDependencies(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const deps: Record<string, string> = {};
    for (const [name, range] of Object.entries(value as Record<string, unknown>)) {
        deps[name] = typeof range === "string" && range.trim() ? range.trim() : "*";
    }
    return deps;
}

function parseSpec(spec: string): { name: string; range: string } {
    if (!spec) throw new Error("Falta el paquete. Ejemplo: lpm i red@1.0.0");
    const at = spec.lastIndexOf("@");
    if (at > 0) {
        return { name: spec.slice(0, at), range: spec.slice(at + 1) || "*" };
    }
    return { name: spec, range: "*" };
}

async function http<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(url, opts);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
    }
    return res.json() as Promise<T>;
}

async function download(url: string, outPath: string, expectedSha?: string) {
    const cleanUrl = url.replace(/^=/, "");
    console.log(`Descargando ${cleanUrl}...`);
    const res = await fetch(cleanUrl);
    if (!res.ok) throw new Error(`Descarga fallo: ${res.status} ${res.statusText}`);
    await mkdir(path.dirname(outPath), { recursive: true });
    const buffer = Buffer.from(await res.arrayBuffer());
    const realSha = crypto.createHash("sha256").update(buffer).digest("hex");
    if (expectedSha && realSha !== expectedSha) {
        throw new Error(`Checksum invalido para ${path.basename(outPath)}. Esperado ${expectedSha}, recibido ${realSha}`);
    }
    await fs.promises.writeFile(outPath, buffer);
}

function unzip(zipPath: string, destDir: string) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
}

async function untar(tarPath: string, destDir: string) {
    await mkdir(destDir, { recursive: true });
    execSync(`tar -xzf "${tarPath}" -C "${destDir}"`);
}

async function createTarball(entryDir: string, files: string[], outPath: string) {
    await mkdir(path.dirname(outPath), { recursive: true });
    const args = ["-czf", outPath, "-C", entryDir];
    for (const file of files) {
        args.push(file);
    }
    execSync(`tar ${args.join(" ")}`);
}

async function getIgnoreFilter(entryDir: string) {
    const ig = ignore();
    const gitignorePath = path.join(entryDir, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
        ig.add((await fs.promises.readFile(gitignorePath, "utf8")).split(/\r?\n/));
    }
    ig.add([CACHE_DIR, MODULES_DIR, LOCKFILE, "node_modules", ".git"]);
    return ig;
}

async function getFilesToZip(entryDir: string, ig: ReturnType<typeof ignore>) {
    const files: string[] = [];
    async function walk(dir: string) {
        for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(entryDir, fullPath).replace(/\\/g, "/");
            if (ig.ignores(relPath)) continue;
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else {
                files.push(relPath);
            }
        }
    }
    await walk(entryDir);
    return files;
}

async function getPackageInfo(registry: string, name: string) {
    return http<PackageInfo>(`${registry}/v1/packages/${encodeURIComponent(name)}`);
}

async function getPackageVersion(registry: string, name: string, version: string) {
    return http<PackageVersion & { name: string }>(
        `${registry}/v1/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    );
}

async function resolveVersion(registry: string, name: string, ranges: string[]) {
    const info = await getPackageInfo(registry, name);
    const versions = info.versions.map((v) => v.version).filter((v) => semver.valid(v));
    if (versions.length === 0) throw new Error(`No hay versiones publicadas para ${name}`);

    const wanted = ranges.filter((range) => range && range !== "*");
    const candidates =
        wanted.length === 0
            ? versions
            : versions.filter((version) => wanted.every((range) => semver.satisfies(version, range)));
    const match = candidates.sort(semver.rcompare)[0];
    if (!match) throw new Error(`Conflicto de versiones en ${name}: ${ranges.join(", ")}`);

    const selected = await getPackageVersion(registry, name, match);
    return {
        version: selected.version,
        dist: selected.dist,
        manifest: selected.manifest ?? ({ name, version: selected.version, dependencies: {} } satisfies Manifest),
    };
}

async function solveDependencies(registry: string, rootDeps: Record<string, string>) {
    let previousSignature = "";
    let finalPackages: Record<string, ResolvedPackage> = {};

    for (let pass = 0; pass < 10; pass++) {
        const constraints = new Map<string, Set<string>>();
        const dependents = new Map<string, Set<string>>();
        const queue = Object.entries(rootDeps).map(([name, range]) => ({ name, range, dependent: "<root>" }));
        const resolved = new Map<string, ResolvedPackage>();

        while (queue.length > 0) {
            const item = queue.shift()!;
            if (!constraints.has(item.name)) constraints.set(item.name, new Set());
            constraints.get(item.name)!.add(item.range || "*");
            if (!dependents.has(item.name)) dependents.set(item.name, new Set());
            dependents.get(item.name)!.add(item.dependent);

            const ranges = [...constraints.get(item.name)!];
            const selected = await resolveVersion(registry, item.name, ranges);
            const dependencies = normalizeDependencies(selected.manifest.dependencies);
            const current = resolved.get(item.name);

            if (!current || current.version !== selected.version) {
                resolved.set(item.name, {
                    name: item.name,
                    version: selected.version,
                    requested: ranges,
                    dependencies,
                    dependents: [...dependents.get(item.name)!].sort(),
                    dist: selected.dist,
                });
                for (const [depName, depRange] of Object.entries(dependencies)) {
                    queue.push({ name: depName, range: depRange, dependent: item.name });
                }
            } else {
                current.requested = ranges;
                current.dependents = [...dependents.get(item.name)!].sort();
            }
        }

        finalPackages = Object.fromEntries([...resolved.entries()].sort(([a], [b]) => a.localeCompare(b)));
        const signature = JSON.stringify(
            Object.fromEntries(Object.entries(finalPackages).map(([name, pkg]) => [name, pkg.version])),
        );
        if (signature === previousSignature) return finalPackages;
        previousSignature = signature;
    }

    return finalPackages;
}

async function installPackage(pkg: ResolvedPackage) {
    const dest = path.join(MODULES_DIR, pkg.name);
    await rm(dest, { recursive: true, force: true });
    const isTarball = pkg.dist.tarball.endsWith(".tar.gz") || pkg.dist.tarball.endsWith(".tgz");
    const ext = isTarball ? ".tar.gz" : ".zip";
    const tmpFile = path.join(CACHE_DIR, `${pkg.name}-${pkg.version}${ext}`);
    await download(pkg.dist.tarball, tmpFile, pkg.dist.shasum);
    await mkdir(dest, { recursive: true });
    if (isTarball) {
        await untar(tmpFile, dest);
    } else {
        unzip(tmpFile, dest);
    }
    console.log(`OK ${pkg.name}@${pkg.version} instalado en ${dest}`);
}

async function cmdInit(name?: string, version = "0.1.0") {
    if (existsSync(MANIFEST)) throw new Error(`${MANIFEST} ya existe`);
    const manifest: Manifest = {
        name: name || path.basename(process.cwd()),
        version,
        dependencies: {},
        registry: (await loadConfig()).registry,
    };
    await saveManifest(manifest);
    await mkdir(MODULES_DIR, { recursive: true });
    console.log(`OK creado ${MANIFEST} y ${MODULES_DIR}/`);
}

async function cmdSetRegistry(url: string) {
    if (!url) throw new Error("Uso: lpm set-registry <url>");
    const cfg = await loadConfig();
    cfg.registry = normalizeRegistry(url);
    await saveConfig(cfg);
    console.log(`OK registry = ${cfg.registry}`);
}

async function cmdLogin(email: string, password: string) {
    if (!email || !password) throw new Error("Uso: lpm login <email> <password>");
    const cfg = await loadConfig();
    const data = await http<{ token: string }>(`${cfg.registry}/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    cfg.token = data.token;
    await saveConfig(cfg);
    console.log("OK sesion iniciada");
}

async function cmdLogout() {
    const cfg = await loadConfig();
    cfg.token = "";
    await saveConfig(cfg);
    console.log("OK sesion cerrada");
}

async function cmdWhoami() {
    const cfg = await loadConfig();
    if (!cfg.token) return console.log("(no autenticado)");
    console.log(await http(`${cfg.registry}/v1/auth/me`, { headers: { authorization: `Bearer ${cfg.token}` } }));
}

async function cmdAdd(spec: string, registryOverride?: string) {
    const cfg = await loadConfig();
    const { name, range } = parseSpec(spec);
    const mf = await loadManifest();
    mf.dependencies = normalizeDependencies(mf.dependencies);
    mf.registry ||= cfg.registry;
    mf.dependencies[name] = range;
    await saveManifest(mf);
    console.log(`OK dependencia ${name}@${range}`);
    await cmdInstall(registryOverride);
}

async function cmdInstall(arg?: string, registryOverride?: string) {
    const cfg = await loadConfig();
    const mf = await loadManifest();
    
    if (arg && arg !== mf.registry) {
        const { name, range } = parseSpec(arg);
        mf.dependencies = normalizeDependencies(mf.dependencies);
        mf.registry ||= cfg.registry;
        mf.dependencies[name] = range;
        await saveManifest(mf);
        console.log(`OK dependencia ${name}@${range}`);
    }
    
    const registry = normalizeRegistry(registryOverride || mf.registry || cfg.registry);
    const rootDeps = normalizeDependencies(mf.dependencies);

    await mkdir(MODULES_DIR, { recursive: true });
    const packages = await solveDependencies(registry, rootDeps);
    for (const pkg of Object.values(packages)) {
        await installPackage(pkg);
    }

    await saveLock({
        lockfileVersion: 1,
        registry,
        root: {
            name: mf.name,
            version: mf.version,
            dependencies: rootDeps,
        },
        packages,
    });
    console.log(`OK ${Object.keys(packages).length} paquetes instalados`);
}

async function cmdPublish(entryDir = ".") {
    const cfg = await loadConfig();
    if (!cfg.token) throw new Error("No autenticado. Ejecuta 'lpm login'.");

    const pkgPath = path.join(entryDir, MANIFEST);
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Manifest;
    if (!pkg.name || !pkg.version) throw new Error(`${MANIFEST} requiere name y version`);
    pkg.dependencies = normalizeDependencies(pkg.dependencies);

    const tarName = `${pkg.name}-${pkg.version}.tar.gz`;
    const tarPath = path.join(CACHE_DIR, tarName);
    await mkdir(path.dirname(tarPath), { recursive: true });

    const ig = await getIgnoreFilter(entryDir);
    const files = await getFilesToZip(entryDir, ig);
    await createTarball(entryDir, files, tarPath);

    const buf = await readFile(tarPath);
    const shasum = crypto.createHash("sha256").update(buf).digest("hex");
    const form = new FormData();
    form.append("meta", JSON.stringify(pkg));
    form.append("file", new File([buf], tarName, { type: "application/gzip" }));
    form.append("sha256", shasum);
    form.append("format", "tarball");

    const res = await fetch(`${cfg.registry}/v1/packages/${pkg.name}/${pkg.version}`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.token}` },
        body: form,
    });
    if (!res.ok) throw new Error(`Publish fallo: ${res.status} ${await res.text()}`);
    console.log(`OK publicado ${pkg.name}@${pkg.version}`);
}

async function cmdUpdate(name?: string) {
    const mf = await loadManifest();
    if (name && !normalizeDependencies(mf.dependencies)[name]) throw new Error(`${name} no esta en ${MANIFEST}`);
    await cmdInstall();
}

function printTreeNode(lock: Lockfile, name: string, prefix = "", seen = new Set<string>()) {
    const pkg = lock.packages[name];
    if (!pkg) return;
    const repeated = seen.has(name);
    console.log(`${prefix}${name}@${pkg.version}${repeated ? " (ciclo)" : ""}`);
    if (repeated) return;
    seen.add(name);
    for (const depName of Object.keys(pkg.dependencies).sort()) {
        printTreeNode(lock, depName, `${prefix}  `, new Set(seen));
    }
}

async function cmdTree() {
    const lock = await loadLock();
    if (!lock) throw new Error(`No existe ${LOCKFILE}. Ejecuta 'lpm install'.`);
    console.log(`${lock.root.name}@${lock.root.version}`);
    for (const name of Object.keys(lock.root.dependencies).sort()) {
        printTreeNode(lock, name, "  ");
    }
}

async function cmdWhy(name: string) {
    if (!name) throw new Error("Uso: lpm why <package>");
    const lock = await loadLock();
    if (!lock) throw new Error(`No existe ${LOCKFILE}. Ejecuta 'lpm install'.`);
    const pkg = lock.packages[name];
    if (!pkg) throw new Error(`${name} no esta instalado`);
    console.log(`${name}@${pkg.version}`);
    console.log(`requerido por: ${pkg.dependents.join(", ")}`);
    console.log(`dependencias: ${Object.keys(pkg.dependencies).join(", ") || "(ninguna)"}`);
}

function cmdVersion() {
    console.log(`lpm v${CLI_VERSION}`);
}

async function cmdSelfUpdate() {
    console.log("Buscando actualizaciones...");
    try {
        const res = await fetch("https://registry.npmjs.org/latipm-cli/latest");
        if (!res.ok) throw new Error("No se pudo verificar la versión más reciente");
        const data = await res.json();
        const latestVersion = data.version;
        
        if (semver.eq(latestVersion, CLI_VERSION)) {
            console.log(`Ya tienes la última versión: v${CLI_VERSION}`);
            return;
        }
        
        console.log(`Nueva versión disponible: v${latestVersion} (tienes v${CLI_VERSION})`);
        console.log("Actualizando...");
        
        const isNpmGlobal = existsSync(path.join(process.execPath, "..", "node_modules", "latipm-cli"));
        
        if (isNpmGlobal) {
            execSync("npm install -g latipm-cli", { stdio: "inherit" });
        } else {
            execSync("bun add -g latipm-cli", { stdio: "inherit" });
        }
        
        console.log(`¡Actualizado a v${latestVersion}!`);
    } catch (e: any) {
        throw new Error(`Fallo la actualización: ${e.message}`);
    }
}

function printHelp(cmd?: string) {
    if (cmd) {
        switch (cmd) {
            case "init":
                console.log(`lpm init [name] [version]
  Crea un nuevo proyecto Latino

  Argumentos:
    name     Nombre del paquete (opcional, usa el nombre del directorio)
    version  Versión inicial (default: 0.1.0)`);
                break;
            case "set-registry":
                console.log(`lpm set-registry <url>
  Configura el registry a usar

  Argumentos:
    url  URL del registry (ej: https://registry-lpm.mdcdev.me)`);
                break;
            case "login":
                console.log(`lpm login <email> <password>
  Inicia sesión en el registry

  Argumentos:
    email     Tu correo electrónico
    password  Tu contraseña`);
                break;
            case "logout":
                console.log(`lpm logout
  Cierra la sesión actual`);
                break;
            case "whoami":
                console.log(`lpm whoami
  Muestra el usuario autenticado actualmente`);
                break;
            case "i":
            case "add":
                console.log(`lpm add <package[@version]>
  Agrega una dependencia al proyecto

  Argumentos:
    package  Nombre del paquete (ej: red@1.0.0 o red)`);
                break;
            case "install":
                console.log(`lpm install [package[@version]] [registry]
  Instala las dependencias del proyecto

  Argumentos:
    package  Paquete específico a instalar (opcional)
    registry URL del registry (opcional)`);
                break;
            case "publish":
                console.log(`lpm publish [directory]
  Publica un paquete en el registry

  Argumentos:
    directory  Directorio del paquete (default: .)`);
                break;
            case "update":
                console.log(`lpm update [package]
  Actualiza las dependencias del proyecto

  Argumentos:
    package  Nombre del paquete a actualizar (opcional)`);
                break;
            case "tree":
                console.log(`lpm tree
  Muestra el árbol de dependencias instaladas`);
                break;
            case "why":
                console.log(`lpm why <package>
  Explica por qué un paquete está instalado

  Argumentos:
    package  Nombre del paquete`);
                break;
            case "help":
                console.log(`lpm help [command]
  Muestra ayuda sobre los comandos

  Argumentos:
    command  Nombre del comando (opcional, muestra ayuda general si no se proporciona)`);
                break;
            case "version":
                console.log(`lpm version
  Muestra la versión del CLI`);
                break;
            case "self-update":
                console.log(`lpm self-update
  Actualiza el CLI a la última versión disponible`);
                break;
            default:
                console.log(`Comando '${cmd}' no encontrado`);
        }
        return;
    }

    console.log(`Latino Package Manager (lpm) v${CLI_VERSION}

Uso: lpm <comando> [argumentos]

Comandos:
  init [name] [version]       Crea un nuevo proyecto
  set-registry <url>          Configura el registry
  login <email> <password>    Inicia sesión
  logout                      Cierra sesión
  whoami                      Muestra usuario actual
  i <package>                 Alias de add
  add <package[@version]>     Agrega dependencia
  install [package] [reg]     Instala dependencias
  publish [dir]               Publica paquete
  update [package]            Actualiza dependencias
  tree                        Muestra árbol de dependencias
  why <package>               Explica por qué está instalado un paquete
  help [command]              Muestra ayuda
  version                     Muestra versión del CLI
  self-update                 Actualiza el CLI

Ejecuta 'lpm help <comando>' para más información sobre un comando específico.`);
}

const [, , cmd, ...rest] = process.argv;

const validCommands = [
    "init", "set-registry", "login", "logout", "whoami",
    "i", "add", "install", "publish", "update", "tree", "why",
    "help", "version", "self-update",
    "h", "-h", "--help", "-v", "--version"
];

(async () => {
    try {
        if (!cmd || !validCommands.includes(cmd)) {
            printHelp();
            return;
        }

        switch (cmd) {
            case "init":
                await cmdInit(rest[0], rest[1]);
                break;
            case "set-registry":
                await cmdSetRegistry(rest[0] || "");
                break;
            case "login":
                await cmdLogin(rest[0]!, rest[1]!);
                break;
            case "logout":
                await cmdLogout();
                break;
            case "whoami":
                await cmdWhoami();
                break;
            case "i":
            case "add":
                await cmdAdd(rest[0]!, rest[1]);
                break;
            case "install":
                await cmdInstall(rest[0], rest[1]);
                break;
            case "publish":
                await cmdPublish(rest[0]);
                break;
            case "update":
                await cmdUpdate(rest[0]);
                break;
            case "tree":
                await cmdTree();
                break;
            case "why":
                await cmdWhy(rest[0]!);
                break;
            case "help":
            case "h":
            case "-h":
            case "--help":
                printHelp(rest[0]);
                break;
            case "version":
            case "-v":
            case "--version":
                cmdVersion();
                break;
            case "self-update":
                await cmdSelfUpdate();
                break;
        }
    } catch (e: any) {
        console.error("ERROR", e.message);
        process.exit(1);
    }
})();
