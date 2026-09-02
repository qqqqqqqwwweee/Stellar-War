# Stellar War

## Autonomous Galactic War Simulator

Stellar War is a spectator-focused science-fiction strategy game built around autonomous galactic evolution. The player observes four AI civilizations as they explore, develop star systems, research technology, build fleets, fight wars, capture territory, and eventually compete for control of the galaxy.

The simulation continues without direct fleet micromanagement. The intended experience is to watch an emergent, continuously changing history of interstellar conflict.

## Core Features

- A procedurally generated galaxy containing 100–160 stars, with 128 stars by default.
- A connected hyperspace network with clusters, hubs, loops, border routes, and strategic chokepoints.
- Four autonomous civilizations with different economic bonuses, technology priorities, ship specialties, buildings, and strategic personalities.
- Automatic resource production, development, construction, research, colonization, fleet assembly, diplomacy, and warfare.
- Five levels of star-system development, from an undeveloped system to a core system.
- Automatic fleet-level strategy with lightweight ship-level combat behavior.
- Combat that takes place inside the same star system; fleets in transit cannot attack across systems.
- Automatic occupation, defensive damage, reinforcements, retreats, and territory changes.
- Tactical close-up rendering for battles, ship silhouettes, weapon effects, explosions, shields, and capital ships.
- Spectator speed controls from pause through 1x, 2x, 4x, 8x, and 16x.
- Automatic event camera, galaxy event notifications, war logs, faction statistics, and fog-of-war viewing.
- Local save slots, automatic saves, JSON export/import, and reproducible simulation seeds.

## The Four Civilizations

| Civilization | Identity | Strategic tendency |
| --- | --- | --- |
| United Stellar Federation | Balanced economy, efficient logistics, strong escort ships | Stable expansion with an emphasis on economy and research |
| Machine Intelligence Empire | High industrial output, rapid production, autonomous fleets | Aggressive expansion and large-scale fleet warfare |
| Void Mystery Civilization | Dark-matter technology, advanced shields, powerful heavy ships | Slower early growth followed by a late technology surge |
| Ancient Star Empire | Strong defenses, advanced materials, powerful capital ships | Consolidates a strong core before launching major wars |

The civilizations are differentiated by configurable modifiers rather than color alone. Their AI priorities, ship modifiers, weapon bonuses, unique buildings, and research focus all influence the simulation.

## Resources and Development

The economy uses four primary resources:

- **Metal** — basic buildings and most ships.
- **Dark Matter** — advanced ships, weapons, and technologies.
- **Advanced Materials** — rare strategic construction material for large ships, megaprojects, Titans, carriers, and flagships.
- **Research Points** — technology development.

Captured star systems must be developed over time. Development levels increase resource output, available building capacity, defense, fleet capacity, and construction options.

Available building types include mining facilities, dark-matter extractors, advanced-material plants, research labs, shipyards, defensive platforms, railgun batteries, shield arrays, repair bays, logistics hubs, radar arrays, and civilization-specific structures.

## Shipyard Progression

Each star system may have only one dedicated shipyard. Shipyards are upgraded in place rather than stacked.

| Shipyard | Level | Production lines | Construction access |
| --- | ---: | ---: | --- |
| Standard Shipyard | 1 | 3 | Standard ships |
| Large Shipyard (`shipyardLarge`) | 2 | 8 | Standard and large ships |
| Super Dock (`superDock`) | 3 | 14 | All ships, including Titans and Super Flagships |

The upgrade path is:

```text
Standard Shipyard -> Large Shipyard -> Super Dock
```

An upgrade requires the previous dedicated shipyard, replaces it when construction finishes, and does not add the old shipyard's production lines. A shipyard upgrade can be queued even when the star system has no free building slot because it replaces an existing structure.

Civilization-specific structures such as the Machine Empire's automated factory and the Ancient Empire's megaforge may provide auxiliary production capacity or speed. They do not count as dedicated shipyards and cannot unlock a higher shipyard level.

## Ships and Combat

The simulation supports ten ship classes:

1. Corvette
2. Destroyer
3. Cruiser
4. Battlecruiser
5. Torpedo Ship
6. Battleship
7. Dreadnought
8. Titan
9. Carrier
10. Super Flagship

Each ship class has its own size, hull, shields, armor, damage, range, speed, weapon profile, cost, build time, target priorities, and tactical rendering style.

Weapons include lasers, particle cannons, plasma cannons, mass drivers, railguns, missiles, torpedoes, ion cannons, carrier aircraft, and super weapons. Weapon behavior includes shield, armor, capital-ship, missile, and aircraft counters.

