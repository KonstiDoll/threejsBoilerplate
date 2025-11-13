# Three.js Voxel Builder - Projekt Dokumentation

## Überblick

Ein modernes Vue 3 + Three.js Voxel-Bausystem mit natürlicher Beleuchtung und intuitivem Block-Platzierungs-System. Entwickelt als Teil des Scenerii-Ökosystems für Stadtplanungs-Visualisierung.

## 🏗️ Aktuelle Architektur

### Aktive Komponenten
- **VoxelEngine.vue** - Hauptkomponente für Voxel-Baubereich
- **ThreejsScene.vue** - Three.js Demo mit animierten Würfeln  
- **CityJSONViewer.vue** - Urban-Daten Visualisierung

### Core Utils (Aktiv)
- **voxelEngine.ts** - Haupt-Voxel-System mit einem Mesh pro Block
- **cityJsonIntegration.ts** - CityJSON Wrapper-Klasse
- **geometryGenerator.ts** - Three.js Geometrie-Utilities
- **touchInterface.ts** - Mobile Gesture-Handling

### Archivierte Systeme (`src/archive/`)
- BatchedVoxelEngine.vue - Komplexes BatchedMesh System  
- OptimizedVoxelEngine.vue - InstancedMesh System
- Alle optimized*.ts Dateien - Performance-orientierte Ansätze

## 🎨 Voxel Builder Features

### Beleuchtung & Atmosphäre
```javascript
// Natürliche Lichtstimmung
const sunColor = 0xfbf8ee;        // Warmes Sonnenlicht
const groundColor = 0xaab5bd;     // Kühles Bodenlicht  
const intensity = .8 * Math.PI;   // Realistische Intensität

// HemisphereLight für natürliche Verteilung
const hemiLight = new THREE.HemisphereLight(sunColor, groundColor, intensity);

// DirectionalLight als Sonne
const directionalLight = new THREE.DirectionalLight(sunColor, 1);
directionalLight.position.set(-10, 10, 0);

// Atmosphärischer Nebel
const fog = new THREE.FogExp2(0xd6d5cc, 0.00005);
scene.fog = fog;
```

### Block-Materialien
- **Gras**: Warmes Naturgrün (0x4a7c59) - Roughness 0.8
- **Stein**: Warmer Sandstein (0x8b8680) - Roughness 0.9  
- **Holz**: Natürliches Holz (0xa0755b) - Roughness 0.7
- **Glas**: Physikalisches Material mit Transmission 0.8
- **Wasser**: Halbtransparentes Blau (0x4682b4) - Opacity 0.7

### Grid-System
- **20x20 Einheiten** großes, sichtbares Grid
- **Feine Unterteilungen** pro Block-Größe (1m Standard)
- **Neutrales Grau** (0x888888) mit 0.6 Opacity
- **Knapp über Boden** positioniert (y = 0.01)

### Preview-System
- **1.02x Skalierung** für subtile Hervorhebung
- **Farbkodierung**: 
  - Grün = Normale Platzierung
  - Cyan = Stapeln auf Blöcken  
  - Rot = Löschen-Modus
- **0.7 Opacity** mit DoubleSide Material

### Spatial Hash Optimization
- **4x4x4 Zellen** für optimiertes Raycasting
- **Radius-basierte Mesh-Auswahl** statt aller Meshes
- **O(1) Zugriff** auf nahe Objekte
- **Automatische Verwaltung** bei Add/Remove

## 🛠️ Entwicklungskommandos

```bash
# Installation
npm install

# Entwicklung starten  
npm run dev

# Production Build
npm run build

# Vorschau der Production-Version
npm run preview
```

## 📁 Projekt-Struktur

