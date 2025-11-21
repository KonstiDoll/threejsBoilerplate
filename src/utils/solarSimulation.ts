/**
 * Solar Simulation Utility for Three.js WebGPU
 *
 * Provides accurate sun position calculation based on geographic coordinates and time,
 * integrated with Three.js for realistic lighting and solar irradiance visualization.
 *
 * Uses SunCalc library for astronomical calculations.
 */

import * as SunCalc from 'suncalc';
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Configuration for solar simulation
 */
export interface SolarConfig {
  /** Latitude in degrees (-90 to 90, positive = North) */
  latitude: number;
  /** Longitude in degrees (-180 to 180, positive = East) */
  longitude: number;
  /** Optional altitude above sea level in meters (affects atmospheric calculations) */
  altitude?: number;
}

/**
 * Solar position data
 */
export interface SolarPosition {
  /** Azimuth angle in radians (0 = south, PI/2 = west, PI = north, 3PI/2 = east) */
  azimuth: number;
  /** Altitude/elevation angle in radians (0 = horizon, PI/2 = zenith) */
  altitude: number;
  /** Sun direction as normalized Three.js vector (Y-up coordinate system) */
  direction: THREE.Vector3;
  /** Solar irradiance in W/m² (direct normal irradiance) */
  irradiance: number;
  /** Whether sun is above horizon */
  isAboveHorizon: boolean;
}

/**
 * Daily solar analysis results
 */
export interface DailySolarAnalysis {
  /** Date of analysis */
  date: Date;
  /** Sunrise time */
  sunrise: Date;
  /** Sunset time */
  sunset: Date;
  /** Solar noon (maximum altitude) */
  solarNoon: Date;
  /** Day length in hours */
  dayLength: number;
  /** Maximum sun altitude in radians */
  maxAltitude: number;
  /** Total daily irradiance in Wh/m² (horizontal surface) */
  totalIrradiance: number;
}

/**
 * Main Solar Simulator class
 *
 * Handles sun position calculations and Three.js integration for solar simulations.
 * Provides both real-time updates and daily accumulation analysis.
 */
export class SolarSimulator {
  private config: SolarConfig;

  // TSL Uniforms for shader integration
  public readonly sunDirection = uniform(new THREE.Vector3(0, 1, 0));
  public readonly sunIntensity = uniform(1000.0); // W/m²
  public readonly cumulativeIrradiance = uniform(0.0); // Wh/m² (for cumulative visualization)

  // Current state
  private currentPosition: SolarPosition | null = null;

  /**
   * Create a new solar simulator
   * @param config Solar configuration with location
   */
  constructor(config: SolarConfig) {
    this.config = config;
  }

  /**
   * Update sun position for a specific date and time
   * @param date Date and time for calculation
   * @returns Current solar position data
   */
  public updateSunPosition(date: Date): SolarPosition {
    // Get sun position from SunCalc
    const position = SunCalc.getPosition(date, this.config.latitude, this.config.longitude);

    // Convert to Three.js coordinate system
    const direction = this.azimuthAltitudeToVector3(position.azimuth, position.altitude);

    // Calculate solar irradiance with atmospheric attenuation
    const irradiance = this.calculateIrradiance(position.altitude);

    // Update uniforms for shader integration
    this.sunDirection.value.copy(direction);
    this.sunIntensity.value = irradiance;

    // Store current position
    this.currentPosition = {
      azimuth: position.azimuth,
      altitude: position.altitude,
      direction: direction.clone(),
      irradiance,
      isAboveHorizon: position.altitude > 0
    };

    return this.currentPosition;
  }

  /**
   * Get current solar position (last updated value)
   */
  public getCurrentPosition(): SolarPosition | null {
    return this.currentPosition;
  }

  /**
   * Get sun times for a specific date
   * @param date Date for calculation
   * @returns Object with sunrise, sunset, solar noon, etc.
   */
  public getSunTimes(date: Date) {
    return SunCalc.getTimes(date, this.config.latitude, this.config.longitude, this.config.altitude);
  }

