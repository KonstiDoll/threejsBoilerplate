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
