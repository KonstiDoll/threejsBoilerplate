<template>
    <div class="h-screen w-screen">
        <!-- WebGPU Status Banner -->
        <div
            v-if="webgpuStatus"
            class="absolute top-16 left-4 z-20 p-3 rounded-lg shadow-lg max-w-md"
            :class="webgpuStatus.supported ? 'bg-green-100 text-green-800 border-2 border-green-400' : 'bg-red-100 text-red-800 border-2 border-red-400'"
        >
            <div class="flex items-start gap-2">
                <span class="text-xl">{{ webgpuStatus.supported ? '✅' : '⚠️' }}</span>
                <div>
                    <p class="font-semibold">{{ webgpuStatus.supported ? 'WebGPU Active' : 'WebGPU Unavailable' }}</p>
                    <p class="text-sm">{{ webgpuStatus.message }}</p>
                    <p v-if="webgpuStatus.browserInfo" class="text-xs mt-1 opacity-75">
                        {{ webgpuStatus.browserInfo.name }} {{ webgpuStatus.browserInfo.version }}
                    </p>
                </div>
            </div>
        </div>

        <!-- Solar Simulation Controls -->
        <div class="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg max-w-sm">
            <h3 class="font-bold text-lg mb-3 text-gray-800">☀️ Solar Simulation</h3>

            <!-- Location -->
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <input
                            v-model.number="solarConfig.latitude"
                            @change="updateLocation"
                            type="number"
                            step="0.1"
                            min="-90"
                            max="90"
                            class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="Latitude"
                        />
                        <span class="text-xs text-gray-500">Latitude (°N)</span>
                    </div>
                    <div>
                        <input
                            v-model.number="solarConfig.longitude"
                            @change="updateLocation"
                            type="number"
                            step="0.1"
                            min="-180"
                            max="180"
                            class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="Longitude"
                        />
                        <span class="text-xs text-gray-500">Longitude (°E)</span>
                    </div>
                </div>
            </div>

            <!-- Date -->
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                    v-model="solarConfig.date"
                    @change="updateSunPosition"
                    type="date"
                    class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <!-- Time -->
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">Time: {{ solarConfig.time }}</label>
                <input
                    v-model="solarConfig.time"
                    @input="updateSunPosition"
                    type="range"
                    min="0"
                    max="23.99"
                    step="0.25"
                    class="w-full"
                    :disabled="visualizationMode === 'cumulative'"
                    :class="{ 'opacity-50 cursor-not-allowed': visualizationMode === 'cumulative' }"
                />
                <div class="flex justify-between text-xs text-gray-500">
                    <span>00:00</span>
                    <span>12:00</span>
                    <span>23:59</span>
                </div>
            </div>

            <!-- Visualization Mode Badge & Toggle -->
            <div class="mb-3 flex items-center justify-between gap-2">
                <span class="text-xs font-medium px-2 py-1 rounded"
                    :class="visualizationMode === 'realtime' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'">
                    {{ visualizationMode === 'realtime' ? '⏱️ Real-time Mode' : '📊 Cumulative Mode' }}
                </span>
                <button
                    @click="toggleVisualizationMode"
                    class="text-xs px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                >
                    {{ visualizationMode === 'realtime' ? 'Show Cumulative' : 'Show Real-time' }}
                </button>
            </div>

            <!-- Sun Position Display -->
            <div v-if="solarPosition && visualizationMode === 'realtime'" class="mb-3 p-2 bg-blue-50 rounded text-sm">
                <div class="flex justify-between mb-1">
                    <span class="text-gray-600">Azimuth:</span>
                    <span class="font-mono">{{ solarPosition.azimuthDeg.toFixed(1) }}°</span>
                </div>
                <div class="flex justify-between mb-1">
                    <span class="text-gray-600">Altitude:</span>
                    <span class="font-mono">{{ solarPosition.altitudeDeg.toFixed(1) }}°</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Irradiance:</span>
                    <span class="font-mono">{{ solarPosition.irradiance.toFixed(0) }} W/m²</span>
                </div>
                <div class="mt-2 text-xs" :class="solarPosition.isAboveHorizon ? 'text-green-600' : 'text-red-600'">
                    {{ solarPosition.isAboveHorizon ? '☀️ Sun is above horizon' : '🌙 Sun is below horizon' }}
                </div>
            </div>

            <!-- Daily Simulation -->
            <div class="mb-3">
                <button
                    @click="simulateDay"
                    :disabled="isSimulating"
                    class="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {{ isSimulating ? 'Simulating...' : '📊 Simulate Full Day' }}
                </button>
            </div>

            <!-- Daily Results -->
            <div v-if="dailyAnalysis" class="p-2 bg-green-50 rounded text-sm">
                <h4 class="font-semibold mb-2 text-gray-800">Daily Analysis</h4>
                <div class="flex justify-between mb-1">
                    <span class="text-gray-600">Sunrise:</span>
                    <span class="font-mono">{{ formatTime(dailyAnalysis.sunrise) }}</span>
                </div>
                <div class="flex justify-between mb-1">
                    <span class="text-gray-600">Sunset:</span>
                    <span class="font-mono">{{ formatTime(dailyAnalysis.sunset) }}</span>
                </div>
                <div class="flex justify-between mb-1">
                    <span class="text-gray-600">Day Length:</span>
                    <span class="font-mono">{{ dailyAnalysis.dayLength.toFixed(1) }}h</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600">Total Energy:</span>
                    <span class="font-mono">{{ (dailyAnalysis.totalIrradiance / 1000).toFixed(2) }} kWh/m²</span>
                </div>
            </div>

            <!-- Presets -->
            <div class="mt-3 pt-3 border-t border-gray-200">
                <label class="block text-sm font-medium text-gray-700 mb-2">Quick Presets</label>
                <div class="grid grid-cols-2 gap-2">
                    <button @click="setPreset('berlin')" class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                        📍 Berlin
                    </button>
                    <button @click="setPreset('london')" class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                        📍 London
                    </button>
                    <button @click="setPreset('newyork')" class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                        📍 New York
                    </button>
                    <button @click="setPreset('sydney')" class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                        📍 Sydney
                    </button>
                </div>
            </div>
        </div>

        <div ref='threejsMap' />
    </div>
