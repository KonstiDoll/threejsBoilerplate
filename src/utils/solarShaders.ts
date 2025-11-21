/**
 * Solar Shader Nodes using Three.js TSL (Three Shading Language)
 *
 * Provides TSL-based shader nodes for solar irradiance visualization
 * with WebGPU renderer support.
 */

import { Fn, uniform, normalWorld, dot, max, mul, mix, vec3 } from 'three/tsl';
import * as THREE from 'three/webgpu';

/**
 * Configuration for heat map visualization
 */
export interface HeatMapConfig {
  /** Minimum irradiance value for color mapping (Wh/m² or W/m²) */
  minValue: number;
  /** Maximum irradiance value for color mapping (Wh/m² or W/m²) */
  maxValue: number;
  /** Low value color (cold/blue) */
  lowColor: THREE.Color;
  /** Middle value color (medium/green) */
  midColor: THREE.Color;
  /** High value color (hot/red) */
  highColor: THREE.Color;
}

/**
 * Default heat map configuration
 * Range: 0-5000 Wh/m²/day (typical daily solar exposure in Central Europe)
 * Colors: Blue (low) → Green (medium) → Red (high)
 */
export const DEFAULT_HEATMAP_CONFIG: HeatMapConfig = {
  minValue: 0,
  maxValue: 5000, // Wh/m²/day
  lowColor: new THREE.Color(0x0000ff), // Blue
  midColor: new THREE.Color(0x00ff00), // Green
  highColor: new THREE.Color(0xff0000) // Red
};

/**
 * Create TSL node for calculating solar irradiance on surfaces
 *
 * Calculates the irradiance (W/m²) on a surface based on:
 * - Surface normal (automatically from geometry)
 * - Sun direction (uniform vector)
 * - Sun intensity (uniform scalar)
 *
 * Uses Lambert's cosine law: I = I0 × max(0, cos(θ))
 *
 * @param sunDirection Uniform containing sun direction vector
 * @param sunIntensity Uniform containing solar irradiance (W/m²)
 * @returns TSL node outputting irradiance value
 */
export function createSolarIrradianceNode(
  sunDirection: any,
  sunIntensity: any
) {
  return Fn(() => {
    // Get surface normal in world space (automatically provided by Three.js)
    const surfaceNormal = normalWorld;

    // Calculate cosine of angle between sun and surface normal
    // max(0, ...) ensures only surfaces facing the sun receive irradiance
    const cosTheta = max(dot(surfaceNormal, sunDirection), 0.0);

    // Apply Lambert's cosine law: I = I0 × cos(θ)
    return mul(sunIntensity, cosTheta);
  })();
}

/**
 * Create TSL node for heat map color visualization
 *
 * Maps a scalar irradiance value to a color using a three-stop gradient
 * (low → mid → high color). Values are normalized to the configured range.
 *
 * @param irradianceValue TSL node providing the irradiance value to visualize
 * @param config Heat map configuration (range and colors)
 * @returns TSL node outputting RGB color
 */
export function createHeatMapColorNode(
  irradianceValue: any,
  config: HeatMapConfig = DEFAULT_HEATMAP_CONFIG
) {
  // Create uniforms for configuration
  const minVal = uniform(config.minValue);
  const maxVal = uniform(config.maxValue);
  const colorLow = uniform(config.lowColor);
  const colorMid = uniform(config.midColor);
  const colorHigh = uniform(config.highColor);

  return Fn(() => {
    // Normalize irradiance value to 0-1 range
    const range = maxVal.sub(minVal);
    const normalized = irradianceValue.sub(minVal).div(range).clamp(0, 1);

    // Create two-step gradient: low → mid → high
    // First step: 0.0-0.5 → low to mid
    // Second step: 0.5-1.0 → mid to high

    // Mix between low and mid color (0.0 to 0.5 range)
    const lowToMid = mix(colorLow, colorMid, normalized.mul(2.0).clamp(0, 1));

    // Mix between mid and high color (0.5 to 1.0 range)
    const midToHigh = mix(colorMid, colorHigh, normalized.sub(0.5).mul(2.0).clamp(0, 1));

    // Select appropriate gradient based on normalized value
    // If normalized < 0.5, use lowToMid, otherwise use midToHigh
    return mix(lowToMid, midToHigh, normalized.greaterThan(0.5));
  })();
}

