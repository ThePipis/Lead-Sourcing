#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===============================================================================
  LEAD-SOURCING CONTROL CENTER & SERVER MANAGER (UNIFIED TYPESCRIPT STACK)
===============================================================================
Controlador de desarrollo para iniciar, detener, reiniciar, monitorear y
desplegar el sistema unificado de Lead-Sourcing:
- Frontend: Vite (React 19 + HMR) en puerto 3001
- Backend: Cloudflare Worker en TypeScript (Wrangler Dev + D1 Local) en puerto 8787
- Producción: Cloudflare Edge (directmail.aisalesradar.com)
"""

import os
import sys
import json
import time
import socket
import shutil
import urllib.request
import webbrowser
import subprocess
from pathlib import Path

# Habilitar soporte de secuencias de escape ANSI en la consola de Windows
os.system("")

# Configuración de rutas del proyecto
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
LOGS_DIR = PROJECT_ROOT / "logs"
PID_FILE = PROJECT_ROOT / ".server_pids.json"
D1_LOCAL_DIR = PROJECT_ROOT / ".wrangler" / "state" / "v3" / "d1"

# Flag de proceso silencioso exclusivo para Windows (evita ventanas emergentes)
CREATE_NO_WINDOW = 0x08000000

def get_silent_startupinfo():
    """Configura STARTUPINFO con SW_HIDE para garantizar cero ventanas emergentes."""
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 0  # SW_HIDE
    return si

# Estilos y colores ANSI
CLR_RESET   = "\033[0m"
CLR_BOLD    = "\033[1m"
CLR_DIM     = "\033[2m"
CLR_RED     = "\033[91m"
CLR_GREEN   = "\033[92m"
CLR_YELLOW  = "\033[93m"
CLR_BLUE    = "\033[94m"
CLR_MAGENTA = "\033[95m"
CLR_CYAN    = "\033[96m"
CLR_WHITE   = "\033[97m"

FRONTEND_PORT = 3001
BACKEND_PORT  = 8787
FRONTEND_URL  = f"http://localhost:{FRONTEND_PORT}"
BACKEND_URL   = f"http://localhost:{BACKEND_PORT}"
PRODUCTION_URL = "https://directmail.aisalesradar.com"
HEALTH_URL    = f"http://localhost:{BACKEND_PORT}/api/health"


def find_node_executable() -> str:
    """Busca el ejecutable de Node.js en el sistema con soporte para nvm4w."""
    which_node = shutil.which("node.exe") or shutil.which("node")
    if which_node:
        return which_node
    candidates = [
        r"C:\nvm4w\nodejs\node.exe",
        r"C:\Program Files\nodejs\node.exe",
        os.path.expandvars(r"%ProgramFiles%\nodejs\node.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\node\node.exe")
    ]
    for cand in candidates:
        if os.path.exists(cand):
            return cand
    return "node"


def find_wrangler_executable() -> str:
    """Busca el binario de wrangler con soporte para Windows y nvm."""
    candidates = [
        PROJECT_ROOT / "node_modules" / ".bin" / "wrangler.cmd",
        PROJECT_ROOT / "node_modules" / ".bin" / "wrangler",
        Path(r"C:\nvm4w\nodejs\wrangler.cmd"),
        Path(r"C:\Program Files\nodejs\wrangler.cmd"),
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    which_w = shutil.which("wrangler.cmd") or shutil.which("wrangler")
    if which_w:
        return which_w
    return "wrangler.cmd" if os.name == "nt" else "wrangler"


def is_port_listening(port: int, host: str = "127.0.0.1", timeout: float = 0.3) -> bool:
    """Verifica de forma ultrarrápida si un puerto TCP está abierto y respondiendo."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False


def get_listening_pids(port: int) -> list[int]:
    """Obtiene la lista de PIDs escuchando en un puerto específico vía netstat."""
    pids = []
    try:
        output = subprocess.check_output(
            f"netstat -ano -p tcp | findstr :{port}",
            shell=True,
            text=True,
            stderr=subprocess.DEVNULL
        )
        for line in output.splitlines():
            line = line.strip()
            if "LISTENING" in line and f":{port}" in line:
                parts = line.split()
                if parts:
                    try:
                        pid = int(parts[-1])
                        if pid > 0 and pid not in pids:
                            pids.append(pid)
                    except ValueError:
                        continue
    except Exception:
        pass
    return pids