</template>
<script setup lang="ts">
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onMounted, ref, watch } from 'vue';
import { Tween, Group, Easing } from '@tweenjs/tween.js';
import { createSolarBatchedMesh, createSolarCube, createSolarPlane, switchMaterialMode } from '../utils/geometryGenerator.ts'
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { detectWebGPU, type WebGPUDetectionResult } from '../utils/webgpuDetector';
import { SolarSimulator, type DailySolarAnalysis } from '../utils/solarSimulation';

const props = defineProps({
    cubeJump: {
        type: Boolean,
        default: false
    }
})

// Solar Simulation State
const solarConfig = ref({
    latitude: 52.52,  // Berlin default
    longitude: 13.405,
    date: new Date().toISOString().split('T')[0], // Today
    time: 12.0 // Noon
});

const solarPosition = ref<{
    azimuthDeg: number;
    altitudeDeg: number;
    irradiance: number;
    isAboveHorizon: boolean;
} | null>(null);

const dailyAnalysis = ref<DailySolarAnalysis | null>(null);
const isSimulating = ref(false);
const visualizationMode = ref<'realtime' | 'cumulative'>('realtime');

// Initialize Solar Simulator
const solarSimulator = new SolarSimulator({
    latitude: solarConfig.value.latitude,
    longitude: solarConfig.value.longitude
});

const tweenGroup = new Group();
// Create a scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff8de1);
// Add a directional light (will be controlled by solar simulator)
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(0, 10, 0); // Initial position (will be updated)
scene.add(directionalLight);

// Add an ambient light (softer to let sun dominate)
const ambientLight = new THREE.AmbientLight(0x404040, 3); // Reduced ambient
scene.add(ambientLight);

