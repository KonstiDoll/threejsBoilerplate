/**
 * Shadow Map Baker for Solar Simulation
 *
 * Renders depth maps from the sun's perspective at multiple time steps throughout the day.
 * Produces a timeline of shadow maps that can be sampled by compute shaders to determine
 * shadow occlusion at any point in time.
 *
 * @module ShadowMapBaker
 */

import * as THREE from 'three/webgpu';
import * as SunCalc from 'suncalc';
import { SolarSimulator } from '../solarSimulation';

/**
 * Configuration options for shadow map baking
 */
export interface ShadowMapBakeOptions {
  /** Shadow map resolution per timestep (default: 2048) */
  resolution?: number;
  /** Time step interval in minutes (default: 15) */
  timeStepMinutes?: number;
  /** Manual shadow camera bounds (default: auto-calculate from scene) */
  shadowBounds?: THREE.Box3;
  /** Progress callback (current step, total steps) - lower level callback */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Complete baked shadow data for a full day
 */
export interface BakedShadowData {
  /** Array of shadow depth textures (one per timestep) */
  shadowTextures: THREE.DepthTexture[];
  /** Sun direction vector for each timestep */
  sunDirections: THREE.Vector3[];
  /** Direct Normal Irradiance for each timestep (W/m²) */
  sunIntensities: number[];
  /** Shadow projection matrices (world → shadow map space) */
  shadowMatrices: THREE.Matrix4[];
  /** Number of time steps */
  timestepCount: number;
  /** Duration of each timestep in hours */
  timestepHours: number;
  /** Date of simulation */
  date: Date;
  /** Cleanup function */
  dispose: () => void;
}

/**
 * Renders shadow depth maps for sun positions throughout the day
 *
 * Algorithm:
 * 1. Calculate sun times (sunrise, sunset)
 * 2. Generate timestep positions from sunrise to sunset
 * 3. For each timestep:
 *    - Calculate sun position and direction
 *    - Position orthographic camera from sun's perspective
 *    - Render scene depth to shadow map
 *    - Store projection matrix for compute shader
 * 4. Return packed data structure with all shadow maps and metadata
 *
 * @example
 * const baker = new ShadowMapBaker(renderer, solarSimulator);
 * const shadowData = await baker.bakeShadowMaps(scene, new Date(), {
 *   resolution: 2048,
 *   timeStepMinutes: 15,
 *   onProgress: (current, total) => console.log(`${current}/${total}`)
 * });
 */
export class ShadowMapBaker {
  private renderer: THREE.WebGPURenderer;
  private solarSimulator: SolarSimulator;
  private shadowCamera: THREE.OrthographicCamera;
  private renderTargets: THREE.WebGLRenderTarget[];

  /**
   * Create a new shadow map baker
   *
   * @param renderer WebGPU renderer for shadow rendering
   * @param solarSimulator Solar simulator for sun position calculations
   */
  constructor(renderer: THREE.WebGPURenderer, solarSimulator: SolarSimulator) {
    this.renderer = renderer;
    this.solarSimulator = solarSimulator;
    this.renderTargets = [];

    // Create reusable shadow camera (will be positioned per timestep)
    this.shadowCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
  }

  /**
   * Bake shadow maps for entire day
   *
   * Generates a timeline of shadow depth maps from sunrise to sunset.
   *
   * @param scene Scene to render shadows from
   * @param date Date to simulate
   * @param options Baking configuration
   * @returns Complete shadow data for the day
   */
  public async bakeShadowMaps(
    scene: THREE.Scene,
    date: Date,
    options: ShadowMapBakeOptions = {}
  ): Promise<BakedShadowData> {
    const resolution = options.resolution ?? 2048;
    const timeStepMinutes = options.timeStepMinutes ?? 15;

    console.log(`🌅 Baking shadow maps for ${date.toDateString()}...`);
    console.log(`   Resolution: ${resolution}x${resolution}`);
    console.log(`   Time step: ${timeStepMinutes} minutes`);

    // Calculate shadow camera bounds from scene
    const shadowBounds = options.shadowBounds ?? this.calculateShadowBounds(scene);
    console.log(`   Shadow bounds:`, shadowBounds);

    // Get sun times for the day
    const location = this.solarSimulator.getLocation();
    const times = SunCalc.getTimes(date, location.latitude, location.longitude);

    if (!times.sunrise || !times.sunset) {
      throw new Error('Polar day/night detected - sun does not rise or set on this date');
    }

    // Generate timestep schedule
    const timesteps: Date[] = [];
    const currentTime = new Date(times.sunrise);
    const sunsetTime = new Date(times.sunset);

    while (currentTime <= sunsetTime) {
      timesteps.push(new Date(currentTime));
      currentTime.setMinutes(currentTime.getMinutes() + timeStepMinutes);
    }

    console.log(`   Timesteps: ${timesteps.length} (${times.sunrise.toLocaleTimeString()} → ${times.sunset.toLocaleTimeString()})`);

    // Prepare storage arrays
    const shadowTextures: THREE.DepthTexture[] = [];
    const sunDirections: THREE.Vector3[] = [];
    const sunIntensities: number[] = [];
    const shadowMatrices: THREE.Matrix4[] = [];

    // Store current renderer state
    const originalRenderTarget = this.renderer.getRenderTarget();

    // Bake each timestep
    for (let i = 0; i < timesteps.length; i++) {
      const timestep = timesteps[i];

      // Update sun position
      const sunPosition = this.solarSimulator.updateSunPosition(timestep);

      if (!sunPosition.isAboveHorizon) {
        // Skip timesteps where sun is below horizon (shouldn't happen in our range)
        continue;
      }

      // Setup shadow camera for this sun position
      this.setupShadowCamera(sunPosition.direction, shadowBounds);

      // Create render target for this timestep
      const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
        depthBuffer: true,
        depthTexture: new THREE.DepthTexture(resolution, resolution),
        stencilBuffer: false
      });
      this.renderTargets.push(renderTarget);