def get_process_cmdline(pid: int) -> str:
    """Obtiene la línea de comando del proceso de forma segura en Windows."""
    try:
        cmd = [
            "powershell", "-NoProfile", "-NonInteractive", "-Command",
            f"(Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}').CommandLine"
        ]
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL, timeout=4)
        return out.strip()
    except Exception:
        return ""


def is_project_process(pid: int, cmdline: str = "") -> bool:
    """
    Verifica de forma estricta que el PID pertenezca EXCLUSIVAMENTE a Lead-Sourcing
    para jamás afectar procesos de otros proyectos del usuario.
    """
    if not cmdline:
        cmdline = get_process_cmdline(pid)
    
    cmd_lower = cmdline.lower()
    root_lower = str(PROJECT_ROOT).lower()
    
    project_markers = [
        root_lower,
        "lead-sourcing",
        "wrangler",
        "--port 8787",
        "--port=3001",
        "vite",
        "worker/index.ts"
    ]
    
    for marker in project_markers:
        if marker in cmd_lower:
            return True
            
    return False


def load_tracked_pids() -> dict:
    """Carga los PIDs rastreados en el archivo .server_pids.json."""
    if PID_FILE.exists():
        try:
            with open(PID_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_tracked_pids(data: dict):
    """Guarda los PIDs en el archivo .server_pids.json."""
    try:
        with open(PID_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


def clear_tracked_pids():
    """Elimina el archivo de PIDs rastreados."""
    if PID_FILE.exists():
        try:
            PID_FILE.unlink()
        except Exception:
            pass


def get_server_status():
    """Devuelve el estado consolidado de los servicios (frontend y worker backend)."""
    fe_up = is_port_listening(FRONTEND_PORT)
    be_up = is_port_listening(BACKEND_PORT)
    
    if fe_up and be_up:
        badge = f"{CLR_GREEN}● RUNNING{CLR_RESET}"
        status_key = "RUNNING"
    elif not fe_up and not be_up:
        badge = f"{CLR_RED}○ STOPPED{CLR_RESET}"
        status_key = "STOPPED"
    else:
        badge = f"{CLR_YELLOW}⚠️ PARTIAL{CLR_RESET}"
        status_key = "PARTIAL"
        
    return status_key, badge, fe_up, be_up


def print_header():
    """Imprime el banner principal con el status en la esquina superior derecha."""
    os.system("cls" if os.name == "nt" else "clear")
    status_key, badge, fe_up, be_up = get_server_status()
    
    fe_badge = f"{CLR_GREEN}ONLINE  ●{CLR_RESET}" if fe_up else f"{CLR_RED}OFFLINE ○{CLR_RESET}"
    be_badge = f"{CLR_GREEN}ONLINE  ●{CLR_RESET}" if be_up else f"{CLR_RED}OFFLINE ○{CLR_RESET}"
    
    title_left = "  🚀 LEAD-SOURCING CONTROL CENTER v2.0 (UNIFIED TYPESCRIPT)"
    status_plain = f"[ STATUS: {status_key} ]"
    pad_spaces = 78 - len(title_left) - len(status_plain)
    if pad_spaces < 1:
        pad_spaces = 1
        
    top_line = f"{CLR_BOLD}{CLR_WHITE}{title_left}{' ' * pad_spaces}[ STATUS: {badge} ]{CLR_RESET}"
    
    print(f"{CLR_CYAN}==============================================================================")
    print(top_line)
    print(f"=============================================================================={CLR_RESET}")
    print(f"   🌐 {CLR_BOLD}Frontend (Vite){CLR_RESET}         : {CLR_CYAN}{FRONTEND_URL:<26}{CLR_RESET} [ {fe_badge} ]")
    print(f"   ⚡ {CLR_BOLD}Worker Local (D1){CLR_RESET}      : {CLR_CYAN}{BACKEND_URL:<26}{CLR_RESET} [ {be_badge} ]")
    print(f"   ☁️  {CLR_BOLD}Cloudflare Prod{CLR_RESET}        : {CLR_BLUE}{PRODUCTION_URL:<26}{CLR_RESET} [ {CLR_GREEN}24/7 EDGE{CLR_RESET} ]")
    print(f"   📁 {CLR_DIM}Directorio Base         : {PROJECT_ROOT}{CLR_RESET}")
    print(f"{CLR_CYAN}------------------------------------------------------------------------------{CLR_RESET}")


def print_menu():
    """Imprime las opciones del menú principal organizadas por bloques funcionales."""
    print_header()
    print(f"""
  {CLR_BOLD}💻 [BLOQUE 1] GESTIÓN DE SERVIDORES LOCALES (BACKGROUND){CLR_RESET}
  ------------------------------------------------------------------------------
   {CLR_GREEN}{CLR_BOLD}[1] ▶  INICIAR SERVIDOR LOCAL UNIFICADO{CLR_RESET} {CLR_DIM}(Vite :3001 + Worker :8787 / D1){CLR_RESET}
   {CLR_RED}{CLR_BOLD}[2] ⏹  DETENER SERVIDOR LOCAL{CLR_RESET} {CLR_DIM}(Puertos 3001 y 8787 liberados limpiamente){CLR_RESET}
   {CLR_YELLOW}{CLR_BOLD}[3] 🔄 REINICIAR SERVIDOR LOCAL{CLR_RESET} {CLR_DIM}(Stop + Start en 1 clic){CLR_RESET}

  {CLR_BOLD}🌍 [BLOQUE 2] NAVEGACIÓN RÁPIDA & DESPLIEGUE A CLOUDFLARE{CLR_RESET}
  ------------------------------------------------------------------------------
   {CLR_CYAN}[4] 🚀 Abrir Aplicación Web Local en Navegador ({FRONTEND_URL})
   [5] ☁️  Abrir Aplicación en Producción ({PRODUCTION_URL})
   {CLR_MAGENTA}{CLR_BOLD}[6] 📦 DESPLEGAR A PRODUCCIÓN (Vite Build + Wrangler Deploy en 1 clic){CLR_RESET}

  {CLR_BOLD}🩺 [BLOQUE 3] DIAGNÓSTICO & LOGS EN VIVO{CLR_RESET}
  ------------------------------------------------------------------------------
   {CLR_WHITE}[7] 🔍 Diagnóstico 360° de Puertos, D1 Local/Remoto y Dependencias
   [8] 📜 Ver Logs de Backend Worker (backend.log)
   [9] 📜 Ver Logs de Frontend Vite (frontend.log){CLR_RESET}

  ------------------------------------------------------------------------------
   {CLR_BOLD}[0] 🚪 Salir del Control Center{CLR_RESET} {CLR_DIM}(Los servidores seguirán corriendo en fondo){CLR_RESET}
{CLR_CYAN}=============================================================================={CLR_RESET}
""")


def start_server():
    """Inicia el frontend y el worker en background de forma 100% silenciosa y desacoplada."""
    print(f"\n{CLR_BOLD}{CLR_CYAN}▶ Iniciando servicios de Lead-Sourcing en segundo plano...{CLR_RESET}\n")
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    
    fe_up = is_port_listening(FRONTEND_PORT)
    be_up = is_port_listening(BACKEND_PORT)
    
    tracked = load_tracked_pids()
    backend_pid = tracked.get("backend_pid")
    frontend_pid = tracked.get("frontend_pid")
    
    # 1. Iniciar Cloudflare Worker (Backend TypeScript + D1 Local en :8787)
    if be_up:
        print(f" {CLR_GREEN}✔ Backend Worker ya está en ejecución en puerto {BACKEND_PORT}.{CLR_RESET}")
    else:
        print(f" ⚡ Levantando Cloudflare Worker Local (puerto {BACKEND_PORT})...", end="", flush=True)
        b_log = open(LOGS_DIR / "backend.log", "a", encoding="utf-8")
        b_log.write(f"\n\n--- [INICIO DE SESIÓN WORKER: {time.strftime('%Y-%m-%d %H:%M:%S')}] ---\n")
        b_log.flush()
        
        wrangler_exe = find_wrangler_executable()
        proc_be = subprocess.Popen(
            [wrangler_exe, "dev", "--port", str(BACKEND_PORT), "--ip", "127.0.0.1"],
            cwd=str(PROJECT_ROOT),
            stdin=subprocess.DEVNULL,
            stdout=b_log,
            stderr=b_log,
            creationflags=CREATE_NO_WINDOW,
            startupinfo=get_silent_startupinfo(),
            close_fds=True
        )
        backend_pid = proc_be.pid
        tracked["backend_pid"] = backend_pid
        print(f" {CLR_GREEN}[PID: {backend_pid}]{CLR_RESET}")
        
    # 2. Iniciar Frontend Vite (React 19 en :3001)
    if fe_up:
        print(f" {CLR_GREEN}✔ Frontend Vite ya está en ejecución en puerto {FRONTEND_PORT}.{CLR_RESET}")
    else:
        print(f" 🌐 Levantando Frontend Vite (puerto {FRONTEND_PORT})...", end="", flush=True)
        f_log = open(LOGS_DIR / "frontend.log", "a", encoding="utf-8")
        f_log.write(f"\n\n--- [INICIO DE SESIÓN FRONTEND: {time.strftime('%Y-%m-%d %H:%M:%S')}] ---\n")
        f_log.flush()
        
        node_exe = find_node_executable()
        vite_bin = PROJECT_ROOT / "node_modules" / "vite" / "bin" / "vite.js"
        
        proc_fe = subprocess.Popen(
            [node_exe, str(vite_bin), f"--port={FRONTEND_PORT}", "--host=0.0.0.0"],
            cwd=str(PROJECT_ROOT),
            stdin=subprocess.DEVNULL,
            stdout=f_log,
            stderr=f_log,
            creationflags=CREATE_NO_WINDOW,
            startupinfo=get_silent_startupinfo(),
            close_fds=True
        )
        frontend_pid = proc_fe.pid
        tracked["frontend_pid"] = frontend_pid
        print(f" {CLR_GREEN}[PID: {frontend_pid}]{CLR_RESET}")

    save_tracked_pids(tracked)
    
    # 3. Esperar confirmación de puertos abiertos
    print(f"\n ⏳ Verificando disponibilidad de red...", end="", flush=True)
    max_wait = 18
    start_time = time.time()
    ready = False
    
    while time.time() - start_time < max_wait:
        be_ready = is_port_listening(BACKEND_PORT)
        fe_ready = is_port_listening(FRONTEND_PORT)
        if be_ready and fe_ready:
            ready = True
            break
        print(".", end="", flush=True)
        time.sleep(0.6)
        
    print()
    if ready:
        print(f"\n{CLR_GREEN}{CLR_BOLD}✨ ¡Servidor local unificado iniciado con éxito!{CLR_RESET}")
        print(f"   • Frontend Web        : {CLR_CYAN}{FRONTEND_URL}{CLR_RESET}")
        print(f"   • Worker API Local    : {CLR_CYAN}{BACKEND_URL}{CLR_RESET}")
        print(f"   • Base de Datos       : {CLR_CYAN}Cloudflare D1 Local (Miniflare){CLR_RESET}")
    else:
        be_ready = is_port_listening(BACKEND_PORT)
        fe_ready = is_port_listening(FRONTEND_PORT)
        print(f"\n{CLR_YELLOW}⚠️ Aviso de inicio parcial tras {max_wait}s:{CLR_RESET}")
        print(f"   • Worker (:8787)   : {'ONLINE' if be_ready else 'Aún arrancando o con error'}")
        print(f"   • Frontend (:3001) : {'ONLINE' if fe_ready else 'Aún arrancando o con error'}")
        print(f"   {CLR_DIM}Revisa la opción [8] o [9] del menú para ver los logs en caso de duda.{CLR_RESET}")


def stop_server():
    """Detiene los servidores verificando que pertenezcan única y exclusivamente a este proyecto."""
    print(f"\n{CLR_BOLD}{CLR_RED}⏹  Deteniendo servidores locales de Lead-Sourcing...{CLR_RESET}\n")
    
    pids_to_kill = set()
    
    # 1. PIDs registrados en .server_pids.json
    tracked = load_tracked_pids()
    for key, pid in tracked.items():
        if isinstance(pid, int) and pid > 0:
            pids_to_kill.add(pid)
            
    # 2. PIDs escuchando en los puertos 8787 y 3001
    for port in (BACKEND_PORT, FRONTEND_PORT):
        for pid in get_listening_pids(port):
            pids_to_kill.add(pid)
            
    if not pids_to_kill:
        print(f" {CLR_YELLOW}ℹ No se detectaron procesos ni puertos activos en {BACKEND_PORT} o {FRONTEND_PORT}.{CLR_RESET}")
        clear_tracked_pids()
        return

    killed_count = 0
    for pid in sorted(pids_to_kill):
        cmdline = get_process_cmdline(pid)
        
        # Validación de seguridad: no matar procesos ajenos
        if cmdline and not is_project_process(pid, cmdline):
            print(f" {CLR_YELLOW}🛡️  PID {pid} en ejecución NO coincide con Lead-Sourcing. Omitido por seguridad.{CLR_RESET}")
            continue
            
        print(f" 🛑 Terminando PID {pid}...", end="", flush=True)
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False
            )
            print(f" {CLR_GREEN}[DETENIDO]{CLR_RESET}")
            killed_count += 1
        except Exception as e:
            print(f" {CLR_RED}[ERROR: {e}]{CLR_RESET}")

    clear_tracked_pids()
    
    time.sleep(1.2)
    be_up = is_port_listening(BACKEND_PORT)
    fe_up = is_port_listening(FRONTEND_PORT)
    
    if not be_up and not fe_up:
        print(f"\n{CLR_GREEN}{CLR_BOLD}✔ Todos los procesos de Lead-Sourcing fueron detenidos limpiamente.{CLR_RESET}")
        print(f"   • Puertos {FRONTEND_PORT} y {BACKEND_PORT} completamente liberados.")
    else:
        print(f"\n{CLR_YELLOW}⚠️ Aviso de liberación:{CLR_RESET}")
        if be_up:
            print(f"   • Puerto {BACKEND_PORT} aún reporta actividad.")
        if fe_up:
            print(f"   • Puerto {FRONTEND_PORT} aún reporta actividad.")


def restart_server():
    """Reinicia limpiamente el servidor completo."""
    print(f"\n{CLR_BOLD}{CLR_YELLOW}🔄 Reiniciando servidor local de Lead-Sourcing...{CLR_RESET}")
    stop_server()
    print(f"\n Pausa de estabilización de puertos...")
    time.sleep(2.0)
    start_server()


def deploy_to_cloudflare():
    """Compila el frontend y despliega todo a Cloudflare en un solo clic."""
    print(f"\n{CLR_BOLD}{CLR_CYAN}🚀 [DESPLIEGUE A CLOUDFLARE EN VIVO]{CLR_RESET}\n")
    node_exe = find_node_executable()
    deploy_script = PROJECT_ROOT / "scripts" / "deploy.mjs"
    
    if not deploy_script.exists():
        print(f" {CLR_RED}❌ Script de despliegue no encontrado en {deploy_script}{CLR_RESET}")
        return
        
    try:
        res = subprocess.run([node_exe, str(deploy_script)], cwd=str(PROJECT_ROOT))
        if res.returncode == 0:
            print(f"\n{CLR_GREEN}{CLR_BOLD}🎉 ¡Proyecto actualizado en vivo en {PRODUCTION_URL}!{CLR_RESET}")
        else:
            print(f"\n{CLR_RED}❌ El despliegue terminó con errores (código: {res.returncode}).{CLR_RESET}")
    except Exception as e:
        print(f"\n{CLR_RED}❌ Error al ejecutar el despliegue: {e}{CLR_RESET}")


def open_url(url: str, label: str):
    """Abre una URL en el navegador web predeterminado."""
    print(f"\n {CLR_CYAN}Abriendo {label} en el navegador predeterminado...{CLR_RESET}")
    print(f" URL: {url}")
    webbrowser.open(url)


def run_diagnostics():
    """Diagnóstico detallado de puertos, PIDs, base de datos D1 y producción."""
    print_header()
    print(f"\n{CLR_BOLD}🔍 [DIAGNÓSTICO 360° DEL ENTORNO UNIFICADO TYPESCRIPT]{CLR_RESET}\n")
    
    # 1. Puertos de Red
    print(f" {CLR_BOLD}1. Puertos Locales:{CLR_RESET}")
    for port, label, url in [
        (FRONTEND_PORT, "Frontend (Vite)", FRONTEND_URL),
        (BACKEND_PORT,  "Worker Local (Wrangler/D1)", BACKEND_URL)
    ]:
        listening = is_port_listening(port)
        pids = get_listening_pids(port)
        status_str = f"{CLR_GREEN}EN LÍNEA (Escuchando){CLR_RESET}" if listening else f"{CLR_RED}DESCONECTADO{CLR_RESET}"
        print(f"    • Puerto {port:<5} | {label:<28} : {status_str}")
        if pids:
            for pid in pids:
                cmd = get_process_cmdline(pid)
                is_safe = is_project_process(pid, cmd)
                tag = f"{CLR_GREEN}[Lead-Sourcing]{CLR_RESET}" if is_safe else f"{CLR_YELLOW}[Otro]{CLR_RESET}"
                cmd_summary = (cmd[:70] + "...") if len(cmd) > 70 else cmd
                print(f"      └─ PID: {pid:<6} {tag} -> {cmd_summary}")
        else:
            print(f"      └─ Ningún PID escuchando.")
            
    # 2. Estado de Producción
    print(f"\n {CLR_BOLD}2. Estado en Producción (Cloudflare Edge):{CLR_RESET}")
    try:
        req = urllib.request.Request(f"{PRODUCTION_URL}/api/health", headers={"User-Agent": "ControlCenter/2.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                print(f"    • {PRODUCTION_URL:<32} : {CLR_GREEN}✔ EN VIVO 24/7 (HTTP 200 OK){CLR_RESET}")
            else:
                print(f"    • {PRODUCTION_URL:<32} : {CLR_YELLOW}HTTP {resp.status}{CLR_RESET}")
    except Exception as e:
        print(f"    • {PRODUCTION_URL:<32} : {CLR_YELLOW}Sin respuesta o timeout ({e}){CLR_RESET}")

    # 3. Binarios y Entorno
    print(f"\n {CLR_BOLD}3. Binarios y Herramientas:{CLR_RESET}")
    node_exe = find_node_executable()
    print(f"    • Node.js Binary    : {CLR_GREEN}✔ {node_exe}{CLR_RESET}")
    
    wrangler_exe = find_wrangler_executable()
    print(f"    • Cloudflare Wrangler: {CLR_GREEN}✔ {wrangler_exe}{CLR_RESET}")
    
    node_modules_ok = (PROJECT_ROOT / "node_modules").exists()
    print(f"    • Node Modules      : {'✔ ' + CLR_GREEN + 'Instalado' + CLR_RESET if node_modules_ok else '❌ ' + CLR_RED + 'Falta npm install' + CLR_RESET}")
    
    # 4. Base de Datos Cloudflare D1 Local
    print(f"\n {CLR_BOLD}4. Base de Datos Cloudflare D1 Local:{CLR_RESET}")
    if D1_LOCAL_DIR.exists():
        db_files = list(D1_LOCAL_DIR.glob("**/*.sqlite"))
        if db_files:
            total_kb = sum(f.stat().st_size for f in db_files) / 1024
            print(f"    • D1 Local Storage  : {CLR_GREEN}✔ Activo ({len(db_files)} archivos, {total_kb:.1f} KB){CLR_RESET}")
        else:
            print(f"    • D1 Local Storage  : {CLR_YELLOW}Directorio presente, sin archivos de datos aún{CLR_RESET}")
    else:
        print(f"    • D1 Local Storage  : {CLR_DIM}Se inicializará al arrancar wrangler dev{CLR_RESET}")

    # 5. Archivos de Logs
    print(f"\n {CLR_BOLD}5. Archivos de Logs:{CLR_RESET}")
    for log_name in ["backend.log", "frontend.log"]:
        log_path = LOGS_DIR / log_name
        if log_path.exists():
            size_kb = log_path.stat().st_size / 1024
            mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(log_path.stat().st_mtime))
            print(f"    • {log_name:<14} : {CLR_GREEN}✔ {size_kb:.1f} KB{CLR_RESET} (Última mod: {mtime})")
        else:
            print(f"    • {log_name:<14} : {CLR_DIM}Sin registros aún{CLR_RESET}")


def view_log(log_filename: str):
    """Muestra las últimas líneas de un archivo de log con recarga."""
    log_path = LOGS_DIR / log_filename
    while True:
        os.system("cls" if os.name == "nt" else "clear")
        print(f"{CLR_CYAN}==============================================================================")
        print(f"  📜 REGISTRO: {log_filename} (Últimas 40 líneas)")
        print(f"=============================================================================={CLR_RESET}")
        
        if not log_path.exists():
            print(f"\n {CLR_YELLOW}El archivo {log_path} todavía no existe. Inicia el servidor primero.{CLR_RESET}")
        else:
            try:
                with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
                    tail_lines = lines[-40:] if len(lines) > 40 else lines
                    print("".join(tail_lines))
            except Exception as e:
                print(f" {CLR_RED}Error al leer log: {e}{CLR_RESET}")
                
        print(f"\n{CLR_CYAN}------------------------------------------------------------------------------{CLR_RESET}")
        print(f" [R] 🔄 Recargar Log   |   [C] 🧹 Limpiar Log   |   [Enter] ⬅ Volver al Menú")
        choice = input(f"{CLR_BOLD}Opción: {CLR_RESET}").strip().lower()
        if choice == "r":
            continue
        elif choice == "c":
            try:
                with open(log_path, "w", encoding="utf-8") as f:
                    f.write(f"--- [LOG LIMPIADO: {time.strftime('%Y-%m-%d %H:%M:%S')}] ---\n")
                print(f" {CLR_GREEN}Log limpiado.{CLR_RESET}")
                time.sleep(1)
            except Exception as e:
                print(f" {CLR_RED}Error al limpiar: {e}{CLR_RESET}")
                time.sleep(1)
        else:
            break


def main():
    """Bucle principal de la consola de control."""
    while True:
        try:
            print_menu()
            choice = input(f"{CLR_BOLD}Ingresa una opción [0-9]: {CLR_RESET}").strip().lower()
            
            if choice == "1":
                start_server()
                input(f"\n{CLR_DIM}Presiona Enter para continuar...{CLR_RESET}")
            elif choice == "2":
                stop_server()
                input(f"\n{CLR_DIM}Presiona Enter para continuar...{CLR_RESET}")
            elif choice == "3":
                restart_server()
                input(f"\n{CLR_DIM}Presiona Enter para continuar...{CLR_RESET}")
            elif choice == "4":
                open_url(FRONTEND_URL, "Frontend Web Local")
                time.sleep(1)
            elif choice == "5":
                open_url(PRODUCTION_URL, "Producción en Cloudflare")
                time.sleep(1)
            elif choice in ("6", "d", "deploy"):
                deploy_to_cloudflare()
                input(f"\n{CLR_DIM}Presiona Enter para continuar...{CLR_RESET}")
            elif choice == "7":
                run_diagnostics()
                input(f"\n{CLR_DIM}Presiona Enter para continuar...{CLR_RESET}")
            elif choice == "8":
                view_log("backend.log")
            elif choice == "9":
                view_log("frontend.log")
            elif choice == "0":
                print(f"\n{CLR_CYAN}Saliendo del Control Center. ¡Que tengas una excelente sesión de trabajo, Jose! 👋{CLR_RESET}\n")
                sys.exit(0)
            else:
                print(f"\n{CLR_RED}Opción inválida. Elige una opción entre 0 y 9.{CLR_RESET}")
                time.sleep(1.2)
        except KeyboardInterrupt:
            print(f"\n\n{CLR_YELLOW}Operación cancelada por el usuario. Saliendo...{CLR_RESET}\n")
            sys.exit(0)
        except Exception as e:
            print(f"\n{CLR_RED}Error inesperado: {e}{CLR_RESET}")
            input(f"\n{CLR_DIM}Presiona Enter para continuar...{CLR_RESET}")


if __name__ == "__main__":
    main()
