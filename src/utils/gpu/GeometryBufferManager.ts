/**
 * GPU Buffer Management for Solar Simulation
 *
 * Manages the lifecycle of GPU buffers for geometry data upload and compute results.
 * Provides efficient buffer caching and memory management for WebGPU compute operations.
 *
 * @module GeometryBufferManager
 */

import * as THREE from 'three/webgpu';

/**
 * GPU buffer data for uploaded mesh geometry
 */
export interface GeometryBufferData {
  /** Position buffer (xyz per vertex) */
  positionBuffer: GPUBuffer;
  /** Normal buffer (xyz per vertex) */
  normalBuffer: GPUBuffer;
  /** Optional index buffer for indexed geometry */
  indexBuffer?: GPUBuffer;
  /** Total number of vertices */
  vertexCount: number;
  /** Bounding box in world space (for shadow camera setup) */
  bounds: THREE.Box3;
  /** Cleanup function */
  dispose: () => void;
}

/**
 * GPU buffer for compute shader results
 */
export interface ComputeResultBuffer {
  /** Storage buffer for per-vertex irradiance values */
  irradianceBuffer: GPUBuffer;
  /** Staging buffer for GPU→CPU readback */
  stagingBuffer: GPUBuffer;
  /** Pre-allocated array for results */
  resultArray: Float32Array;
  /** Cleanup function */
  dispose: () => void;
}

/**
 * Manages GPU buffer allocation, upload, and cleanup for solar simulation
 *
 * Responsibilities:
 * - Upload Three.js mesh geometry to GPU storage buffers
 * - Manage buffer lifecycle (create, cache, dispose)
 * - Transform geometry to world space
 * - Provide efficient buffer reuse via caching
 *
 * @example
 * const manager = new GeometryBufferManager(renderer);
 * const geometryData = await manager.uploadGeometry(mesh);
 * // ... use in compute shader ...
 * manager.dispose(); // cleanup
 */
export class GeometryBufferManager {
  private device: GPUDevice;
  private bufferCache: WeakMap<THREE.BufferGeometry, GeometryBufferData>;
  private allocatedBuffers: GPUBuffer[];

  /**
   * Create a new geometry buffer manager
   * @param renderer WebGPU renderer (provides GPU device)
   */
  constructor(renderer: THREE.WebGPURenderer) {
    // Access GPU device from WebGPU renderer
    const backend = renderer.backend as any;
    if (!backend.device) {
      throw new Error('WebGPU device not initialized. Ensure renderer.init() was called.');
    }

    this.device = backend.device;
    this.bufferCache = new WeakMap();
    this.allocatedBuffers = [];
  }

  /**
   * Upload mesh geometry to GPU storage buffers
   *
   * Transforms geometry to world space and uploads positions and normals.
   * Results are cached per geometry for efficient reuse.
   *
   * @param mesh Mesh to upload
   * @returns GPU buffer data with positions, normals, and metadata
   */
  public async uploadGeometry(mesh: THREE.Mesh): Promise<GeometryBufferData> {
    const geometry = mesh.geometry;

    // Check cache first
    if (this.bufferCache.has(geometry)) {
      return this.bufferCache.get(geometry)!;
    }

    // Ensure geometry has normals
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    // Extract and transform geometry data to world space
    const { positions, normals } = this.extractGeometryData(mesh);

    // Calculate world-space bounding box
    const bounds = new THREE.Box3();
    for (let i = 0; i < positions.length; i += 3) {
      bounds.expandByPoint(new THREE.Vector3(
        positions[i],
        positions[i + 1],
        positions[i + 2]
      ));
    }

    // Create GPU buffers
    const positionBuffer = this.createStorageBuffer(
      positions,
      'Solar Geometry Positions'
    );
    const normalBuffer = this.createStorageBuffer(
      normals,
      'Solar Geometry Normals'
    );

    const bufferData: GeometryBufferData = {
      positionBuffer,
      normalBuffer,
      vertexCount: positions.length / 3,
      bounds,
      dispose: () => {
        positionBuffer.destroy();
        normalBuffer.destroy();
        this.allocatedBuffers = this.allocatedBuffers.filter(
          b => b !== positionBuffer && b !== normalBuffer
        );
      }
    };

    // Cache for reuse
    this.bufferCache.set(geometry, bufferData);

    console.log(`📤 Uploaded geometry: ${bufferData.vertexCount} vertices`);
    return bufferData;
  }

