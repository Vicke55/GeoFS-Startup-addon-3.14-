# GeoFS-Startup-addon-3.14-
This is an overhead panel for Airbus (A350) in GeoFS. Please use Tampermonky for theis addon!
# GeoFS A350 Startup

**A realistic Airbus A350 startup and shutdown addon for GeoFS.**

GeoFS A350 Startup is a Tampermonkey userscript designed to make operating the Airbus A350 in GeoFS more immersive and realistic. It adds interactive cockpit procedures, startup and shutdown sequences, sound effects, external power handling and an update notification system.

---

## Features

- **Aircraft startup procedures** – Follow an interactive startup sequence.
- **Aircraft shutdown procedures** – Realistic shutdown and post-flight sequences.
- **External power (EXT)** – Connect and disconnect external electrical power.
- **Cockpit interface** – A dedicated interface for controlling and following procedures.
- **Sound effects** – Additional cockpit sounds to improve immersion.
- **Update notifications** – Receive notifications when new versions are available.
- **What's New** – View the changes and improvements introduced in each version.

## Current Version

**v3.14.0 Official**

See the [What's New](updates/changelog.json) file for the latest version information.

## Installation

### Requirements

- A computer with a supported web browser.
- GeoFS.
- Tampermonkey browser extension.

### Installing the addon

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the A350 Startup `.user.js` script.
3. Tampermonkey should display an installation page.
4. Select **Install**.
5. Open GeoFS and select the Airbus A350, or any other aircraft.
6. Open the addon interface and follow the available procedures.

If you already have an older version installed, update or replace the existing userscript rather than installing multiple copies.

## Update System

A350 Startup includes a GitHub-based update notification system.

The addon periodically checks the repository for update information.

The update system can provide:

- Notifications when a new version is available.
- Version-specific What's New information.
- Announcements.
- A link to the GitHub Releases page.

Update information is stored in the `updates` directory.

### Update configuration

| File                 | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `updates.json`       | Latest version and update configuration    |
| `changelog.json`     | Version history and What's New information |
| `announcements.json` | Additional announcements                   |

## Development

This project is continuously being developed and improved.

New features, sound effects, cockpit improvements and more realistic procedures may be added in future releases.

## Disclaimer

This is an independent community-made addon for GeoFS.

It is not affiliated with, endorsed by or officially supported by Airbus or GeoFS.

Use the addon at your own discretion. Features and procedures are designed for flight simulation and should not be used as real-world aircraft operating instructions.

---

**Developed by Vicke55**