  /**
   * Analyze full day solar exposure
   * Simulates sun position from sunrise to sunset in time steps
   *
   * @param date Date to analyze
   * @param timeStepMinutes Time step in minutes (default: 15)
   * @returns Daily solar analysis with cumulative irradiance
   */
  public async analyzeDailySolarExposure(
    date: Date,
    timeStepMinutes: number = 15
  ): Promise<DailySolarAnalysis> {
    // Get sun times for the day
    const times = this.getSunTimes(date);

    if (!times.sunrise || !times.sunset) {
      // Handle polar day/night (sun never rises or never sets)
      throw new Error('Polar day/night detected - sun does not rise or set on this date at this location');
    }

    // Initialize accumulator
    let totalIrradiance = 0;
    let maxAltitude = -Infinity;
    let sampleCount = 0;

    // Iterate from sunrise to sunset
    const currentTime = new Date(times.sunrise);
    const sunsetTime = new Date(times.sunset);

    while (currentTime <= sunsetTime) {
      // Get sun position for current time
      const position = SunCalc.getPosition(currentTime, this.config.latitude, this.config.longitude);

      if (position.altitude > 0) {
        // Calculate irradiance for horizontal surface
        const irradiance = this.calculateIrradiance(position.altitude);
        const cosTheta = Math.max(0, Math.sin(position.altitude)); // For horizontal surface
        const effectiveIrradiance = irradiance * cosTheta;

        // Accumulate energy (Wh/m² = W/m² × hours)
        totalIrradiance += effectiveIrradiance * (timeStepMinutes / 60);

        // Track maximum altitude
        maxAltitude = Math.max(maxAltitude, position.altitude);
        sampleCount++;
      }

      // Advance time
      currentTime.setMinutes(currentTime.getMinutes() + timeStepMinutes);
    }

    // Calculate day length in hours
    const dayLength = (sunsetTime.getTime() - times.sunrise.getTime()) / (1000 * 60 * 60);

    return {
      date,
      sunrise: times.sunrise,
      sunset: times.sunset,
      solarNoon: times.solarNoon,
      dayLength,
      maxAltitude,
      totalIrradiance
    };
  }

  /**
   * Calculate irradiance for a surface based on sun direction and surface normal
   * @param surfaceNormal Surface normal vector (normalized)
   * @returns Irradiance in W/m²
   */
  public calculateSurfaceIrradiance(surfaceNormal: THREE.Vector3): number {
    if (!this.currentPosition || !this.currentPosition.isAboveHorizon) {
      return 0;
    }

    // Calculate cosine of angle between sun and surface normal
    const cosTheta = Math.max(0, surfaceNormal.dot(this.currentPosition.direction));

    // Apply Lambert's cosine law: I = I0 × cos(θ)
    return this.currentPosition.irradiance * cosTheta;
  }

  /**
   * Update location configuration
   * @param config New solar configuration
   */
  public updateLocation(config: SolarConfig): void {
    this.config = config;
    // Current position will be updated on next updateSunPosition call
  }

  /**
   * Get current location configuration
   */
  public getLocation(): SolarConfig {
    return { ...this.config };
  }

  /**
   * Convert azimuth and altitude angles to Three.js Vector3
   * Handles coordinate system conversion from SunCalc to Three.js
   *
   * @param azimuth Azimuth in radians (SunCalc format: 0 = south)
   * @param altitude Altitude in radians (0 = horizon, PI/2 = zenith)
   * @returns Normalized direction vector in Three.js Y-up coordinates
   */
  private azimuthAltitudeToVector3(azimuth: number, altitude: number): THREE.Vector3 {
    // SunCalc azimuth: 0 = south, PI/2 = west, PI = north, 3PI/2 = east
    // Three.js: Y-up, Z-forward (south), X-right (east)

    // Adjust azimuth to Three.js coordinate system
    // Rotate by PI to align: SunCalc south (0) → Three.js -Z
    const adjustedAzimuth = azimuth + Math.PI;

    // Convert spherical to Cartesian coordinates
    const x = Math.cos(altitude) * Math.sin(adjustedAzimuth);
    const y = Math.sin(altitude);
    const z = Math.cos(altitude) * Math.cos(adjustedAzimuth);

    return new THREE.Vector3(x, y, z).normalize();
  }

