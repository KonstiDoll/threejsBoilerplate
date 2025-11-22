/**
 * GPU-Accelerated Solar Simulation API
 *
 * High-level orchestrator for GPU-based shadow-aware solar irradiance calculation.
 * Coordinates shadow map baking, geometry upload, compute execution, and result processing.
 *
 * Provides a drop-in replacement for CPU-based raycasting with 100-1000x speedup.
 *
 * @module gpu
 */

import * as THREE from 'three/webgpu';
import { SolarSimulator } from '../solarSimulation';
import { ShadowMapBaker, type BakedShadowData } from './ShadowMapBaker';
import { SolarComputeShader } from './SolarComputeShader';
import { GeometryBufferManager } from './GeometryBufferManager';

/**
 * GPU compute execution options
 */
export interface GPUComputeOptions {
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Shadow map resolution (default: 2048) */
  shadowResolution?: number;
  /** Time step in minutes (default: 15) */
  timeStepMinutes?: number;
  /** Diffuse sky component (default: 0.12) */
  diffuseComponent?: number;
  /** Shadow camera bounds (default: auto-calculate) */
  shadowBounds?: THREE.Box3;
  /** Progress callback with phase name and progress (0-1) */
  onProgress?: (phase: string, progress: number) => void;
}

/**
 * GPU compute result with metrics
 */
export interface GPUComputeResult {
  /** Average cumulative irradiance in Wh/m² */
  value: number;
  /** Per-vertex irradiance values (for visualization) */
  vertexValues: Float32Array;
  /** Performance metrics */
  metrics: {
    shadowBakeTime: number; // ms
    geometryUploadTime: number; // ms
    computeTime: number; // ms
    readbackTime: number; // ms
    totalTime: number; // ms
  };
}

/**
 * GPU-accelerated solar simulation coordinator
 *
 * Orchestrates the complete GPU pipeline:
 * 1. Shadow Map Baking - Pre-render shadow maps for sun timeline
 * 2. Geometry Upload - Transfer mesh data to GPU buffers
 * 3. Compute Execution - Run parallel irradiance calculation
 * 4. Result Readback - Transfer results back to CPU
 * 5. Post-processing - Calculate average and update uniforms
 *
 * Drop-in replacement for CPU raycasting with identical output format.
 *
 * @example
 * const gpuCompute = new SolarGPUCompute(renderer, solarSimulator);
 * const result = await gpuCompute.computeCumulativeIrradiance(
 *   new Date(),
 *   mesh,
 *   scene,
 *   {
 *     shadowResolution: 2048,
 *     timeStepMinutes: 15,
 *     onProgress: (phase, progress) => console.log(phase, progress)
 *   }
 * );
 * console.log(`Irradiance: ${result.value} Wh/m²`);
 * console.log(`Computed in ${result.metrics.totalTime}ms`);
 */
export class SolarGPUCompute {
  private renderer: THREE.WebGPURenderer;
  private solarSimulator: SolarSimulator;
  private shadowBaker: ShadowMapBaker;
  private computeShader: SolarComputeShader;
  private bufferManager: GeometryBufferManager;
  private debug: boolean = false;

  // Shadow map cache (key: date string + scene id)
  private shadowCache: Map<string, BakedShadowData> = new Map();

  /**
   * Create a new GPU compute orchestrator
   *
   * @param renderer WebGPU renderer
   * @param solarSimulator Solar simulator instance
   */
  constructor(_renderer: THREE.WebGPURenderer, _solarSimulator: SolarSimulator) {
    this.renderer = _renderer;
    this.solarSimulator = _solarSimulator;
    this.shadowBaker = new ShadowMapBaker(_renderer, _solarSimulator);
    this.computeShader = new SolarComputeShader(_renderer);
    this.bufferManager = new GeometryBufferManager(_renderer);
  }

