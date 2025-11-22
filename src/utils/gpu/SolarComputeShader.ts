/**
 * Solar Compute Shader for GPU-Accelerated Irradiance Calculation
 *
 * Implements WebGPU compute shader for parallel shadow-aware solar irradiance computation.
 * Processes all vertices simultaneously, sampling shadow maps across the day to accumulate
 * total solar energy with occlusion consideration.
 *
 * @module SolarComputeShader
 */

import * as THREE from 'three/webgpu';
import type { BakedShadowData } from './ShadowMapBaker';
import type { GeometryBufferData, ComputeResultBuffer } from './GeometryBufferManager';

/**
 * Compute shader execution options
 */
export interface ComputeOptions {
  /** Diffuse sky irradiance fraction for shadowed areas (default: 0.12 = 12%) */
  diffuseComponent?: number;
  /** Progress callback (current workgroup, total workgroups) */
  onProgress?: (current: number, total: number) => void;
}

/**
 * WebGPU compute shader for shadow-aware solar irradiance
 *
 * Algorithm (executed in parallel per vertex):
 * 1. Read vertex position and normal from storage buffers
 * 2. Loop over sun timesteps (e.g., 96 for 15min intervals):
 *    - Calculate cosine of angle between surface normal and sun direction
 *    - If surface faces sun:
 *      * Project vertex to shadow map space using shadow matrix
 *      * Sample shadow depth texture at projected coordinates
 *      * Compare depths to determine if occluded
 *      * If lit: accumulate full irradiance × cos(θ)
 *      * If shadowed: accumulate diffuse component only
 * 3. Write total accumulated irradiance (Wh/m²) to output buffer
 *
 * Parallelism: 256 threads per workgroup, processes 256 vertices simultaneously
 *
 * @example
 * const compute = new SolarComputeShader(renderer);
 * const results = await compute.execute(geometryData, shadowData, {
 *   diffuseComponent: 0.12,
 *   onProgress: (current, total) => console.log(`${current}/${total}`)
 * });
 */
export class SolarComputeShader {
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;

  /**
   * Workgroup size (number of threads per workgroup)
   * Each thread processes one vertex
   */
  private static readonly WORKGROUP_SIZE = 256;

  /**
   * Create a new solar compute shader
   *
   * @param renderer WebGPU renderer (provides GPU device)
   */
  constructor(renderer: THREE.WebGPURenderer) {
    const backend = renderer.backend as any;
    if (!backend.device) {
      throw new Error('WebGPU device not initialized');
    }
    this.device = backend.device;
  }

  /**
   * Execute compute shader for geometry
   *
   * Runs GPU-accelerated shadow-aware irradiance calculation.
   *
   * @param geometryData Uploaded mesh geometry buffers
   * @param shadowData Baked shadow map timeline
   * @param options Computation parameters
   * @returns Per-vertex irradiance values (Wh/m²)
   */
  public async execute(
    geometryData: GeometryBufferData,
    shadowData: BakedShadowData,
    resultBuffer: ComputeResultBuffer,
    options: ComputeOptions = {}
  ): Promise<Float32Array> {
    const diffuseComponent = options.diffuseComponent ?? 0.12;

    console.log(`⚡ Executing GPU compute shader...`);
    console.log(`   Vertices: ${geometryData.vertexCount}`);
    console.log(`   Timesteps: ${shadowData.timestepCount}`);

    // Create or reuse compute pipeline
    if (!this.pipeline) {
      this.createComputePipeline(shadowData.timestepCount);
    }

    // Create uniform buffer with sun data
    const uniformBuffer = this.createUniformBuffer(shadowData, diffuseComponent);

    // Create bind group
    const bindGroup = this.createBindGroup(
      geometryData,
      resultBuffer,
      uniformBuffer,
      shadowData
    );

    // Execute compute pass
    await this.dispatchCompute(
      geometryData.vertexCount,
      bindGroup,
      options.onProgress
    );

    console.log(`✅ Compute shader execution complete`);

    // Cleanup temporary resources
    uniformBuffer.destroy();

    // Results are in resultBuffer, caller will read them
    return resultBuffer.resultArray;
  }