Titans are limited to five active ships per civilization. Each civilization can have only one active Super Flagship; a replacement can be built after its previous flagship is destroyed.

Strategic movement uses hyperspace lanes only. When opposing fleets meet in the same star system, combat is resolved automatically. Large engagements use fleet-level strategic calculations, while ships near the camera receive detailed tactical rendering.

## Autonomous AI

The AI periodically evaluates:

- Resource income, reserves, upkeep, and shortages.
- Technology progress and available ship designs.
- Border pressure, nearby enemy power, and defensive priorities.
- Strategic resources, chokepoints, hubs, and expansion distance.
- Fleet composition, rally points, staging areas, and retreat conditions.
- Whether to defend, reinforce, expand, raid, declare war, or commit to a major offensive.

Economic, expansion, military, research, and production decisions run on separate schedules instead of being recalculated every render frame. Fleets gather before attacking defended systems and avoid sending isolated ships against clearly superior forces.

## Spectator Controls

### Camera

- Drag the map to pan.
- Use the mouse wheel or the `+` / `-` controls to zoom.
- Press `0` to return to the default zoom.
- Press `F` or use **Fit Galaxy** to show the whole map.
- Click a star or fleet to inspect it.
- Double-click a fleet to follow it.
- Zoom into a battle to enter the tactical view and see individual ship groups and weapon effects.

### Simulation and panels

- `Space` — pause or resume.
- `1`–`5` — select 1x, 2x, 4x, 8x, or 16x simulation speed.
- `A` — toggle automatic event spectating.
- `V` — toggle faction-view fog of war.
- `T` — open the technology tree.
- `S` — open faction statistics.

The interface also provides event notifications, a searchable war history, resource displays, technology information, save management, and a new-galaxy menu.

## Running the Game

The project is a browser application with no build step or package installation required.

1. Open `index.html` in a modern desktop browser, or serve the project directory with a local static HTTP server.
2. Start a new galaxy.
3. Leave the simulation running and observe the civilizations evolve.

For example, with Python installed:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/` in the browser.

Node.js is only needed for the automated tests.

## Automated Tests

Run the commands from the project root:

```bash
node tools/feature-test.js
node tools/headless-test.js 120 128 123456789
node tools/headless-test.js 120 128 246813579
node tools/headless-test.js 120 128 42424242
```

The feature test covers galaxy generation, camera behavior, tactical battle rendering, ship differentiation, combat boundaries, AI rally behavior, economy pressure, ship production, shipyard progression, save-state derivation, and configuration constraints.

The headless simulation tests run a 120-year galaxy simulation and check connectivity, wars, fleet evolution, resource behavior, victory/defeat processing, runtime errors, and save/load behavior.

## Project Structure

The code is organized as browser-loaded JavaScript modules:

```text
js/config/       Tunable galaxy, resource, faction, ship, technology, building, and AI data
js/core/         Event bus and galaxy-time management
js/galaxy/       Star systems, hyperspace lanes, and galaxy generation
js/factions/     Faction state, modifiers, and starting positions
js/systems/      Economy, technology, buildings, production, fleets, combat, diplomacy, and saves
js/ai/           Economic, expansion, military, research, production, and strategic AI
js/render/       Camera, particles, tactical effects, and galaxy rendering
js/ui/           HUD, panels, statistics, technology tree, logs, and save controls
js/game.js       Main simulation orchestration
js/main.js       Browser entry point
css/style.css   Visual styling for the holographic interface
index.html      Application shell and module loading order
tools/          Feature and headless simulation tests
```

## Configuration

Gameplay values are intentionally centralized in configuration modules:

- `js/config/galaxyConfig.js`
- `js/config/resourceConfig.js`
- `js/config/factionConfig.js`
- `js/config/shipConfig.js`
- `js/config/techConfig.js`
- `js/config/buildingConfig.js`
- `js/config/aiConfig.js`

These files control galaxy size, resource rates, ship costs, build times, technology costs, building capacity, faction modifiers, AI thresholds, simulation speed, camera limits, and tactical rendering limits.

## Save System

The game stores local saves in browser storage and supports:

- Multiple manual save slots.
- Automatic saving during play.
- JSON export and import.
- Galaxy time, RNG state, star ownership, development, buildings, fleets, production lines, combat state, diplomacy, technology, and war history.

## Development Status

The core autonomous simulation is implemented and runnable. The current project has passed syntax checks, feature tests, and three 120-year headless simulations with zero runtime errors.

Remaining release work includes longer balance runs, 1000+ ship and multi-battle performance observation, browser visual acceptance at different window sizes, tactical effect tuning, edge-case save compatibility, and final release configuration.

