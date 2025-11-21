import * as THREE from 'three/webgpu';
import type { SolarSimulator } from './solarSimulation';
import { createRealTimeSolarHeatMapNode, createCumulativeHeatMapNode, createSolarOverlayNode, DEFAULT_HEATMAP_CONFIG } from './solarShaders';


export const createCube = (): THREE.Object3D => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardNodeMaterial({ color: 0x70f39e });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = .5;
    return cube;
}

export const createPlane = (): THREE.Object3D => {
    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    planeGeometry.rotateX(-Math.PI / 2);
    const planeMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xa492f7 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    return plane;
}

export const createBatchedMesh = (): THREE.Object3D => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sphere = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardNodeMaterial({ color: 0x70f39e });

    // initialize and add geometries into the batched mesh
    const batchedMesh = new THREE.BatchedMesh(10, 5000, 10000, material);
    const boxId = batchedMesh.addGeometry(box);
    const sphereId = batchedMesh.addGeometry(sphere);

    batchedMesh.addInstance(boxId);
    batchedMesh.addInstance(sphereId);
    const boxMatrix = new THREE.Matrix4();
    const sphereMatrix = new THREE.Matrix4();
    boxMatrix.setPosition(new THREE.Vector3(2, 0.5 ,2));
    sphereMatrix.setPosition(new THREE.Vector3(-2, 0.5, -2));
    // position the geometries
    batchedMesh.setMatrixAt(boxId, boxMatrix);
    batchedMesh.setMatrixAt(sphereId, sphereMatrix);

    return batchedMesh;
}

/**
 * Create a solar-aware material for real-time irradiance visualization
 *
 * @param solarSimulator Solar simulator instance with sun direction and intensity uniforms
 * @param baseColor Optional base color (default: light gray)
 * @param heatMapStrength Blend strength between base color and heat map (0-1)
 * @returns Material with solar heat map visualization
 */
export const createSolarMaterial = (
    solarSimulator: SolarSimulator,
    baseColor: THREE.Color = new THREE.Color(0xcccccc),
    heatMapStrength: number = 0.8
): THREE.MeshStandardNodeMaterial => {
    const material = new THREE.MeshStandardNodeMaterial();

    // Create heat map node using sun direction and intensity from simulator
    const heatMapNode = createRealTimeSolarHeatMapNode(
        solarSimulator.sunDirection,
        solarSimulator.sunIntensity,
        {
            ...DEFAULT_HEATMAP_CONFIG,
            maxValue: 1200 // Real-time W/m² (not daily Wh/m²)
        }
    );

    // Blend with base color
    const colorNode = createSolarOverlayNode(baseColor, heatMapNode, heatMapStrength);
    material.colorNode = colorNode;

    return material;
};

/**
 * Create a solar-aware material for cumulative irradiance visualization
 *
 * Shows accumulated solar energy over a full day (Wh/m²) instead of instantaneous values.
 * Used after running daily simulation to display which surfaces receive most sunlight.
 *
 * @param solarSimulator Solar simulator instance with cumulative irradiance uniform
 * @param baseColor Optional base color (default: light gray)
 * @param heatMapStrength Blend strength between base color and heat map (0-1)
 * @returns Material with cumulative solar heat map visualization
 */
export const createCumulativeSolarMaterial = (
    solarSimulator: SolarSimulator,
    baseColor: THREE.Color = new THREE.Color(0xcccccc),
    heatMapStrength: number = 0.8
): THREE.MeshStandardNodeMaterial => {
    const material = new THREE.MeshStandardNodeMaterial();

    // Create heat map node using cumulative irradiance uniform
    const heatMapNode = createCumulativeHeatMapNode(
        solarSimulator.cumulativeIrradiance,
        {
            ...DEFAULT_HEATMAP_CONFIG,
            maxValue: 6000 // Daily Wh/m² (typical: 3000-6000 Wh/m²/day)
        }
    );

    // Blend with base color
    const colorNode = createSolarOverlayNode(baseColor, heatMapNode, heatMapStrength);
    material.colorNode = colorNode;

    return material;
};

/**
 * Switch material between real-time and cumulative visualization modes
 *
 * Dynamically updates the material's colorNode to show either:
 * - Real-time: Instantaneous solar irradiance (W/m²)
 * - Cumulative: Accumulated daily solar energy (Wh/m²)
 *
 * @param mesh Mesh with MeshStandardNodeMaterial
 * @param solarSimulator Solar simulator with uniforms
 * @param mode Visualization mode to switch to
 * @param baseColor Base color for the material
 * @param heatMapStrength Blend strength
 */