      // Render shadow depth map
      this.renderer.setRenderTarget(renderTarget);
      this.renderer.render(scene, this.shadowCamera);

      // Store shadow data (depthTexture is guaranteed to exist from config above)
      if (renderTarget.depthTexture) {
        shadowTextures.push(renderTarget.depthTexture);
      }
      sunDirections.push(sunPosition.direction.clone());
      sunIntensities.push(sunPosition.irradiance);

      // Calculate shadow matrix (world space → shadow map NDC)
      const shadowMatrix = new THREE.Matrix4();
      shadowMatrix.multiply(this.shadowCamera.projectionMatrix);
      shadowMatrix.multiply(this.shadowCamera.matrixWorldInverse);
      shadowMatrices.push(shadowMatrix);

      // Report progress
      if (options.onProgress) {
        options.onProgress(i + 1, timesteps.length);
      }

      if ((i + 1) % 10 === 0 || i === timesteps.length - 1) {
        console.log(`   Baked ${i + 1}/${timesteps.length} shadow maps`);
      }
    }

    // Restore renderer state
    this.renderer.setRenderTarget(originalRenderTarget);

    const timestepHours = timeStepMinutes / 60;

    console.log(`✅ Shadow map baking complete: ${shadowTextures.length} maps`);

    return {
      shadowTextures,
      sunDirections,
      sunIntensities,
      shadowMatrices,
      timestepCount: shadowTextures.length,
      timestepHours,
      date,
      dispose: () => {
        for (const rt of this.renderTargets) {
          rt.dispose();
        }
        this.renderTargets = [];
        console.log('🧹 Shadow maps disposed');
      }
    };
  }

  /**
   * Calculate optimal shadow camera bounds to cover entire scene
   *
   * Computes axis-aligned bounding box of all shadow-casting objects.
   *
   * @param scene Scene to analyze
   * @returns Bounding box enclosing all shadow casters
   */
  private calculateShadowBounds(scene: THREE.Scene): THREE.Box3 {
    const bounds = new THREE.Box3();

    scene.traverse((object) => {
      // Only include objects marked as shadow casters
      if (object.userData.shadowCaster === true && object instanceof THREE.Mesh) {
        // Update world matrix
        object.updateMatrixWorld(true);

        // Expand bounds by object's bounding box
        const objectBounds = new THREE.Box3().setFromObject(object);
        bounds.union(objectBounds);
      }
    });

    // Add padding (10% on each side)
    const size = bounds.getSize(new THREE.Vector3());
    const padding = size.multiplyScalar(0.1);
    bounds.min.sub(padding);
    bounds.max.add(padding);

    return bounds;
  }

  /**
   * Setup orthographic shadow camera for directional light
   *
   * Positions camera along sun direction and configures frustum to cover scene bounds.
   *
   * @param sunDirection Direction vector pointing from ground to sun
   * @param bounds Scene bounding box to cover
   */
  private setupShadowCamera(sunDirection: THREE.Vector3, bounds: THREE.Box3): void {
    // Get bounds center and size
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Position camera far away along sun direction
    const cameraDistance = maxDim * 2; // Far enough to see whole scene
    const cameraPosition = center.clone().add(
      sunDirection.clone().multiplyScalar(cameraDistance)
    );

    // Point camera at scene center
    this.shadowCamera.position.copy(cameraPosition);
    this.shadowCamera.lookAt(center);

    // Configure orthographic frustum to cover scene bounds
    // Use square frustum for consistent sampling in all directions
    const frustumSize = maxDim * 1.5; // Extra margin
    this.shadowCamera.left = -frustumSize;
    this.shadowCamera.right = frustumSize;
    this.shadowCamera.top = frustumSize;
    this.shadowCamera.bottom = -frustumSize;

    // Near/far planes
    this.shadowCamera.near = 0.1;
    this.shadowCamera.far = cameraDistance + maxDim;

    this.shadowCamera.updateProjectionMatrix();
    this.shadowCamera.updateMatrixWorld();
  }

  /**
   * Clean up render targets and resources
   */
  public dispose(): void {
    for (const rt of this.renderTargets) {
      rt.dispose();
    }
    this.renderTargets = [];
    console.log('🧹 ShadowMapBaker disposed');
  }
}