  /**
   * Create output buffer for compute shader results
   *
   * Allocates both a storage buffer (GPU-side) and staging buffer (for readback).
   *
   * @param vertexCount Number of vertices (one irradiance value per vertex)
   * @returns Compute result buffers with pre-allocated array
   */
  public createResultBuffer(vertexCount: number): ComputeResultBuffer {
    const byteSize = vertexCount * Float32Array.BYTES_PER_ELEMENT;

    // Storage buffer (GPU read/write)
    const irradianceBuffer = this.device.createBuffer({
      label: 'Solar Irradiance Results',
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    // Staging buffer (GPU → CPU readback)
    const stagingBuffer = this.device.createBuffer({
      label: 'Solar Irradiance Staging',
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    this.allocatedBuffers.push(irradianceBuffer, stagingBuffer);

    const resultBuffer: ComputeResultBuffer = {
      irradianceBuffer,
      stagingBuffer,
      resultArray: new Float32Array(vertexCount),
      dispose: () => {
        irradianceBuffer.destroy();
        stagingBuffer.destroy();
        this.allocatedBuffers = this.allocatedBuffers.filter(
          b => b !== irradianceBuffer && b !== stagingBuffer
        );
      }
    };

    return resultBuffer;
  }

  /**
   * Read compute results back from GPU to CPU
   *
   * Copies data from storage buffer to staging buffer, then maps to CPU.
   *
   * @param buffer Result buffer to read
   * @returns Float32Array with per-vertex irradiance values (Wh/m²)
   */
  public async readResultBuffer(buffer: ComputeResultBuffer): Promise<Float32Array> {
    // Create command encoder for copy operation
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Solar Result Readback'
    });

    // Copy storage → staging buffer
    commandEncoder.copyBufferToBuffer(
      buffer.irradianceBuffer,
      0,
      buffer.stagingBuffer,
      0,
      buffer.resultArray.byteLength
    );

    // Submit copy command
    this.device.queue.submit([commandEncoder.finish()]);

    // Wait for GPU and map staging buffer
    await buffer.stagingBuffer.mapAsync(GPUMapMode.READ);

    // Copy to result array
    const mappedData = new Float32Array(buffer.stagingBuffer.getMappedRange());
    buffer.resultArray.set(mappedData);

    // Unmap staging buffer
    buffer.stagingBuffer.unmap();

    return buffer.resultArray;
  }

  /**
   * Clean up all allocated GPU resources
   *
   * Destroys all buffers and clears cache. Call when done with computations.
   */
  public dispose(): void {
    // Destroy all tracked buffers
    for (const buffer of this.allocatedBuffers) {
      buffer.destroy();
    }
    this.allocatedBuffers = [];

    console.log('🧹 GeometryBufferManager disposed');
  }

  /**
   * Create a GPU storage buffer from Float32Array data
   *
   * @param data Float32Array to upload
   * @param label Debug label for GPU profiling
   * @returns GPU buffer with uploaded data
   */
  private createStorageBuffer(data: Float32Array, label: string): GPUBuffer {
    const buffer = this.device.createBuffer({
      label,
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });

    // Upload data during creation (most efficient)
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();

    this.allocatedBuffers.push(buffer);
    return buffer;
  }

  /**
   * Extract geometry data and transform to world space
   *
   * Applies mesh transform matrices to get actual world positions and normals.
   *
   * @param mesh Mesh with geometry and transform
   * @returns Positions and normals in world space (Float32Arrays)
   */
  private extractGeometryData(mesh: THREE.Mesh): {
    positions: Float32Array;
    normals: Float32Array;
  } {
    const geometry = mesh.geometry;
    const positionAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;

    if (!positionAttr || !normalAttr) {
      throw new Error('Geometry missing position or normal attributes');
    }

    // Update world matrix
    mesh.updateMatrixWorld(true);
    const worldMatrix = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    const vertexCount = positionAttr.count;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);

    // Transform each vertex to world space
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < vertexCount; i++) {
      // Get local position
      vertex.fromBufferAttribute(positionAttr, i);
      // Transform to world space
      vertex.applyMatrix4(worldMatrix);
      // Store
      positions[i * 3] = vertex.x;
      positions[i * 3 + 1] = vertex.y;
      positions[i * 3 + 2] = vertex.z;

      // Get local normal
      normal.fromBufferAttribute(normalAttr, i);
      // Transform to world space
      normal.applyMatrix3(normalMatrix).normalize();
      // Store
      normals[i * 3] = normal.x;
      normals[i * 3 + 1] = normal.y;
      normals[i * 3 + 2] = normal.z;
    }

    return { positions, normals };
  }
}