export const switchMaterialMode = (
    mesh: THREE.Mesh,
    solarSimulator: SolarSimulator,
    mode: 'realtime' | 'cumulative',
    baseColor: THREE.Color = new THREE.Color(0xcccccc),
    heatMapStrength: number = 0.8
): void => {
    const material = mesh.material as THREE.MeshStandardNodeMaterial;

    if (mode === 'realtime') {
        // Create real-time heat map node
        const heatMapNode = createRealTimeSolarHeatMapNode(
            solarSimulator.sunDirection,
            solarSimulator.sunIntensity,
            {
                ...DEFAULT_HEATMAP_CONFIG,
                maxValue: 1200 // W/m²
            }
        );
        const colorNode = createSolarOverlayNode(baseColor, heatMapNode, heatMapStrength);
        material.colorNode = colorNode;
    } else {
        // Create cumulative heat map node
        const heatMapNode = createCumulativeHeatMapNode(
            solarSimulator.cumulativeIrradiance,
            {
                ...DEFAULT_HEATMAP_CONFIG,
                maxValue: 6000 // Wh/m²
            }
        );
        const colorNode = createSolarOverlayNode(baseColor, heatMapNode, heatMapStrength);
        material.colorNode = colorNode;
    }

    // CRITICAL: Mark material for update (WebGPU requires this for node changes)
    material.needsUpdate = true;
};

/**
 * Create a cube with solar heat map material
 *
 * @param solarSimulator Solar simulator instance
 * @returns Cube mesh with solar visualization
 */
export const createSolarCube = (solarSimulator: SolarSimulator): THREE.Object3D => {
    const geometry = new THREE.BoxGeometry();
    const material = createSolarMaterial(solarSimulator, new THREE.Color(0x70f39e));
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = .5;
    return cube;
};

/**
 * Create a plane with solar heat map material
 * Useful for visualizing ground-level solar exposure
 *
 * @param solarSimulator Solar simulator instance
 * @returns Plane mesh with solar visualization
 */
export const createSolarPlane = (solarSimulator: SolarSimulator): THREE.Object3D => {
    const planeGeometry = new THREE.PlaneGeometry(5, 5);
    planeGeometry.rotateX(-Math.PI / 2);
    const material = createSolarMaterial(solarSimulator, new THREE.Color(0xa492f7));
    const plane = new THREE.Mesh(planeGeometry, material);
    return plane;
};

/**
 * Create a batched mesh with solar heat map material
 *
 * @param solarSimulator Solar simulator instance
 * @returns Batched mesh with solar visualization
 */
export const createSolarBatchedMesh = (solarSimulator: SolarSimulator): THREE.Object3D => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sphere = new THREE.BoxGeometry(1, 1, 1);
    const material = createSolarMaterial(solarSimulator);

    // initialize and add geometries into the batched mesh
    const batchedMesh = new THREE.BatchedMesh(10, 5000, 10000, material);
    const boxId = batchedMesh.addGeometry(box);
    const sphereId = batchedMesh.addGeometry(sphere);

    batchedMesh.addInstance(boxId);
    batchedMesh.addInstance(sphereId);
    const boxMatrix = new THREE.Matrix4();
    const sphereMatrix = new THREE.Matrix4();
    boxMatrix.setPosition(new THREE.Vector3(2, 0.5 ,2));
    sphereMatrix.setPosition(new THREE.Vector3(-2, 0.5, -2));
    // position the geometries
    batchedMesh.setMatrixAt(boxId, boxMatrix);
    batchedMesh.setMatrixAt(sphereId, sphereMatrix);

    return batchedMesh;
};

/**
 * Create a simple building-like structure for urban solar analysis
 * Creates a box representing a building with proper dimensions
 *
 * @param solarSimulator Solar simulator instance
 * @param width Building width in meters
 * @param height Building height in meters
 * @param depth Building depth in meters
 * @param position Position in world space
 * @returns Building mesh with solar visualization
 */
export const createSolarBuilding = (
    solarSimulator: SolarSimulator,
    width: number = 10,
    height: number = 15,
    depth: number = 10,
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): THREE.Object3D => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = createSolarMaterial(solarSimulator, new THREE.Color(0xeeeeee), 0.9);
    const building = new THREE.Mesh(geometry, material);

    // Position building so bottom is at ground level
    building.position.copy(position);
    building.position.y += height / 2;

    return building;
};