```
src/
├── components/
│   ├── VoxelEngine.vue      # 🏗️ Haupt-Voxel-Builder
│   ├── VoxelLibrary.vue     # 📚 Objektbibliothek mit 3D-Preview
│   ├── VoxelMiniViewer.vue  # 🔍 3D-Vorschau Komponente (NEU)
│   ├── ThreejsScene.vue     # 🎲 Three.js Demo
│   └── CityJSONViewer.vue   # 🏙️ Urban-Daten Viewer
├── utils/
│   ├── voxelEngine.ts       # 🔧 Core Voxel-System
│   ├── voxelLibrary.ts      # 📖 Bibliotheks-Management
│   ├── voxelExporter.ts     # 💾 Export/Import-Funktionen
│   ├── cityJsonIntegration.ts # 🏘️ CityJSON Integration
│   ├── geometryGenerator.ts # 📐 Geometrie-Tools
│   └── touchInterface.ts    # 📱 Touch-Steuerung
├── archive/                 # 📦 Alte Systeme (nicht aktiv)
│   ├── BatchedVoxelEngine.vue
│   ├── OptimizedVoxelEngine.vue
│   └── optimized*.ts
└── App.vue                  # 🏠 Hauptkomponente
```

## 🎮 Bedienung

### Desktop
- **Linksklick**: Block platzieren/löschen
- **X-Taste**: Wechsel zum Löschen-Modus
- **1-5 Tasten**: Direktwahl der Block-Typen
- **Mausrad**: Kamera zoomen
- **Rechtsklick + Ziehen**: Kamera drehen

### Mobile
- **Tap**: Block platzieren/löschen
- **UI-Buttons**: Tool- und Block-Wechsel
- **Pan-Geste**: Kamera drehen
- **Pinch**: Kamera zoomen

## 🔧 Technische Details

### Block-System
- **Ein THREE.Mesh pro Block** - Einfach und zuverlässig
- **Chunk-basierte Speicherung** - 16³ Chunks für große Welten
- **Grid-Snapping** - Präzise 1m×1m×1m Ausrichtung
- **Spatial Hash** - Optimiertes Raycasting für Performance

### Performance-Optimierungen
- **Throttled Mouse Events** - RequestAnimationFrame-basiert
- **Effiziente Material-Wiederverwendung** - Gecachte Materialien
- **Optimierte Geometrie-Verwaltung** - Automatisches Dispose
- **Räumliche Partitionierung** - Spatial Hash für große Szenen

## ✅ Implementierte Features (Stand: Januar 2025)

### 3D-Vorschau System ⭐ NEU
- **VoxelMiniViewer Komponente** - Eigenständige 3D-Vorschau mit Three.js
- **Hover-basierte Aktivierung** - Live 3D-Preview beim Mouseover über Bibliotheks-Objekte
- **OrbitControls Integration** - Interaktive Kamerasteuerung in der Miniatur-Ansicht
- **Identische Beleuchtung** - Gleiche natürliche Lichtstimmung wie im Haupteditor
- **Smooth Animations** - Weiche Kamera-Transitions und Fade-Effekte beim Laden
- **Robuste Fehlerbehandlung** - Fallback-Materialien und Debug-Logging
- **Performance-Optimiert** - Render-Loop nur bei aktiver Vorschau

### Export/Import System
- **Vollständige Save/Load-Funktionalität** - JSON, Binary und Compressed-Formate
- **Objektbibliothek mit moderner UI** - Speichern, Durchsuchen, Verwalten von Strukturen
- **3D-Thumbnail-Generierung** - Off-screen Three.js Rendering für realistische Vorschaubilder
- **Kategorien-System** - Gebäude, Fahrzeuge, Natur, Möbel, Infrastruktur, etc.
- **Such- und Filterfunktionen** - Echtzeitsuche, Kategorie-Filter, Sortierung
- **LocalStorage-Persistierung** - Bibliothek wird automatisch gespeichert