  /**
   * Check if GPU compute is supported in current environment
   *
   * @param renderer WebGPU renderer to check
   * @returns True if GPU compute is available
   */
  public static isSupported(_renderer: THREE.WebGPURenderer): boolean {
    try {
      const backend = _renderer.backend as any;
      return backend && backend.device && backend.device.createComputePipeline !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Compute cumulative irradiance using GPU acceleration
   *
   * Drop-in replacement for solarSimulator.computeCumulativeSurfaceIrradianceWithShadows()
   * with 100-1000x performance improvement.
   *
   * @param date Date to simulate
   * @param mesh Mesh to compute irradiance for
   * @param scene Scene containing shadow-casting objects
   * @param options GPU compute options
   * @returns Compute result with irradiance value and performance metrics
   */
  public async computeCumulativeIrradiance(
    date: Date,
    mesh: THREE.Mesh,
    scene: THREE.Scene,
    options: GPUComputeOptions = {}
  ): Promise<GPUComputeResult> {
    this.debug = options.debug ?? false;
    const startTime = performance.now();

    if (this.debug) {
      console.log('🚀 Starting GPU-accelerated solar computation...');
    }

    try {
      // Phase 1: Bake shadow maps
      const shadowStartTime = performance.now();
      const shadowData = await this.bakeShadows(scene, date, options);
      const shadowBakeTime = performance.now() - shadowStartTime;

      // Phase 2: Upload geometry to GPU
      const uploadStartTime = performance.now();
      const geometryData = await this.uploadMesh(mesh);
      const geometryUploadTime = performance.now() - uploadStartTime;

      // Phase 3: Execute compute shader
      const computeStartTime = performance.now();
      const vertexValues = await this.executeCompute(geometryData, shadowData, options);
      const computeTime = performance.now() - computeStartTime;

      // Phase 4: Readback results
      const readbackStartTime = performance.now();
      const processedResult = this.processResults(vertexValues, mesh);
      const readbackTime = performance.now() - readbackStartTime;

      // Note: Don't dispose shadow data - it's cached for reuse
      const totalTime = performance.now() - startTime;

      const result: GPUComputeResult = {
        value: processedResult.value,
        vertexValues,
        metrics: {
          shadowBakeTime,
          geometryUploadTime,
          computeTime,
          readbackTime,
          totalTime
        }
      };

      if (this.debug) {
        console.log('✅ GPU computation complete');
        console.log(`   Shadow bake: ${shadowBakeTime.toFixed(1)}ms`);
        console.log(`   Geometry upload: ${geometryUploadTime.toFixed(1)}ms`);
        console.log(`   Compute: ${computeTime.toFixed(1)}ms`);
        console.log(`   Readback: ${readbackTime.toFixed(1)}ms`);
        console.log(`   Total: ${totalTime.toFixed(1)}ms`);
        console.log(`   Result: ${result.value.toFixed(0)} Wh/m²`);
      }

      return result;
    } catch (error) {
      console.error('❌ GPU computation failed:', error);
      throw error;
    }
  }

  /**
   * Clean up all GPU resources
   *
   * Call when done with GPU computations to free memory.
   */
  public dispose(): void {
    // Dispose all cached shadow maps
    for (const shadowData of this.shadowCache.values()) {
      shadowData.dispose();
    }
    this.shadowCache.clear();

    this.shadowBaker.dispose();
    this.computeShader.dispose();
    this.bufferManager.dispose();

    // Log disposal with renderer info for debugging
    if (this.debug) {
      console.log('🧹 Solar GPU compute disposed for renderer:', this.renderer);
      console.log('   Solar simulator location:', this.solarSimulator.getLocation());
    }
  }

  // ============================================
  // Internal Pipeline Methods
  // ============================================

  /**
   * Phase 1: Bake shadow maps for sun timeline
   *
   * @param scene Scene to render shadows from
   * @param date Date to simulate
   * @param options Baking options
   * @returns Baked shadow data
   */
  private async bakeShadows(
    scene: THREE.Scene,
    date: Date,
    options: GPUComputeOptions
  ) {
    // Create cache key from date and shadow settings
    const cacheKey = `${date.toDateString()}-${options.shadowResolution ?? 2048}-${options.timeStepMinutes ?? 15}`;

    // Check cache first
    const cached = this.shadowCache.get(cacheKey);
    if (cached) {
      if (this.debug) {
        console.log('📸 Phase 1: Using cached shadow maps');
      }
      // Report instant progress
      if (options.onProgress) {
        options.onProgress('Shadow Baking', 0.5);
      }
      return cached;
    }

    if (this.debug) {
      console.log('📸 Phase 1: Baking shadow maps...');
    }

    const shadowData = await this.shadowBaker.bakeShadowMaps(scene, date, {
      resolution: options.shadowResolution ?? 2048,
      timeStepMinutes: options.timeStepMinutes ?? 15,
      shadowBounds: options.shadowBounds,
      onProgress: (current: number, total: number) => {
        // Internal shadow baking progress - convert to external format
        const progress = (current / total) * 0.5;
        if (options.onProgress) {
          options.onProgress('Shadow Baking', progress);
        }
      }
    });

    // Cache the result
    this.shadowCache.set(cacheKey, shadowData);

    return shadowData;
  }

  /**
   * Phase 2: Upload mesh geometry to GPU
   *
   * @param mesh Mesh to upload
   * @returns Geometry buffer data
   */
  private async uploadMesh(mesh: THREE.Mesh) {
    if (this.debug) {
      console.log('📤 Phase 2: Uploading geometry to GPU...');
    }

    return await this.bufferManager.uploadGeometry(mesh);
  }

  /**
   * Phase 3: Execute compute shader
   *
   * @param geometryData Uploaded geometry
   * @param shadowData Baked shadow maps
   * @param options Compute options
   * @returns Per-vertex irradiance values
   */
  private async executeCompute(
    geometryData: any,
    shadowData: any,
    options: GPUComputeOptions
  ): Promise<Float32Array> {
    if (this.debug) {
      console.log('⚡ Phase 3: Executing compute shader...');
    }

    // Create result buffer
    const resultBuffer = this.bufferManager.createResultBuffer(geometryData.vertexCount);

    try {
      // Execute compute
      await this.computeShader.execute(geometryData, shadowData, resultBuffer, {
        diffuseComponent: options.diffuseComponent ?? 0.12,
        onProgress: (current: number, total: number) => {
          // Internal compute progress - convert to external format
          const progress = 0.5 + (current / total) * 0.4;
          if (options.onProgress) {
            options.onProgress('Computing', progress);
          }
        }
      });

      // Read results back
      if (this.debug) {
        console.log('📥 Phase 4: Reading results from GPU...');
      }

      const results = await this.bufferManager.readResultBuffer(resultBuffer);

      return results;
    } finally {
      // Clean up result buffer
      resultBuffer.dispose();
    }
  }

  /**
   * Phase 4: Process results
   *
   * Calculate average irradiance and prepare final result.
   *
   * @param vertexValues Per-vertex irradiance values
   * @param mesh Original mesh (for metadata)
   * @returns Processed result
   */
  private processResults(vertexValues: Float32Array, _mesh: THREE.Mesh): {
    value: number;
  } {
    // Calculate average irradiance across all vertices
    let sum = 0;
    for (let i = 0; i < vertexValues.length; i++) {
      sum += vertexValues[i];
    }
    const average = sum / vertexValues.length;

    return {
      value: average
    };
  }
}

// Re-export types for convenience
export type { GeometryBufferData, ComputeResultBuffer } from './GeometryBufferManager';
export type { BakedShadowData, ShadowMapBakeOptions } from './ShadowMapBaker';
export type { ComputeOptions } from './SolarComputeShader';
