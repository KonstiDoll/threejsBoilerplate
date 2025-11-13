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

        <div ref='threejsMap' />
    </div>
</template>
<script setup lang="ts">
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onMounted, ref, watch } from 'vue';
import { Tween, Group, Easing } from '@tweenjs/tween.js';
import { createBatchedMesh, createCube, createPlane } from '../utils/geometryGenerator.ts'
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { detectWebGPU, type WebGPUDetectionResult } from '../utils/webgpuDetector';

const props = defineProps({
    cubeJump: {
        type: Boolean,
        default: false
    }
})
const tweenGroup = new Group();
// Create a scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff8de1);
// Add a directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
directionalLight.position.set(-2, 5, 4);
scene.add(directionalLight);

// Add an ambient light
const ambientLight = new THREE.AmbientLight(0x404040, 10); // Soft white light
scene.add(ambientLight);

const cube = createCube();
scene.add(cube);
const plane = createPlane();
scene.add(plane);
const batchedMesh = createBatchedMesh();
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

</script>
<style scoped></style>