// Create solar-aware geometries
const cube = createSolarCube(solarSimulator);
scene.add(cube);
const plane = createSolarPlane(solarSimulator);
scene.add(plane);
const batchedMesh = createSolarBatchedMesh(solarSimulator);
scene.add(batchedMesh);


// Create a camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Create a WebGPU renderer (async initialization)
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping

// Enable shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;

cube.castShadow = true;
plane.receiveShadow = true;
batchedMesh.castShadow = true;

// Create controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Add TransformControls
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.attach(cube); // Attach to the cube initially
const gizmo = transformControls.getHelper();
scene.add(gizmo);

// Handle interaction between orbit controls and transform controls
transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value; // Disable orbit controls when transforming
});

// Optional: Add key controls to switch transform modes
window.addEventListener('keydown', (event) => {
    switch (event.key) {
        case 'g': // translate
            transformControls.setMode('translate');
            break;
        case 'r': // rotate
            transformControls.setMode('rotate');
            break;
        case 's': // scale
            transformControls.setMode('scale');
            break;
    }
});

const threejsMap = ref<Node>()
const isInitialized = ref(false)
const webgpuStatus = ref<WebGPUDetectionResult | null>(null)

const domElement = renderer.domElement;

onMounted(async () => {
    try {
        // Detect WebGPU support
        const detection = await detectWebGPU();
        webgpuStatus.value = detection;

        if (!detection.supported) {
            console.warn('WebGPU not supported:', detection.message);
            // Auto-hide warning after 8 seconds
            setTimeout(() => {
                webgpuStatus.value = null;
            }, 8000);
            return;
        }

        // Initialize WebGPU renderer
        await renderer.init();
        isInitialized.value = true;

        threejsMap.value?.appendChild(domElement);

        window.addEventListener("resize", setSize);
        setSize();

        // Use setAnimationLoop for WebGPU
        renderer.setAnimationLoop(animate);

        // Initialize sun position
        updateSunPosition();

        // Auto-hide success message after 5 seconds
        setTimeout(() => {
            webgpuStatus.value = null;
        }, 5000);
    } catch (error) {
        console.error('WebGPU initialization failed:', error);
        webgpuStatus.value = {
            supported: false,
            message: `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
})

const setSize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
};

// Render the scene (called by setAnimationLoop)
function animate() {
    renderer.render(scene, camera);
    controls.update();
    tweenGroup.update();
}

watch(() => props.cubeJump, (newVal) => {
    if (newVal) {
        // Create new tweens each time with current position values
        const startY = cube.position.y;
        const jumpHeight = 2;

        const jumpTween = new Tween({ y: startY })
            .to({ y: startY + jumpHeight }, 500)
            .easing(Easing.Quartic.Out)
            .onUpdate((object) => {
                cube.position.y = object.y;
            })
            .onComplete(() => {
                // Create fall tween when jump completes
                const fallTween = new Tween({ y: startY + jumpHeight })
                    .to({ y: startY }, 1000)
                    .easing(Easing.Bounce.Out)
                    .onUpdate((object) => {
                        cube.position.y = object.y;
                    });

                tweenGroup.add(fallTween);
                fallTween.start();
            });

        tweenGroup.add(jumpTween);
        jumpTween.start();
    }
})

// Solar Simulation Functions
function updateSunPosition() {
    // Create date from config
    const [year, month, day] = solarConfig.value.date.split('-').map(Number);
    const hours = Math.floor(solarConfig.value.time);
    const minutes = Math.round((solarConfig.value.time - hours) * 60);

    const date = new Date(year, month - 1, day, hours, minutes);

    // Update solar simulator
    const position = solarSimulator.updateSunPosition(date);

    // Update UI state
    solarPosition.value = {
        azimuthDeg: SolarSimulator.radToDeg(position.azimuth),
        altitudeDeg: SolarSimulator.radToDeg(position.altitude),
        irradiance: position.irradiance,
        isAboveHorizon: position.isAboveHorizon
    };

    // Update directional light to match sun position
    const sunDistance = 50; // Distance from origin
    directionalLight.position.copy(position.direction.clone().multiplyScalar(sunDistance));

    // Adjust light intensity based on sun altitude
    if (position.isAboveHorizon) {
        directionalLight.intensity = position.irradiance / 1000; // Scale to reasonable value
    } else {
        directionalLight.intensity = 0;
    }
}

function updateLocation() {
    solarSimulator.updateLocation({
        latitude: solarConfig.value.latitude,
        longitude: solarConfig.value.longitude
    });
    updateSunPosition();
    // Reset daily analysis when location changes
    dailyAnalysis.value = null;
}

async function simulateDay() {
    if (isSimulating.value) return;

    isSimulating.value = true;
    dailyAnalysis.value = null;

    try {
        const [year, month, day] = solarConfig.value.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        // Run daily analysis for horizontal surface
        const analysis = await solarSimulator.analyzeDailySolarExposure(date);
        dailyAnalysis.value = analysis;

        // Compute cumulative irradiance for horizontal surface (ground plane)
        const horizontalNormal = new THREE.Vector3(0, 1, 0);
        const cumulativeValue = await solarSimulator.computeCumulativeSurfaceIrradiance(
            date,
            horizontalNormal
        );

        // Update cumulative uniform for shader
        solarSimulator.cumulativeIrradiance.value = cumulativeValue;

        console.log('Daily Solar Analysis:', {
            ...analysis,
            cumulativeHorizontal: `${cumulativeValue.toFixed(0)} Wh/m²`
        });

        // Switch to cumulative visualization mode
        switchToCumulativeMode();
    } catch (error) {
        console.error('Daily simulation failed:', error);
        alert(`Simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        isSimulating.value = false;
    }
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function setPreset(location: string) {
    const presets: Record<string, { lat: number; lon: number; name: string }> = {
        berlin: { lat: 52.52, lon: 13.405, name: 'Berlin, Germany' },
        london: { lat: 51.5074, lon: -0.1278, name: 'London, UK' },
        newyork: { lat: 40.7128, lon: -74.0060, name: 'New York, USA' },
        sydney: { lat: -33.8688, lon: 151.2093, name: 'Sydney, Australia' }
    };

    const preset = presets[location];
    if (preset) {
        solarConfig.value.latitude = preset.lat;
        solarConfig.value.longitude = preset.lon;
        updateLocation();
        console.log(`Location set to: ${preset.name}`);
    }
}

// Visualization Mode Switching
function switchToCumulativeMode() {
    visualizationMode.value = 'cumulative';

    console.log('Switching to CUMULATIVE mode...', {
        cumulativeValue: solarSimulator.cumulativeIrradiance.value,
        mode: 'cumulative'
    });

    // Switch all meshes to cumulative material
    switchMaterialMode(cube as THREE.Mesh, solarSimulator, 'cumulative', new THREE.Color(0x70f39e));
    switchMaterialMode(plane as THREE.Mesh, solarSimulator, 'cumulative', new THREE.Color(0xa492f7));
    switchMaterialMode(batchedMesh as THREE.Mesh, solarSimulator, 'cumulative');

    console.log('✅ Switched to CUMULATIVE mode - showing daily accumulated Wh/m²');
}

function switchToRealtimeMode() {
    visualizationMode.value = 'realtime';

    // Switch all meshes back to real-time material
    switchMaterialMode(cube as THREE.Mesh, solarSimulator, 'realtime', new THREE.Color(0x70f39e));
    switchMaterialMode(plane as THREE.Mesh, solarSimulator, 'realtime', new THREE.Color(0xa492f7));
    switchMaterialMode(batchedMesh as THREE.Mesh, solarSimulator, 'realtime');

    // Update sun position for current time
    updateSunPosition();

    console.log('Switched to REALTIME mode - showing instantaneous W/m²');
}

function toggleVisualizationMode() {
    if (visualizationMode.value === 'realtime') {
        // Can only switch to cumulative if simulation was run
        if (dailyAnalysis.value) {
            switchToCumulativeMode();
        } else {
            alert('Please run "Simulate Full Day" first to see cumulative data');
        }
    } else {
        switchToRealtimeMode();
    }
}

</script>
<style scoped></style>