  /**
   * Calculate solar irradiance with atmospheric attenuation
   *
   * Uses simplified atmospheric model based on air mass
   * @param altitude Sun altitude in radians
   * @returns Direct normal irradiance in W/m²
   */
  private calculateIrradiance(altitude: number): number {
    if (altitude <= 0) {
      return 0; // Sun below horizon
    }

    // Solar constant (extraterrestrial irradiance)
    const solarConstant = 1361; // W/m²

    // Calculate air mass using simplified Kasten-Young formula
    // AM = 1 / (cos(zenith) + 0.50572 × (96.07995 - zenith)^-1.6364)
    const zenith = Math.PI / 2 - altitude;
    const zenithDeg = zenith * 180 / Math.PI;

    let airMass: number;
    if (zenithDeg < 90) {
      airMass = 1 / (Math.cos(zenith) + 0.50572 * Math.pow(96.07995 - zenithDeg, -1.6364));
    } else {
      return 0; // Sun below horizon
    }

    // Simplified atmospheric attenuation
    // Clear sky: DNI ≈ 1000 W/m² at AM 1.5 (typical conditions)
    // Using exponential model: I = I0 × exp(-0.14 × AM)
    const atmosphericTransmittance = Math.exp(-0.14 * airMass);

    // Calculate direct normal irradiance
    const dni = solarConstant * atmosphericTransmittance;

    // Clamp to realistic values (0-1200 W/m²)
    return Math.max(0, Math.min(1200, dni));
  }

  /**
   * Compute cumulative solar irradiance for a specific surface orientation
   *
   * Calculates the total accumulated solar energy (Wh/m²) that a surface
   * with a given normal vector receives over the course of a day.
   *
   * This is crucial for:
   * - Architectural solar analysis (which facades receive most sunlight)
   * - Solar panel optimization
   * - Heat load calculations
   *
   * @param date Date to analyze
   * @param surfaceNormal Surface normal vector (normalized, e.g., (0,1,0) for horizontal)
   * @param timeStepMinutes Time step in minutes (default: 15)
   * @returns Total accumulated irradiance in Wh/m² for the day
   */
  public async computeCumulativeSurfaceIrradiance(
    date: Date,
    surfaceNormal: THREE.Vector3,
    timeStepMinutes: number = 15
  ): Promise<number> {
    // Ensure normal is normalized
    const normal = surfaceNormal.clone().normalize();

    // Get sun times for the day
    const times = this.getSunTimes(date);

    if (!times.sunrise || !times.sunset) {
      // Handle polar day/night
      return 0;
    }

    // Initialize accumulator
    let totalIrradiance = 0;

    // Iterate from sunrise to sunset
    const currentTime = new Date(times.sunrise);
    const sunsetTime = new Date(times.sunset);

    while (currentTime <= sunsetTime) {
      // Get sun position for current time
      const position = SunCalc.getPosition(currentTime, this.config.latitude, this.config.longitude);

      if (position.altitude > 0) {
        // Calculate sun direction vector
        const sunDir = this.azimuthAltitudeToVector3(position.azimuth, position.altitude);

        // Calculate irradiance with atmospheric model
        const dni = this.calculateIrradiance(position.altitude);

        // Apply Lambert's cosine law for this surface
        const cosTheta = Math.max(0, normal.dot(sunDir));
        const effectiveIrradiance = dni * cosTheta;

        // Accumulate energy (Wh/m² = W/m² × hours)
        totalIrradiance += effectiveIrradiance * (timeStepMinutes / 60);
      }

      // Advance time
      currentTime.setMinutes(currentTime.getMinutes() + timeStepMinutes);
    }

    return totalIrradiance;
  }