/**
 * Create combined solar irradiance + heat map material node
 *
 * Combines real-time irradiance calculation with heat map visualization.
 * Useful for showing instantaneous solar exposure on surfaces.
 *
 * @param sunDirection Uniform containing sun direction vector
 * @param sunIntensity Uniform containing solar irradiance (W/m²)
 * @param config Optional heat map configuration
 * @returns TSL node outputting heat map color
 */
export function createRealTimeSolarHeatMapNode(
  sunDirection: any,
  sunIntensity: any,
  config: HeatMapConfig = DEFAULT_HEATMAP_CONFIG
) {
  // Calculate irradiance
  const irradiance = createSolarIrradianceNode(sunDirection, sunIntensity);

  // Map to heat map colors
  return createHeatMapColorNode(irradiance, config);
}

/**
 * Create cumulative heat map node
 *
 * For displaying accumulated solar energy over time (e.g., daily total).
 * Requires a uniform containing the pre-calculated cumulative value.
 *
 * @param cumulativeValue Uniform containing accumulated irradiance (Wh/m²)
 * @param config Optional heat map configuration
 * @returns TSL node outputting heat map color
 */
export function createCumulativeHeatMapNode(
  cumulativeValue: any,
  config: HeatMapConfig = DEFAULT_HEATMAP_CONFIG
) {
  return createHeatMapColorNode(cumulativeValue, config);
}

/**
 * Create solar material with base color and heat map overlay
 *
 * Blends a base material color with solar heat map visualization.
 * Useful for maintaining object appearance while showing solar analysis.
 *
 * @param baseColor Base material color (constant or node)
 * @param heatMapNode Heat map color node
 * @param heatMapStrength Blend factor (0 = only base, 1 = only heat map)
 * @returns TSL node outputting blended color
 */
export function createSolarOverlayNode(
  baseColor: THREE.Color | any,
  heatMapNode: any,
  heatMapStrength: number = 0.7
) {
  const baseColorNode = baseColor instanceof THREE.Color ? vec3(baseColor.r, baseColor.g, baseColor.b) : baseColor;
  const strength = uniform(heatMapStrength);

  return Fn(() => {
    return mix(baseColorNode, heatMapNode, strength);
  })();
}

/**
 * Utility: Convert W/m² to kW/m² for display
 */
export function wattsToKilowatts(watts: number): number {
  return watts / 1000;
}

/**
 * Utility: Convert Wh/m² to kWh/m² for display
 */
export function wattHoursToKilowattHours(wattHours: number): number {
  return wattHours / 1000;
}

/**
 * Utility: Format irradiance value for display
 */
export function formatIrradiance(value: number, unit: 'W' | 'kW' | 'Wh' | 'kWh' = 'W'): string {
  switch (unit) {
    case 'W':
      return `${value.toFixed(1)} W/m²`;
    case 'kW':
      return `${wattsToKilowatts(value).toFixed(2)} kW/m²`;
    case 'Wh':
      return `${value.toFixed(0)} Wh/m²`;
    case 'kWh':
      return `${wattHoursToKilowattHours(value).toFixed(2)} kWh/m²`;
  }
}

/**
 * Utility: Get color legend for heat map
 * Returns array of { value, color } for creating a legend UI
 */
export function getHeatMapLegend(config: HeatMapConfig = DEFAULT_HEATMAP_CONFIG, steps: number = 5) {
  const legend: Array<{ value: number; color: string }> = [];
  const range = config.maxValue - config.minValue;

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const value = config.minValue + t * range;

    // Calculate color (same logic as shader)
    let color: THREE.Color;
    if (t < 0.5) {
      // Low to mid
      const mixT = t * 2;
      color = new THREE.Color().lerpColors(config.lowColor, config.midColor, mixT);
    } else {
      // Mid to high
      const mixT = (t - 0.5) * 2;
      color = new THREE.Color().lerpColors(config.midColor, config.highColor, mixT);
    }

    legend.push({
      value,
      color: '#' + color.getHexString()
    });
  }

  return legend;
}
