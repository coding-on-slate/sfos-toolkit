# SFOS Toolkit

Build, deploy, and run Sailfish OS apps from VS Code using the Sailfish SDK CLI (`sfdk`).

Community project, **not affiliated with Jolla**. You still need the Sailfish SDK installed.

## What it is

A sidebar over `sfdk`: choose a build target and device, then build, deploy, run, and live-reload QML on the emulator—without leaving the editor.

It is **not** Sailfish IDE. It does not replace Qt Creator, install the SDK, or register hardware phones.

## Features

- **Workflow** — **Build** (engine, build, clean build, `compile_commands.json`, check, init), **Run** (deploy, undeploy, run, QmlLive), and **Debug** (GDB in a terminal: start / attach / load core)
- **Targets, devices, emulators** — list, selected target/device, start/stop emulator, terminals, config

Set `sfosToolkit.sfdkPath` if `sfdk` is not on PATH, and `sfosToolkit.sfdkCwd` to your SDK workspace (absolute path).

Register a **hardware phone** in Sailfish IDE (**Tools → Options → Devices**). It then appears here.

## Not in scope

- QML/Silica designer, QML Profiler, Qt Creator kit UI
- Breakpoints in the VS Code Debug view (Debug is `sfdk debug` in a terminal)
- SDK install, kit creation, or packaging/maintenance `sfdk` commands as UI