  /**
   * Create compute pipeline with WGSL shader
   *
   * @param timestepCount Number of sun positions to process
   */
  private createComputePipeline(timestepCount: number): void {
    console.log('🔧 Creating compute pipeline...');

    // Create bind group layout
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Solar Compute Bind Group Layout',
      entries: [
        // 0: Positions (read-only storage)
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' as GPUBufferBindingType }
        },
        // 1: Normals (read-only storage)
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' as GPUBufferBindingType }
        },
        // 2: Results (storage)
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' as GPUBufferBindingType }
        },
        // 3: Uniforms (sun data)
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as GPUBufferBindingType }
        },
        // 4: Shadow sampler (comparison sampler for shadow maps)
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: 'comparison' as GPUSamplerBindingType }
        },
        // 5: Shadow depth texture array
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: 'depth' as GPUTextureSampleType,
            viewDimension: '2d-array' as GPUTextureViewDimension
          }
        }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Solar Compute Pipeline Layout',
      bindGroupLayouts: [this.bindGroupLayout]
    });

    // WGSL Compute Shader
    const shaderCode = this.generateWGSLShader(timestepCount);

    const shaderModule = this.device.createShaderModule({
      label: 'Solar Irradiance Compute Shader',
      code: shaderCode
    });

    this.pipeline = this.device.createComputePipeline({
      label: 'Solar Compute Pipeline',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main'
      }
    });

    console.log('✅ Compute pipeline created');
  }

  /**
   * Generate WGSL shader code
   *
   * Creates compute shader that processes vertices in parallel.
   *
   * @param timestepCount Number of sun timesteps
   * @returns WGSL shader code
   */
  private generateWGSLShader(timestepCount: number): string {
    return `
// Shadow matrix structure (4x4 matrix stored as 4 vec4s)
struct ShadowMatrix {
  row0: vec4<f32>,
  row1: vec4<f32>,
  row2: vec4<f32>,
  row3: vec4<f32>,
}

// Uniform data structure
struct Uniforms {
  timestepCount: u32,
  timestepHours: f32,
  diffuseComponent: f32,
  padding: f32,  // Align to 16 bytes
  sunDirections: array<vec3<f32>, ${timestepCount}>,
  sunIntensities: array<f32, ${timestepCount}>,
  shadowMatrices: array<ShadowMatrix, ${timestepCount}>,
}

// Storage buffers
@group(0) @binding(0) var<storage, read> positions: array<vec3<f32>>;
@group(0) @binding(1) var<storage, read> normals: array<vec3<f32>>;
@group(0) @binding(2) var<storage, read_write> results: array<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

// Shadow map sampling
@group(0) @binding(4) var shadowSampler: sampler_comparison;
@group(0) @binding(5) var shadowMaps: texture_depth_2d_array;

// Helper: Convert ShadowMatrix to mat4x4
fn shadowMatrixToMat4(sm: ShadowMatrix) -> mat4x4<f32> {
  return mat4x4<f32>(sm.row0, sm.row1, sm.row2, sm.row3);
}

// Helper: Sample shadow map with PCF (Percentage Closer Filtering)
fn sampleShadowMap(shadowCoord: vec3<f32>, layer: i32) -> f32 {
  // shadowCoord: xy = UV coordinates [0,1], z = depth to compare
  // layer: which timestep's shadow map to sample

  // Simple single sample (can be enhanced with PCF for softer shadows)
  return textureSampleCompare(
    shadowMaps,
    shadowSampler,
    shadowCoord.xy,
    layer,
    shadowCoord.z
  );
}

// Compute shader entry point
@compute @workgroup_size(${SolarComputeShader.WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let vertexIndex = globalId.x;

  // Bounds check
  if (vertexIndex >= arrayLength(&positions)) {
    return;
  }

  // Read vertex data
  let position = positions[vertexIndex];
  let normal = normals[vertexIndex];

  // Accumulate irradiance across all timesteps
  var totalIrradiance: f32 = 0.0;

  for (var t: u32 = 0u; t < uniforms.timestepCount; t = t + 1u) {
    let sunDir = uniforms.sunDirections[t];
    let sunDNI = uniforms.sunIntensities[t];

    // Lambert's cosine law: I = DNI × cos(θ)
    let cosTheta = max(dot(normal, sunDir), 0.0);

    if (cosTheta > 0.0) {
      // Surface faces sun - check shadow map

      // Project vertex to shadow map space
      let shadowMatrix = shadowMatrixToMat4(uniforms.shadowMatrices[t]);
      let shadowPos = shadowMatrix * vec4<f32>(position, 1.0);

      // Perspective divide and transform to [0,1] range
      var shadowCoord = shadowPos.xyz / shadowPos.w;
      shadowCoord = shadowCoord * 0.5 + 0.5;  // NDC [-1,1] → UV [0,1]
      shadowCoord.y = 1.0 - shadowCoord.y;     // Flip Y for texture coordinates

      // Apply shadow bias to prevent shadow acne
      shadowCoord.z = shadowCoord.z - 0.0005;

      // Sample shadow map (returns 1.0 if lit, 0.0 if shadowed)
      let shadowFactor = sampleShadowMap(shadowCoord, i32(t));

      // Calculate irradiance based on shadow factor
      let directIrradiance = sunDNI * cosTheta;
      let diffuseIrradiance = sunDNI * uniforms.diffuseComponent;

      // Blend between direct (lit) and diffuse (shadowed)
      let effectiveIrradiance = mix(diffuseIrradiance, directIrradiance, shadowFactor);

      // Accumulate energy (Wh/m² = W/m² × hours)
      totalIrradiance = totalIrradiance + (effectiveIrradiance * uniforms.timestepHours);
    } else {
      // Surface faces away from sun - only ambient/diffuse
      let diffuseIrradiance = sunDNI * uniforms.diffuseComponent * 0.5;
      totalIrradiance = totalIrradiance + (diffuseIrradiance * uniforms.timestepHours);
    }
  }

  // Write result
  results[vertexIndex] = totalIrradiance;
}
`;
  }

  /**
   * Create uniform buffer with sun timeline data
   *
   * @param shadowData Baked shadow data
   * @param diffuseComponent Diffuse fraction for shadows
   * @returns GPU uniform buffer
   */
  private createUniformBuffer(
    shadowData: BakedShadowData,
    diffuseComponent: number
  ): GPUBuffer {
    const timestepCount = shadowData.timestepCount;

    // Calculate buffer size
    // Header: 4 floats (timestepCount, timestepHours, diffuseComponent, padding)
    // Sun directions: timestepCount × vec3<f32> (but aligned to vec4 in WGSL)
    // Sun intensities: timestepCount × f32 (packed)
    // Shadow matrices: timestepCount × mat4x4<f32> (16 floats each, stored as 4 vec4s)
    const headerSize = 16; // 4 floats × 4 bytes
    const directionsSize = timestepCount * 16; // vec3 padded to vec4 (16 bytes each)
    const intensitiesSize = timestepCount * 4; // f32 (4 bytes each)
    const matricesSize = timestepCount * 64; // mat4x4 = 16 floats × 4 bytes = 64 bytes each

    // Align intensities to 16-byte boundary before matrices
    const intensitiesPadding = (16 - (intensitiesSize % 16)) % 16;
    const totalSize = headerSize + directionsSize + intensitiesSize + intensitiesPadding + matricesSize;

    // Align total to 16 bytes (required for uniform buffers)
    const alignedSize = Math.ceil(totalSize / 16) * 16;

    // Create buffer
    const buffer = this.device.createBuffer({
      label: 'Solar Uniforms',
      size: alignedSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });

    // Fill buffer
    const mappedData = new Float32Array(buffer.getMappedRange());
    let offset = 0;

    // Header
    mappedData[offset++] = timestepCount;
    mappedData[offset++] = shadowData.timestepHours;
    mappedData[offset++] = diffuseComponent;
    mappedData[offset++] = 0; // padding

    // Sun directions (vec3, but padded to vec4)
    for (let i = 0; i < timestepCount; i++) {
      const dir = shadowData.sunDirections[i];
      mappedData[offset++] = dir.x;
      mappedData[offset++] = dir.y;
      mappedData[offset++] = dir.z;
      mappedData[offset++] = 0; // padding
    }

    // Sun intensities (f32, packed)
    for (let i = 0; i < timestepCount; i++) {
      mappedData[offset++] = shadowData.sunIntensities[i];
    }

    // Padding to align next section to 16 bytes
    const paddingFloats = intensitiesPadding / 4;
    for (let i = 0; i < paddingFloats; i++) {
      mappedData[offset++] = 0;
    }

    // Shadow matrices (4x4 each, stored row-major as 4 vec4s)
    for (let i = 0; i < timestepCount; i++) {
      const matrix = shadowData.shadowMatrices[i];
      const elements = matrix.elements; // Three.js stores column-major

      // Convert column-major to row-major and write as 4 vec4s
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          mappedData[offset++] = elements[col * 4 + row]; // Transpose
        }
      }
    }

    buffer.unmap();

    return buffer;
  }

  /**
   * Create bind group binding buffers to shader
   *
   * @param geometryData Geometry buffers
   * @param resultBuffer Result buffer
   * @param uniformBuffer Uniform buffer
   * @param shadowData Shadow data with textures
   * @returns GPU bind group
   */
  private createBindGroup(
    geometryData: GeometryBufferData,
    resultBuffer: ComputeResultBuffer,
    uniformBuffer: GPUBuffer,
    shadowData: BakedShadowData
  ): GPUBindGroup {
    if (!this.bindGroupLayout) {
      throw new Error('Bind group layout not created');
    }

    // Create comparison sampler for shadow maps
    const shadowSampler = this.device.createSampler({
      label: 'Shadow Comparison Sampler',
      compare: 'less', // Depth comparison function
      magFilter: 'linear',
      minFilter: 'linear'
    });

    // Create texture array view from shadow depth textures
    const shadowTextureView: GPUTextureView = this.createShadowTextureArray(shadowData);

    return this.device.createBindGroup({
      label: 'Solar Compute Bind Group',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: geometryData.positionBuffer } },
        { binding: 1, resource: { buffer: geometryData.normalBuffer } },
        { binding: 2, resource: { buffer: resultBuffer.irradianceBuffer } },
        { binding: 3, resource: { buffer: uniformBuffer } },
        { binding: 4, resource: shadowSampler },
        { binding: 5, resource: shadowTextureView }
      ]
    });
  }

  /**
   * Create a 2D array texture from individual shadow depth textures
   *
   * Creates a proper WebGPU 2D array texture and copies all shadow maps into layers.
   *
   * @param shadowData Baked shadow data
   * @returns Texture view for 2D array
   */
  private createShadowTextureArray(shadowData: BakedShadowData): GPUTextureView {
    const timestepCount = shadowData.timestepCount;

    // Get resolution from first shadow texture
    const firstTexture = shadowData.shadowTextures[0];
    const resolution = firstTexture.image?.width ?? 2048;

    console.log(`📦 Creating shadow texture array: ${resolution}x${resolution} x ${timestepCount} layers`);

    // Create 2D array texture for all shadow maps
    const shadowArrayTexture = this.device.createTexture({
      label: 'Shadow Map Array',
      size: {
        width: resolution,
        height: resolution,
        depthOrArrayLayers: timestepCount
      },
      format: 'depth24plus', // Match Three.js default depth format
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      dimension: '2d'
    });

    // Create command encoder for copying shadow maps
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Shadow Map Copy Commands'
    });

    // Copy each Three.js shadow texture to a layer in the array texture
    // Access the underlying GPUTexture from Three.js WebGPU backend
    for (let i = 0; i < timestepCount; i++) {
      const threeTexture = shadowData.shadowTextures[i];

      // Get the native GPUTexture from Three.js WebGPU backend
      // The texture is stored in the backend's texture cache with a source property
      const textureGPU = (threeTexture as any).source?.data as GPUTexture | undefined;

      if (textureGPU) {
        // Copy from source texture to array texture layer
        commandEncoder.copyTextureToTexture(
          {
            texture: textureGPU,
            mipLevel: 0
          },
          {
            texture: shadowArrayTexture,
            mipLevel: 0,
            origin: { x: 0, y: 0, z: i } // Layer index
          },
          {
            width: resolution,
            height: resolution,
            depthOrArrayLayers: 1
          }
        );
      } else {
        console.warn(`⚠️ Could not access GPUTexture for shadow map ${i}`);
      }
    }

    this.device.queue.submit([commandEncoder.finish()]);

    // Create view for the array texture
    const arrayView = shadowArrayTexture.createView({
      label: 'Shadow Array View',
      dimension: '2d-array',
      arrayLayerCount: timestepCount
    });

    console.log(`✅ Shadow texture array created with ${timestepCount} layers`);

    return arrayView;
  }

  /**
   * Dispatch compute shader execution
   *
   * @param vertexCount Number of vertices to process
   * @param bindGroup Bind group with buffers
   * @param onProgress Progress callback
   */
  private async dispatchCompute(
    vertexCount: number,
    bindGroup: GPUBindGroup,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (!this.pipeline) {
      throw new Error('Compute pipeline not created');
    }

    // Calculate workgroup dispatch size
    const workgroupCount = Math.ceil(vertexCount / SolarComputeShader.WORKGROUP_SIZE);

    console.log(`   Dispatching ${workgroupCount} workgroups (${vertexCount} vertices)`);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Solar Compute Commands'
    });

    // Begin compute pass
    const computePass = commandEncoder.beginComputePass({
      label: 'Solar Irradiance Compute Pass'
    });

    computePass.setPipeline(this.pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Wait for completion
    await this.device.queue.onSubmittedWorkDone();

    if (onProgress) {
      onProgress(workgroupCount, workgroupCount);
    }
  }

  /**
   * Clean up compute pipeline resources
   */
  public dispose(): void {
    this.pipeline = null;
    this.bindGroupLayout = null;
    console.log('🧹 SolarComputeShader disposed');
  }
}