### Voxel Builder Core
- **Ein-Mesh-pro-Block System** - Zuverlässig und einfach zu debuggen
- **Spatial Hash Optimization** - Optimiertes Raycasting für Performance
- **Tool-System** - Place/Delete-Modi mit farbkodierter Preview
- **Intelligentes Snapping** - Automatisches Andocken an bestehende Blöcke
- **5 Block-Typen** - Gras, Stein, Holz, Glas, Wasser mit realistischen Materialien
- **Touch-Interface** - Mobile-optimierte Steuerung

### Architektur & Performance
- **Chunk-basierte Speicherung** - 16³ Chunks für große Welten
- **Spatial Hash für Raycasting** - O(1) Zugriff auf nahe Objekte
- **Throttled Mouse Events** - RequestAnimationFrame-basierte Performance
- **Material-Caching** - Wiederverwendung für bessere Performance

## 🚀 Nächste Entwicklungsschritte

### Höchste Priorität
1. ~~**3D-Vorschau in Bibliothek**~~ ✅ **IMPLEMENTIERT**
   - ✅ Miniatur 3D-Viewer mit OrbitControls
   - ✅ Beleuchtung und Material-Darstellung wie im Haupteditor  
   - ✅ Smooth Transitions beim Objektwechsel
   - ✅ Hover-basierte Aktivierung mit Performance-Optimierung

### Mittlere Priorität  
2. **Block-Creator für Custom-Blöcke** - Advanced Shader-System (nach Core-Stabilisierung)
   - Visual Shader-Editor für eigene Materialien
   - PBR-Material-Properties (Roughness, Metallic, Normal Maps)
   - Textur-Upload und -Verwaltung
   - Shader-Presets für häufige Effekte (Emission, Animated, etc.)

### Niedrige Priorität
3. **Performance-Optimierungen**
   - Instanced Rendering für identische Blöcke
   - Level-of-Detail (LOD) für große Entfernungen
   - Frustum Culling für bessere FPS

4. **Erweiterte Export-Optionen**
   - GLTF-Export für Interoperabilität
   - Mesh-Vereinfachung für 3D-Printing
   - OBJ-Export für externe 3D-Software

### Langfristige Vision
5. **Multiplayer-Features** (falls gewünscht)
   - WebRTC-basiertes Collaborative Building
   - Cloud-Synchronisation der Bibliothek
   - Shared Public Library

## 🎯 Technische Roadmap

### Phase 1: Core-Stabilisierung ✅
- [x] Voxel Engine mit Spatial Hash
- [x] Export/Import-System
- [x] Objektbibliothek-UI
- [x] 3D-Thumbnail-Generierung

### Phase 2: Enhanced UX ✅ **ABGESCHLOSSEN**
- [x] **3D-Vorschau in Bibliothek** ← **IMPLEMENTIERT**
- [ ] Verbesserte Touch-Gesten  
- [ ] Undo/Redo-System

### Phase 3: Advanced Features
- [ ] Block-Creator mit Shader-Editor
- [ ] Animation-System für Blöcke
- [ ] Lighting-System Upgrades

### Phase 4: Performance & Polish
- [ ] WebWorker für Background-Processing
- [ ] Progressive Web App (PWA) Features
- [ ] Advanced Rendering Optimizations

## 📋 Abhängigkeiten

### Core
- **Vue 3.5.13** - Composition API mit TypeScript
- **Three.js r178** - Neueste Version mit aktuellen APIs
- **Vite** - Schneller Build-Tool für Entwicklung

### Styling  
- **Tailwind CSS** - Utility-first CSS Framework
- **PostCSS** - CSS-Transformationen

### Development
- **TypeScript** - Typsicherheit und bessere DX
- **Vue SFC** - Single File Components mit <script setup>

## 📝 Migration Notes

Dieses Projekt wurde von komplexen BatchedMesh/InstancedMesh Systemen zu einem einfachen, zuverlässigen "Ein-Mesh-pro-Block" Ansatz migriert. Die archivierten Systeme bleiben als Referenz erhalten, sind aber nicht mehr aktiv.

**Voxel Builder ist jetzt produktionsbereit für interaktive 3D-Bauanwendungen! 🎯**