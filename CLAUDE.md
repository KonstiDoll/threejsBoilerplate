# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About This Project

A modern Vue 3 + Three.js Voxel Builder with natural lighting and intuitive block placement system. Part of the Scenerii ecosystem for urban planning visualization tools.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production (includes TypeScript compilation)
npm run build

# Preview production build
npm run preview
```

## Core Architecture

### Three View System
The application uses a single-page navigation pattern with three core views:
- **VoxelEngine**: Main voxel building system (PRIMARY) - uses WebGL
- **ThreejsScene**: Interactive cube demo with animations - **uses WebGPU** ⚡
- **CityJSONViewer**: Urban data visualization with CityJSON support - uses WebGL

Navigation is handled in `src/App.vue` with reactive view switching.

### WebGPU Support ⚡ NEW (October 2025)
The ThreejsScene component now uses WebGPU for modern GPU-accelerated rendering:
- **Automatic detection** with browser compatibility checking
- **Real-time status notifications** showing WebGPU availability
- **Graceful fallback** if WebGPU is unavailable
- **Browser requirements**: Chrome/Edge 113+, Firefox 133+, Safari 18+
- **Enhanced performance** with modern GPU features

### Voxel Builder System (ACTIVE)
- **One Mesh per Block** approach for simplicity and reliability
- **Spatial Hash optimization** for efficient raycasting
- **Natural lighting** with HemisphereLight + DirectionalLight + Fog
- **5 Block types** with realistic materials (Grass, Stone, Wood, Glass, Water)
- **Precise 1m×1m grid** with visual feedback
- **Smart preview system** with color-coded snapping

### Key Dependencies

#### Local Fork Strategy
- Uses forked `cityjson-threejs-loader` from GitHub (`github:KonstiDoll/cityjson-threejs-loader`)
- Ensures compatibility with Three.js r178 and custom patches for Scenerii needs
- Fork maintains version control over critical urban visualization dependencies

#### Core Stack
- **Vue 3** with Composition API and TypeScript
- **Three.js 0.180.0** (latest version) with WebGPU support
- **Tailwind CSS** for styling
- **Vite** for development and building
- **Tween.js** for animations

### Component Architecture

#### ThreejsScene (`src/components/ThreejsScene.vue`) ⚡ WebGPU
- **WebGPU renderer** with async initialization and compatibility detection
- Demonstrates Three.js fundamentals: OrbitControls, lighting, shadows
- **MeshStandardNodeMaterial** for WebGPU-compatible materials
- BatchedMesh implementation with instance management
- Jump animation system with external trigger support
- Real-time browser compatibility notifications

#### CityJSONViewer (`src/components/CityJSONViewer.vue`) 
- High-level wrapper for CityJSON urban data visualization
- Auto-fitting camera positioning for loaded datasets
- Error handling and loading states
- Programmatic loading via `CityJSONIntegration` class

#### VoxelEngine (`src/components/VoxelEngine.vue`)
- Minecraft-style block placement with tool system (place/delete)
- Real-time preview system with color-coded feedback
- Touch and mouse interface support
- Statistics tracking (voxel count, chunks, FPS)

### Utility Classes

#### CityJSONIntegration (`src/utils/cityJsonIntegration.ts`)
- Wraps the forked CityJSON loader with Scenerii-specific features
- Handles progressive loading and chunking for large datasets
- Camera auto-fitting and scene management
- Error handling and progress callbacks

#### VoxelEngine System (`src/utils/voxelEngine.ts`)
- **BlockPlacer**: Core placement logic with raycasting and snapping
- **SparseVoxelGrid**: Chunk-based voxel storage for large worlds
- **VoxelRenderer**: Three.js mesh management and rendering
- **BlockTypeLibrary**: Block type definitions and materials

### Tool System Architecture
The Voxel Engine implements a mode-based tool system:
- **Place Mode**: Green/cyan preview, snapping to surfaces and blocks
- **Delete Mode**: Red preview, targets existing blocks only
- Keyboard shortcuts: X (delete), 1-5 (block types)
- Tool state affects raycasting behavior and preview colors

### Touch Interface
Mobile-optimized controls in `src/utils/touchInterface.ts`:
- Hammer.js integration for gesture recognition
- Multi-touch support for orbit controls
- Touch-specific preview and placement handling

## File Organization

```
src/
├── components/
│   ├── ThreejsScene.vue      # Three.js WebGPU demo with animations
│   ├── CityJSONViewer.vue    # Urban data visualization
│   └── VoxelEngine.vue       # Minecraft-style editor
├── utils/
│   ├── geometryGenerator.ts  # Three.js WebGPU geometry utilities
│   ├── webgpuDetector.ts     # WebGPU browser compatibility detector
│   ├── cityJsonIntegration.ts # CityJSON wrapper class
│   ├── voxelEngine.ts        # Voxel engine core systems
│   └── touchInterface.ts     # Mobile gesture handling
├── App.vue                   # Main router with view switching
└── main.ts                   # Vue app entry point
```

## Development Guidelines

### TypeScript Configuration
- Strict mode enabled with comprehensive linting rules
- ES2020 target with bundler module resolution
- Vue SFC support with proper type checking

### Three.js Version Compatibility
This project has been updated to Three.js 0.180.0 with WebGPU support:
- **WebGPU Renderer**: ThreejsScene uses `WebGPURenderer` with async initialization
- **Node Materials**: Uses `MeshStandardNodeMaterial` instead of `MeshStandardMaterial`
- **Import paths**: WebGPU components import from `three/webgpu`
- **Animation loop**: Uses `setAnimationLoop()` instead of `requestAnimationFrame()`
- Texture encoding replaced with `colorSpace` property
- All peer dependencies aligned to 0.180.0

### WebGPU Development Patterns
When working with WebGPU components:
```typescript
// Import from three/webgpu
import * as THREE from 'three/webgpu'