  /**
   * Compute cumulative solar irradiance with shadow occlusion
   *
   * This method extends the basic cumulative calculation by considering shadows
   * cast by other objects in the scene. Uses raycasting to detect occlusions and
   * applies a diffuse sky component for shadowed areas.
   *
   * Algorithm:
   * 1. For each time step (sunrise to sunset):
   *    - Update sun position and direction
   *    - For each sample point on the mesh:
   *      * Cast ray from surface point towards sun
   *      * If occluded: apply 12% diffuse irradiance
   *      * If not occluded: apply full direct irradiance with Lambert's cosine law
   *    - Average irradiance across all sample points
   *    - Accumulate energy (Wh/m² = W/m² × hours)
   *
   * @param date Date to analyze
   * @param mesh Mesh to calculate irradiance for
   * @param scene Scene containing occluding objects
   * @param options Configuration options
   * @returns Total accumulated irradiance in Wh/m² considering shadows
   */
  public async computeCumulativeSurfaceIrradianceWithShadows(
    date: Date,
    mesh: THREE.Mesh,
    scene: THREE.Scene,
    options: {
      /** Number of sample points per mesh (default: 9 = 3×3 grid) */
      samplePoints?: number,
      /** Diffuse sky irradiance as fraction of direct (default: 0.12 = 12%) */
      diffuseComponent?: number,
      /** Time step in minutes (default: 15) */
      timeStepMinutes?: number,
      /** Progress callback (timestep, total) */
      onProgress?: (current: number, total: number) => void,
      /** Group to exclude from occlusion testing (e.g., plane group containing sub-meshes) */
      excludeGroup?: THREE.Group,
      /** Enable debug ray visualization (default: false) */
      debugVisualization?: boolean,
      /** Scene to add debug arrows to */
      debugScene?: THREE.Scene,
      /** Only visualize rays at this specific timestep index (default: visualize all) */
      debugTimestepIndex?: number
    } = {}
  ): Promise<number> {
    const samplePoints = options.samplePoints ?? 9;
    const diffuseComponent = options.diffuseComponent ?? 0.12;
    const timeStepMinutes = options.timeStepMinutes ?? 15;

    // Get sun times for the day
    const times = this.getSunTimes(date);

    if (!times.sunrise || !times.sunset) {
      // Handle polar day/night
      return 0;
    }

    // Generate sample points on mesh surface
    const samples = this.generateSamplePoints(mesh, samplePoints);

    // Initialize raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.far = 10000; // 10km max distance

    // Initialize accumulator
    let totalIrradiance = 0;

    // Iterate from sunrise to sunset
    const currentTime = new Date(times.sunrise);
    const sunsetTime = new Date(times.sunset);

    let timestep = 0;
    const totalTimesteps = Math.ceil((sunsetTime.getTime() - times.sunrise.getTime()) / (timeStepMinutes * 60 * 1000));

    while (currentTime <= sunsetTime) {
      // Get sun position for current time
      const position = SunCalc.getPosition(currentTime, this.config.latitude, this.config.longitude);

      if (position.altitude > 0) {
        // Calculate sun direction vector
        const sunDir = this.azimuthAltitudeToVector3(position.azimuth, position.altitude);

        // Calculate direct normal irradiance with atmospheric model
        const dni = this.calculateIrradiance(position.altitude);

        // Calculate average irradiance across all sample points
        let sampleIrradianceSum = 0;

        for (const sample of samples) {
          // Calculate cosine of angle between sun and surface normal
          const cosTheta = Math.max(0, sample.normal.dot(sunDir));

          if (cosTheta > 0) {
            // Surface faces sun, check for occlusion

            // Offset ray origin to prevent self-intersection
            const rayOrigin = sample.point.clone().addScaledVector(sample.normal, 0.01);

            // Shadow ray direction: Surface → Sun (same as sunDir, no negation!)
            // sunDir already points FROM surface TO sun (upward when altitude > 0)
            raycaster.set(rayOrigin, sunDir);

            // Check for intersections with other objects
            const intersects = raycaster.intersectObjects(scene.children, true);

            // Filter out self-intersections, excluded group members, and non-shadow-casters
            const validHits = intersects.filter(hit => {
              // Don't count the mesh itself
              if (hit.object === mesh) return false;

              // Don't count other meshes in the same excluded group (e.g., plane sub-meshes)
              if (options.excludeGroup) {
                // Check if hit object is a direct child of the excluded group
                if (hit.object.parent === options.excludeGroup) {
                  return false;
                }
                // Also check if the hit object IS the excluded group itself
                if (hit.object === options.excludeGroup) {
                  return false;
                }
              }

              // CRITICAL: Only count objects explicitly marked as shadow casters
              // This prevents TransformControls, helpers, and other UI elements from blocking sunlight
              if (hit.object.userData.shadowCaster !== true) {
                return false;
              }

              // Count as occluded if hit is far enough away (not floating point error)
              return hit.distance > 0.01;
            });

            const occluded = validHits.length > 0;

            // Visualize rays for debugging
            if (options.debugVisualization && options.debugScene) {
              // Only visualize if no specific timestep specified, or if this is the target timestep
              const shouldVisualize = options.debugTimestepIndex === undefined ||
                                     options.debugTimestepIndex === timestep;

              if (shouldVisualize) {
                const arrowColor = occluded ? 0xff0000 : 0x00ff00; // Red = shadow, Green = sun
                const arrowLength = occluded && validHits[0] ? validHits[0].distance : 5;

                const arrow = new THREE.ArrowHelper(
                  sunDir,  // Use sunDir directly (points toward sun)
                  rayOrigin,
                  Math.min(arrowLength, 10), // Cap at 10m for visibility
                  arrowColor,
                  0.3, // head length
                  0.2  // head width
                );
                arrow.name = 'DebugRay';
                options.debugScene.add(arrow);

                // If occluded, add a small sphere at hit point
                if (occluded && validHits[0]) {
                  const hitPoint = validHits[0].point;
                  const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.1),
                    new THREE.MeshBasicMaterial({ color: 0xff0000 })
                  );
                  sphere.position.copy(hitPoint);
                  sphere.name = 'DebugHitPoint';
                  options.debugScene.add(sphere);
                }
              }
            }

            let effectiveIrradiance: number;
            if (occluded) {
              // Shadowed: only diffuse sky irradiance
              effectiveIrradiance = dni * diffuseComponent;
            } else {
              // Direct sunlight: full irradiance with Lambert's cosine law
              effectiveIrradiance = dni * cosTheta;
            }

            sampleIrradianceSum += effectiveIrradiance;
          } else {
            // Surface faces away from sun: only diffuse component
            sampleIrradianceSum += dni * diffuseComponent * 0.5; // Reduced diffuse for back-facing
          }
        }

        // Average across sample points
        const avgIrradiance = sampleIrradianceSum / samples.length;

        // Accumulate energy (Wh/m² = W/m² × hours)
        totalIrradiance += avgIrradiance * (timeStepMinutes / 60);
      }

      // Advance time
      currentTime.setMinutes(currentTime.getMinutes() + timeStepMinutes);
      timestep++;

      // Report progress
      if (options.onProgress) {
        options.onProgress(timestep, totalTimesteps);
      }
    }

    return totalIrradiance;
  }

  /**
   * Generate deterministic grid-based barycentric coordinates for triangle sampling
   *
   * Instead of random sampling, uses a regular grid pattern for reproducible results.
   * This ensures that the same mesh with the same sample count always produces
   * identical sample points, making simulations deterministic.
   *
   * @param count Target number of sample points
   * @returns Array of barycentric coordinate pairs [u, v] where u+v ≤ 1, w = 1-u-v
   */
  private generateGridBarycentric(count: number): Array<{ u: number; v: number }> {
    const samples: Array<{ u: number; v: number }> = [];

    if (count === 1) {
      // Single sample: triangle centroid (most representative point)
      samples.push({ u: 1/3, v: 1/3 });
      return samples;
    }

    // Calculate grid size (approximate square root)
    // Triangle occupies half of a square in barycentric space, so we need denser grid
    const gridSize = Math.ceil(Math.sqrt(count * 2));

    // Generate grid points in barycentric space (u, v coordinates)
    // Valid region: u ≥ 0, v ≥ 0, u+v ≤ 1
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize - i; j++) {
        const u = i / gridSize;
        const v = j / gridSize;

        // Only include points inside triangle (u + v ≤ 1)
        if (u + v <= 1) {
          samples.push({ u, v });

          // Stop when we have enough samples
          if (samples.length >= count) {
            return samples;
          }
        }
      }
    }

    return samples;
  }

  /**
   * Generate sample points on mesh surface for shadow ray testing
   *
   * Samples points directly from the mesh faces with proper normals.
   * Uses DETERMINISTIC grid-based sampling (not random) for reproducible results.
   *
   * @param mesh Mesh to sample
   * @param count Approximate number of sample points
   * @returns Array of sample points with positions and normals
   */
  private generateSamplePoints(
    mesh: THREE.Mesh,
    count: number
  ): Array<{ point: THREE.Vector3; normal: THREE.Vector3 }> {
    const samples: Array<{ point: THREE.Vector3; normal: THREE.Vector3 }> = [];

    // Get mesh geometry
    const geometry = mesh.geometry;
    if (!geometry.attributes.position || !geometry.index) {
      console.warn('Mesh has no position attribute or index');
      return samples;
    }

    // Ensure normals are computed
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const indices = geometry.index;

    // Calculate how many samples per face
    const faceCount = indices.count / 3;
    const samplesPerFace = Math.max(1, Math.ceil(count / faceCount));

    // Generate deterministic grid-based barycentric coordinates
    const barycentricGrid = this.generateGridBarycentric(samplesPerFace);

    // Get world matrix for transformations
    mesh.updateMatrixWorld(true);
    const worldMatrix = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    // Sample from each face
    for (let i = 0; i < indices.count; i += 3) {
      // Get triangle vertices
      const i0 = indices.getX(i);
      const i1 = indices.getX(i + 1);
      const i2 = indices.getX(i + 2);

      const v0 = new THREE.Vector3(
        positions.getX(i0),
        positions.getY(i0),
        positions.getZ(i0)
      );
      const v1 = new THREE.Vector3(
        positions.getX(i1),
        positions.getY(i1),
        positions.getZ(i1)
      );
      const v2 = new THREE.Vector3(
        positions.getX(i2),
        positions.getY(i2),
        positions.getZ(i2)
      );

      // Get vertex normals
      const n0 = new THREE.Vector3(
        normals.getX(i0),
        normals.getY(i0),
        normals.getZ(i0)
      );
      const n1 = new THREE.Vector3(
        normals.getX(i1),
        normals.getY(i1),
        normals.getZ(i1)
      );
      const n2 = new THREE.Vector3(
        normals.getX(i2),
        normals.getY(i2),
        normals.getZ(i2)
      );

      // Sample points on this triangle using deterministic grid barycentric coordinates
      for (const bary of barycentricGrid) {
        const u = bary.u;
        const v = bary.v;
        const w = 1 - u - v;

        // Interpolate position using barycentric coordinates
        const point = new THREE.Vector3()
          .addScaledVector(v0, u)
          .addScaledVector(v1, v)
          .addScaledVector(v2, w);

        // Transform to world space
        point.applyMatrix4(worldMatrix);

        // Interpolate normal using barycentric coordinates
        const normal = new THREE.Vector3()
          .addScaledVector(n0, u)
          .addScaledVector(n1, v)
          .addScaledVector(n2, w);

        // Transform normal to world space
        normal.applyMatrix3(normalMatrix).normalize();

        samples.push({ point, normal });

        // Early exit if we have enough samples
        if (samples.length >= count) {
          return samples;
        }
      }
    }

    return samples;
  }

  /**
   * Convert radians to degrees (utility)
   */
  public static radToDeg(rad: number): number {
    return rad * 180 / Math.PI;
  }

  /**
   * Convert degrees to radians (utility)
   */
  public static degToRad(deg: number): number {
    return deg * Math.PI / 180;
  }
}