// Use NodeMaterial variants
const material = new THREE.MeshStandardNodeMaterial({ color: 0x70f39e });

// Async renderer initialization
const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();

// Use setAnimationLoop
renderer.setAnimationLoop(animate);

// Check WebGPU support
import { detectWebGPU } from './utils/webgpuDetector';
const support = await detectWebGPU();
```

### CityJSON Integration Patterns
When working with urban data:
```typescript
import { CityJSONIntegration } from './utils/cityJsonIntegration';

const integration = new CityJSONIntegration({
  chunkSize: 2000,
  onComplete: () => console.log('Loaded!')
});

const scene = await integration.loadCityJSON('/path/to/data.json');
```

### Voxel Engine Development
The voxel system uses a tool-based architecture:
- Always pass current tool mode to raycasting functions
- Preview colors indicate tool state and placement validity
- Use sparse grid for efficient memory management in large worlds

### Performance Considerations
- Mouse events are throttled using `requestAnimationFrame`
- Preview updates check position equality before re-rendering
- Voxel storage uses chunk-based architecture (16³ chunks)
- BatchedMesh used for rendering multiple instances efficiently

## Testing Urban Data
The CityJSONViewer includes demo data generation for testing without external files. Use the built-in generator when developing new visualization features.

## ✅ Implementierte Features (Januar 2025)

### 3D-Vorschau System ⭐ NEU  
- **VoxelMiniViewer Komponente** - Eigenständige 3D-Vorschau mit Three.js
- **Hover-basierte Aktivierung** - Live 3D-Preview beim Mouseover über Bibliotheks-Objekte
- **OrbitControls Integration** - Interaktive Kamerasteuerung in der Miniatur-Ansicht
- **Identische Beleuchtung** - Gleiche natürliche Lichtstimmung wie im Haupteditor
- **Smooth Animations** - Weiche Kamera-Transitions und Fade-Effekte beim Laden
- **Robuste Fehlerbehandlung** - Fallback-Materialien und Debug-Logging

### Vollständiges Export/Import-System
- **VoxelExporter-Klasse** - JSON, Binary, Compressed-Formate
- **Objektbibliothek** - Moderne UI mit Kategorien und Suche
- **3D-Thumbnail-Generierung** - Off-screen Three.js Rendering
- **LocalStorage-Integration** - Persistente Bibliotheksspeicherung
- **Automatische Material-Erkennung** - Block-Type-spezifische Darstellung

### Erweiterte Voxel Engine
- **Spatial Hash Optimization** - Performance-optimiertes Raycasting  
- **Tool-System** - Place/Delete mit visueller Preview
- **Intelligentes Block-Snapping** - Automatisches Andocken
- **Touch-Interface** - Mobile-optimierte Bedienung
- **Chunk-System** - Skaliert für große Strukturen

## 🚀 Nächste Entwicklungsschritte

### ~~**Priorität 1: 3D-Vorschau in Bibliothek**~~ ✅ **IMPLEMENTIERT**
- ✅ Live 3D-Preview beim Hover über Bibliotheks-Objekte
- ✅ Miniatur-Viewer mit OrbitControls
- ✅ Identische Beleuchtung wie Haupteditor
- ✅ Smooth Transitions und Performance-Optimierung

### **Priorität 2: Advanced Block-Creator** (nach Core-Stabilisierung)
- Visual Shader-Editor für Custom Materials
- PBR-Properties (Roughness, Metallic, Normal Maps)
- Textur-Upload und Shader-Presets
- Animation-Support für Blöcke

### **Langfristig: Performance & Features**
- WebWorker für Background-Processing
- GLTF/OBJ-Export für 3D-Software
- Progressive Web App (PWA) Features

## Migration Notes
This is a modernized fork with significant updates:
- **October 2025**: Migrated ThreejsScene to WebGPU (Three.js 0.180.0)
- **January 2025**: Added 3D preview system and Voxel Library
- Previous: Migrated from Three.js r165 to r178
- Updated Vue 3 to latest (3.5.13)
- Resolved all breaking changes in the dependency chain
- Maintained backward compatibility for existing CityJSON datasets

### WebGPU Migration Details (October 2025)
- ThreejsScene now uses `WebGPURenderer` with full async initialization
- Added `webgpuDetector.ts` utility for browser compatibility checking
- Updated `geometryGenerator.ts` to use `MeshStandardNodeMaterial`
- Implemented real-time status notifications for WebGPU availability
- VoxelEngine and CityJSONViewer remain on WebGL for stability
- All WebGPU features tested with Chrome 113+, Edge 113+